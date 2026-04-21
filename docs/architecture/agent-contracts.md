# AgentForge Agent Contracts

Every agent in AgentForge is defined by a YAML contract. This document specifies the contract schema, lifecycle, and examples.

## Contract Schema

```yaml
# <agent-role>.yaml
role: string                    # Unique agent role identifier
description: string             # What this agent does
category: "design" | "spec" | "code" | "cicd" | "observe" | "research"

# LLM Configuration
provider: string                # e.g., "claude-sonnet-4-6" (overrides project default)
execution:
  mode: "stream" | "complete"   # Streaming for progress visibility, complete for simple tasks
  progress_events: boolean      # Emit progress to HITL channels during execution
  max_context_tokens: number    # Max tokens for context injection (prevent overflow)

# Tool Access
tools: string[]                 # MCP tool references: ["figma_mcp.get_code", "github_mcp.create_pr"]

# Permissions (least-privilege)
permissions: string[]           # Allowed actions
  # read_spec, write_spec, read_design, write_design,
  # read_code, write_code, read_design_system,
  # create_branch, create_pr, merge_pr,
  # trigger_ci, read_ci_logs,
  # deploy_staging, deploy_production,
  # send_notification
denied: string[]                # Explicit denials (override inherited permissions)

# HITL Policy
hitl_policy: HITLLevel          # full_approval | review_and_override | notify_only | fully_autonomous

# Budget
budget:
  max_tokens_per_task: number   # Token limit per individual task execution
  max_cost_per_task_usd: number # USD limit per task

# Lifecycle Events
on_complete: string             # Event to emit: "emit(DesignPhaseComplete)"
on_error: string                # Error behavior: "notify_human + pause" | "retry" | "escalate"

# Context Injection
context:
  spec_sections: string[]       # Which spec files to inject: ["components/dashboard.yaml"]
  include_learnings: boolean    # Inject agent learnings file
  include_adrs: boolean         # Inject Architecture Decision Records
  include_conventions: boolean  # Inject stack conventions from config.yaml
```

## Agent Lifecycle

```
1. PENDING     -> Task assigned by orchestrator
2. INITIALIZING -> Agent contract loaded, context assembled
3. PERMISSION_CHECK -> Governance validates permissions
4. BUDGET_CHECK -> Governance validates budget availability
5. HITL_CHECK   -> Governance enforces HITL policy (may pause here)
6. EXECUTING   -> LLM call in progress (streaming or complete)
7. SELF_TEST   -> Agent validates its own output (if applicable)
8. CI_WAITING  -> Code pushed, waiting for GitHub Actions (code agents only)
9. REVIEW      -> PR created, awaiting review (code agents only)
10. COMPLETE   -> Event emitted, task marked done
```

Error states:
- `FAILED` -> Max retries exceeded, human escalation required
- `ABORTED` -> Manual abort via `agentforge abort`
- `BUDGET_EXCEEDED` -> Budget limit hit mid-execution

## Phase 1 Agent Definitions

### Design Agents

```yaml
# agents/design/ux-researcher.yaml
role: ux_researcher
description: Analyzes design requests against spec, identifies data models, suggests layout patterns
category: design
provider: claude-sonnet-4-6
execution:
  mode: complete
  progress_events: false
tools: [figma_mcp.get_metadata]
permissions: [read_spec, read_design, read_design_system]
denied: [write_code, deploy_staging, deploy_production, merge_pr]
hitl_policy: notify_only
budget:
  max_tokens_per_task: 20000
  max_cost_per_task_usd: 0.50
on_complete: "emit(UXResearchComplete)"
on_error: "notify_human + pause"
context:
  spec_sections: ["project.yaml", "pages.yaml"]
  include_learnings: true
  include_adrs: true
  include_conventions: true
```

```yaml
# agents/design/wireframe-generator.yaml
role: wireframe_generator
description: Generates low-fidelity wireframes in Figma with auto-layout
category: design
provider: claude-sonnet-4-6
execution:
  mode: stream
  progress_events: true
tools: [figma_mcp.get_code, figma_mcp.generate_figma_design, storybook.preview]
permissions: [read_spec, write_design, read_design_system]
denied: [write_code, deploy_staging, deploy_production, merge_pr]
hitl_policy: full_approval
budget:
  max_tokens_per_task: 50000
  max_cost_per_task_usd: 2.00
on_complete: "emit(WireframeComplete)"
on_error: "notify_human + pause"
context:
  spec_sections: ["components/*.yaml"]
  include_learnings: true
  include_adrs: false
  include_conventions: true
```

