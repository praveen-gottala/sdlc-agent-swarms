> **EVALUATION STATUS: Pending Review**
> - **What it contains:** Living Spec structure (project.yaml, pages.yaml, components/*.yaml), task state YAML, agent learnings, trust state, locking strategy
> - **Why flagged:** PRD v2.0 Section 8 is the authoritative data model spec per CLAUDE.md. This doc predates it with overlapping content.
> - **Counter-argument:** Documents YAML schema details that PRD v2.0 may not cover at the same depth (file-by-file field listings). Could serve as a "practical schema guide."
> - **Recommendation:** Keep if PRD v2.0 doesn't cover schema details; delete if it does.

# AgentForge Data Model

Three core data structures. All YAML, all version-controlled, all in the repo.

## 1. Project Manifest (agentforge.yaml)

Lives at repo root. Created once by `agentforge init`. Describes HOW AgentForge manages the project.

### Full Schema

```yaml
version: "1.0"                    # Schema version (for migrations)

project:
  name: string                    # Human-readable project name
  id: string                      # Generated unique ID (proj_xxxxx)
  description: string             # Brief description
  platforms: ["web"]              # Phase 1: web only
  stack:
    frontend: "react"             # Phase 1: react only
    backend: "node"               # Phase 1: node only
    database: "postgresql"        # Phase 1: postgresql only
    styling: "tailwind" | "css-modules"
  repo:
    provider: "github" | "gitlab"
    org: string
    name: string
    default_branch: "main"

agents:
  providers:
    default: string               # e.g., "claude-sonnet-4-6"
    overrides:                    # Per-role provider overrides
      architecture: string        # e.g., "claude-opus-4-6"
      code_review: string
      test_generation: string
      scaffolding: string         # e.g., "ollama/codellama"
  sandbox:
    type: "github_actions"        # Phase 1: only option
    timeout_minutes: number       # Default: 15
    max_retries: number           # Default: 3

orchestration:
  max_concurrent_agents: number   # Default: 3
  ci_wait_strategy: "spawn_next"  # Spawn new agent for next task while waiting

hitl:
  default: HITLLevel              # Default policy for unlisted phases
  overrides:
    design: HITLLevel
    spec_review: HITLLevel
    code_generation: HITLLevel
    test_generation: HITLLevel
    staging_deploy: HITLLevel
    production_deploy: HITLLevel
    observability: HITLLevel
  channels:
    - type: "slack" | "telegram" | "cli"
      capabilities: "full" | "approvals" | "basic"
      priority: number            # Lower = higher priority
      config:                     # Channel-specific config
        workspace?: string        # Slack workspace
        channel?: string          # Slack channel
        chat_id?: string          # Telegram chat ID
  routing:
    approval_requests: "all" | "primary"
    status_updates: "all" | "primary"
    critical_alerts: "all"        # Always all
  escalation:
    timeout_minutes: number       # Default: 60
    on_timeout: "pause_and_notify"

budget:
  per_task_max_usd: number        # Default: 2.00
  per_phase_max_usd: number       # Default: 25.00
  monthly_max_usd: number         # Default: 200.00
  alert_threshold: number         # Default: 0.8 (80%)

design:
  tool: "figma" | "storybook" | "none"
  file_id?: string                # Populated after design phase starts
  design_system: "tailwind" | "custom"
  fallback: "storybook"

progressive_trust:
  enabled: boolean                # Default: false. Opt-in only.
  threshold: number               # Default: 20. Consecutive approvals before escalation.
  max_level: HITLLevel            # Default: "notify_only". Never auto-escalate beyond this.

mcp:
  - name: string
    uri: string
    auth?: string                 # Vault reference
    rate_limit?: number           # Requests per minute. Default: 60.
```

### HITLLevel enum

```
"full_approval"      # Agent proposes, human must approve
"review_and_override"# Agent acts, human can override within window
"notify_only"        # Agent acts, human notified after
"fully_autonomous"   # Agent acts, no notification. Audit log only.
```

## 2. Living Spec (Split Per-Module)

### Directory Structure

```
agentforge/
  spec/
    project.yaml              # App metadata, ADRs
    pages.yaml                # Page list with routes and status
    components/
      <page-name>.yaml        # Components per page
    api.yaml                  # All API endpoint definitions
    models.yaml               # All data model definitions
```

### project.yaml Schema

```yaml
version: "1.0"
last_updated: ISO8601
last_updated_by: string       # "agent:<role>" or "human:<name>"

app:
  name: string
  description: string
  target_users: string

adrs:
  - id: string                # adr_001, adr_002, etc.
    title: string
    status: "proposed" | "accepted" | "deprecated" | "superseded"
    decided_by: string        # "human:<name>" or "agent:<role>"
    date: ISO8601
    context: string
    decision: string
    consequences?: string
```

### pages.yaml Schema

```yaml
version: "1.0"

pages:
  - id: string                # page_dashboard, page_settings, etc.
    name: string
    route: string             # /dashboard, /settings, etc.
    status: "designing" | "designed" | "specced" | "coded" | "tested" | "deployed"
    design_ref?: string       # figma://file_id/node_id
    auth_required: boolean
    layout?: string           # "default" | "sidebar" | "fullwidth"
```

### components/<page>.yaml Schema

```yaml
version: "1.0"
page_id: string               # References pages.yaml
last_updated: ISO8601
last_updated_by: string

components:
  - id: string                # comp_revenue_chart
    name: string              # PascalCase: RevenueChart
    type: string              # data_visualization | form | list | layout | etc.
    status: "designed" | "specced" | "coded" | "tested" | "deployed"
    design_ref?: string       # figma://file_id/node_id
    props:
      - name: string
        type: string          # TypeScript type
        required: boolean
        default?: any
    state?: 
      - name: string
        type: string
        initial?: any
    data_source?: string      # "api:GET /api/revenue" or "local"
    children?: string[]       # Child component IDs
    behavior?:
      - trigger: string       # "onClick" | "onMount" | etc.
        action: string        # Description of behavior
```

### api.yaml Schema

```yaml
version: "1.0"
base_url: string              # /api

endpoints:
  - id: string                # ep_get_revenue
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
    path: string              # /revenue
    description?: string
    query_params?:
      - name: string
        type: string
        required: boolean
        format?: string
    body?:
      type: string            # TypeScript type or schema ref
      schema_ref?: string
    response:
      type: string
      schema_ref?: string
    auth: "required" | "optional" | "none"
    status: "specced" | "coded" | "tested" | "deployed"
    rate_limit?: string       # "100/min"
```

### models.yaml Schema

```yaml
version: "1.0"

models:
  - id: string                # model_revenue
    name: string              # PascalCase: RevenueDataPoint
    description?: string
    fields:
      - name: string
        type: string          # DateTime | String | Decimal | UUID | Int | Boolean | JSON
        primary?: boolean
        nullable?: boolean     # Default: true
        unique?: boolean
        default?: any
        foreign_key?: string  # "table.field"
        enum?: string[]
        precision?: number    # For Decimal
        scale?: number        # For Decimal
    db_table: string
    indexes?:
      - fields: string[]
        unique?: boolean
    relations?:
      - name: string
        type: "hasOne" | "hasMany" | "belongsTo" | "manyToMany"
        model: string         # model ID
        foreignKey?: string
```

## 3. Task State (agentforge.tasks.yaml)

```yaml
version: "1.0"
last_updated: ISO8601

summary:
  total: number
  pending: number
  in_progress: number
  blocked: number
  review: number
  done: number
  failed: number
  aborted: number
  total_cost_usd: number

tasks:
  - id: string                # task_001
    title: string
    description?: string
    phase: "design" | "spec" | "code" | "cicd" | "observe"
    agent: string             # Agent role name
    status: "pending" | "blocked" | "in_progress" | "review" | "done" | "failed" | "aborted"
    depends_on: string[]      # Task IDs
    spec_ref: string          # Component/endpoint/model ID from spec
    branch?: string           # Git branch name
    pr_number?: number
    cost_usd: number
    tokens_used: number
    started_at?: ISO8601
    completed_at?: ISO8601
    attempts: number
    max_attempts: number      # Default: 3
    hitl_status?: "none" | "awaiting_approval" | "approved" | "changes_requested" | "rejected"
    hitl_channel?: string     # "slack:msg_id" or "telegram:msg_id"
    hitl_feedback?: string    # Human feedback text
    error?: string            # Last error message if failed
```

## 4. Agent Learnings (.agentforge/learnings/<role>.yaml)

```yaml
version: "1.0"
agent_role: string            # pr_reviewer, frontend_coder, etc.
last_updated: ISO8601

observations:
  - id: string                # obs_001
    date: ISO8601
    source: string            # "human_feedback_on_<task_id>" | "pattern_detected" | "error_recovery"
    learning: string          # Concise observation
    confidence: "high" | "medium" | "low"
    context?: string          # Optional additional context
    expires?: ISO8601         # Some learnings may become stale
```

## 5. Progressive Trust State (.agentforge/trust-state.yaml)

Tracks consecutive approval outcomes per agent role for the progressive trust model. Only used when `progressive_trust.enabled: true` in agentforge.yaml.

```yaml
version: "1.0"
last_updated: ISO8601

roles:
  <agent_role>:                   # e.g., frontend_coder, pr_reviewer
    consecutive_approvals: number # Resets to 0 on any non-approval outcome
    current_level: HITLLevel      # The active HITL level for this role
    last_outcome: "approved" | "changes_requested" | "rejected"
    last_updated: ISO8601
```

Trust only escalates (reduces human oversight), never auto-degrades. Downgrading requires a manual config change. If a rejection occurs, the consecutive counter resets but the HITL level stays at the escalated level.

## Locking Strategy

- Agents acquire WRITE LOCKS on specific files they're modifying
- READ LOCKS are never required (agents always read latest committed version)
- File locks use `.agentforge/locks/<filename>.lock` files
- Lock format: `{ agent_id, task_id, acquired_at, expires_at }`
- Locks expire after 5 minutes (configurable) to prevent deadlocks
- Human edits detected mid-agent-write: agent discards, re-reads human version
- Human ALWAYS wins in conflict resolution