```yaml
# agents/design/visual-designer.yaml
role: visual_designer
description: Applies design system tokens to approved wireframes, transforming low-fidelity into high-fidelity visual designs
category: design
provider: claude-sonnet-4-6
execution:
  mode: stream
  progress_events: true
tools: [figma_mcp.get_code, figma_mcp.generate_figma_design, figma_mcp.get_variables]
permissions: [read_spec, read_design, write_design, read_design_system]
denied: [write_code, deploy_staging, deploy_production, merge_pr]
hitl_policy: review_and_override
budget:
  max_tokens_per_task: 50000
  max_cost_per_task_usd: 2.00
on_complete: "emit(VisualDesignComplete)"
on_error: "notify_human + pause"
context:
  spec_sections: ["components/*.yaml"]
  include_learnings: true
  include_adrs: false
  include_conventions: true
```

```yaml
# agents/design/design-reviewer.yaml
role: design_reviewer
description: Validates designs for accessibility, responsiveness, and design system compliance
category: design
provider: claude-sonnet-4-6
execution:
  mode: complete
  progress_events: false
tools: [figma_mcp.get_code, figma_mcp.get_metadata]
permissions: [read_spec, read_design, read_design_system]
denied: [write_code, write_design, deploy_staging, deploy_production, merge_pr]
hitl_policy: notify_only
budget:
  max_tokens_per_task: 30000
  max_cost_per_task_usd: 1.00
on_complete: "emit(DesignReviewComplete)"
on_error: "notify_human + pause"
context:
  spec_sections: ["components/*.yaml", "project.yaml"]
  include_learnings: true
  include_adrs: false
  include_conventions: true
```

### Spec & Planning Agents

```yaml
# agents/spec/spec-writer.yaml
role: spec_writer
description: Generates component specs, API specs, data model specs, and ADRs from finalized design output
category: spec
provider: claude-opus-4-6
execution:
  mode: complete
  progress_events: false
  max_context_tokens: 100000
tools: [figma_mcp.get_code, figma_mcp.get_metadata]
permissions: [read_spec, write_spec, read_design]
denied: [write_code, write_design, deploy_staging, deploy_production, merge_pr]
hitl_policy: review_and_override
budget:
  max_tokens_per_task: 80000
  max_cost_per_task_usd: 5.00
on_complete: "emit(SpecComplete)"
on_error: "notify_human + pause"
context:
  spec_sections: ["project.yaml", "pages.yaml", "components/*.yaml", "api.yaml", "models.yaml"]
  include_learnings: true
  include_adrs: true
  include_conventions: true
```

```yaml
# agents/spec/task-decomposer.yaml
role: task_decomposer
description: Breaks completed specs into atomic, independently implementable tasks with dependency ordering
category: spec
provider: claude-sonnet-4-6
execution:
  mode: complete
  progress_events: false
tools: []
permissions: [read_spec, write_tasks]
denied: [write_code, write_design, deploy_staging, deploy_production, merge_pr]
hitl_policy: review_and_override
budget:
  max_tokens_per_task: 40000
  max_cost_per_task_usd: 1.50
on_complete: "emit(TasksCreated)"
on_error: "notify_human + pause"
context:
  spec_sections: ["components/*.yaml", "api.yaml", "models.yaml"]
  include_learnings: true
  include_adrs: true
  include_conventions: true
```

### Code Generation Agents

```yaml
# agents/code/frontend-coder.yaml
role: frontend_coder
description: Generates React components from spec + Figma context
category: code
provider: claude-sonnet-4-6
execution:
  mode: stream
  progress_events: true
tools: [figma_mcp.get_code, github_mcp.create_branch, github_mcp.push_files]
permissions: [read_spec, read_design, read_code, write_code, create_branch, trigger_ci]
denied: [deploy_staging, deploy_production, merge_pr, write_design]
hitl_policy: review_and_override
budget:
  max_tokens_per_task: 80000
  max_cost_per_task_usd: 3.00
on_complete: "emit(CodeGenComplete)"
on_error: "retry(max=3) then notify_human + pause"
context:
  spec_sections: ["components/<page>.yaml", "api.yaml", "models.yaml"]
  include_learnings: true
  include_adrs: true
  include_conventions: true
```

```yaml
# agents/code/backend-coder.yaml
role: backend_coder
description: Generates API endpoints, business logic, data access layers, and Prisma migrations
category: code
provider: claude-sonnet-4-6
execution:
  mode: stream
  progress_events: true
tools: [github_mcp.create_branch, github_mcp.push_files, github_mcp.read_file]
permissions: [read_spec, read_code, write_code, create_branch, trigger_ci]
denied: [read_design, deploy_staging, deploy_production, merge_pr, write_design]
hitl_policy: review_and_override
budget:
  max_tokens_per_task: 80000
  max_cost_per_task_usd: 3.00
on_complete: "emit(CodeGenComplete)"
on_error: "retry(max=3) then notify_human + pause"
context:
  spec_sections: ["api.yaml", "models.yaml"]
  include_learnings: true
  include_adrs: true
  include_conventions: true
```

```yaml
# agents/code/test-writer.yaml
role: test_writer
description: Generates unit, integration, and e2e tests from specs
category: code
provider: claude-sonnet-4-6
execution:
  mode: stream
  progress_events: true
tools: [github_mcp.read_file, github_mcp.push_files]
permissions: [read_spec, read_code, write_code, create_branch, trigger_ci]
denied: [deploy_staging, deploy_production, merge_pr, write_design]
hitl_policy: notify_only
budget:
  max_tokens_per_task: 60000
  max_cost_per_task_usd: 2.00
on_complete: "emit(TestsComplete)"
on_error: "retry(max=3) then notify_human + pause"
context:
  spec_sections: ["components/<page>.yaml", "api.yaml"]
  include_learnings: true
  include_adrs: false
  include_conventions: true
```

```yaml
# agents/code/pr-reviewer.yaml
role: pr_reviewer
description: Reviews generated code for quality, security, architecture compliance
category: code
provider: claude-haiku-4-5
execution:
  mode: complete
  progress_events: false
tools: [github_mcp.read_pr, github_mcp.create_review]
permissions: [read_spec, read_code, read_design]
denied: [write_code, deploy_staging, deploy_production, merge_pr, write_design]
hitl_policy: review_and_override
budget:
  max_tokens_per_task: 30000
  max_cost_per_task_usd: 0.50
on_complete: "emit(ReviewComplete)"
on_error: "notify_human + pause"
context:
  spec_sections: ["components/<page>.yaml", "api.yaml"]
  include_learnings: true
  include_adrs: true
  include_conventions: true
```

### CI/CD Agents

```yaml
# agents/cicd/build-agent.yaml
role: build_agent
description: Monitors CI failures, analyzes error logs, generates fixes for known patterns
category: cicd
provider: claude-haiku-4-5
execution:
  mode: complete
  progress_events: false
tools: [github_mcp.read_file, github_mcp.push_files, github_mcp.trigger_workflow]
permissions: [read_code, write_code, read_ci_logs, trigger_ci, create_branch]
denied: [read_design, write_design, deploy_staging, deploy_production, merge_pr]
hitl_policy: fully_autonomous
budget:
  max_tokens_per_task: 30000
  max_cost_per_task_usd: 0.50
on_complete: "emit(BuildFixComplete)"
on_error: "retry(max=3) then notify_human + pause"
context:
  spec_sections: []
  include_learnings: true
  include_adrs: false
  include_conventions: true
```

```yaml
# agents/cicd/security-scanner.yaml
role: security_scanner
description: Runs SAST scans on every PR, categorizes findings by severity, blocks critical issues
category: cicd
provider: claude-sonnet-4-6
execution:
  mode: complete
  progress_events: false
tools: [github_mcp.read_pr, github_mcp.create_review]
permissions: [read_spec, read_code]
denied: [write_code, write_design, deploy_staging, deploy_production, merge_pr]
hitl_policy: notify_only
budget:
  max_tokens_per_task: 40000
  max_cost_per_task_usd: 1.50
on_complete: "emit(SecurityScanComplete)"
on_error: "notify_human + pause"
context:
  spec_sections: ["api.yaml", "models.yaml"]
  include_learnings: true
  include_adrs: false
  include_conventions: true
```

```yaml
# agents/cicd/deploy-agent.yaml
role: deploy_agent
description: Manages deployment to staging (Phase 1) and production (Phase 2+), monitors post-deploy health
category: cicd
provider: claude-haiku-4-5
execution:
  mode: complete
  progress_events: true
tools: [github_mcp.trigger_workflow, github_mcp.read_file]
permissions: [read_code, read_ci_logs, trigger_ci, deploy_staging]
denied: [write_code, write_design, deploy_production, merge_pr]
hitl_policy: review_and_override
budget:
  max_tokens_per_task: 20000
  max_cost_per_task_usd: 0.50
on_complete: "emit(DeployComplete)"
on_error: "notify_human + pause"
context:
  spec_sections: []
  include_learnings: true
  include_adrs: false
  include_conventions: false
```

## Adding a New Agent

1. Create the YAML contract file in `agents/<category>/<role>.yaml`
2. Implement the agent logic following the `AgentRuntime.executeAgent` interface
3. Register the agent in the project manifest
4. Write tests that verify: permissions are checked, budget is enforced, HITL is triggered, events are emitted
5. Add to the package's index.ts barrel export
