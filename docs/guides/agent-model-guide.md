# Agent & Model Configuration Guide

AgentForge ships 22 agents across 5 packages. Each agent has a default model
baked into its contract, but you can override any agent's model without touching
source code.

This guide covers which agents exist, what models they use, and how to change
them.

## Model Resolution Priority

When AgentForge needs to determine which model an agent should use, it walks a
4-tier priority chain (highest wins). This is implemented in
`packages/core/src/config/model-resolver.ts` and documented in
[ADR-033](adrs/ADR-033-configurable-model-resolution.md).

| Priority | Source | Scope |
|----------|--------|-------|
| 1 (highest) | `AGENTFORGE_DEFAULT_MODEL` env var | All agents, globally |
| 2 | `agentforge.yaml` → `agents.providers.overrides[role]` | Single agent role |
| 3 | `agentforge.yaml` → `agents.providers.default` | All agents in project |
| 4 (lowest) | Contract's `provider` field (hardcoded in source) | Single agent |

If no override is configured at any tier, the contract's hardcoded default is
used. The system is fully backward-compatible: projects without an
`agentforge.yaml` work exactly as before.

### Tier 1: Environment Variable (Global Override)

```bash
# Force ALL agents to use Haiku for a cheap test run
export AGENTFORGE_DEFAULT_MODEL=claude-haiku-4-5
agentforge start spec
```

### Tier 2: Per-Role Override (YAML)

```yaml
# agentforge.yaml
agents:
  providers:
    default: claude-sonnet-4-6
    overrides:
      spec_writer: claude-opus-4-6   # complex reasoning needs Opus
      pr_reviewer: claude-haiku-4-5  # structured review is fine on Haiku
```

### Tier 3: Project Default (YAML)

```yaml
# agentforge.yaml
agents:
  providers:
    default: claude-sonnet-4-6  # all agents use Sonnet unless overridden
```

### Tier 4: Contract Fallback

Each agent contract declares a `provider` field. This is the fallback used when
no YAML or env var override is present. You can change it by editing the
contract source file directly, but YAML/env overrides are preferred.

## Available Models

| Model ID | Tier | Best For |
|----------|------|----------|
| `claude-opus-4-6` | Highest capability | Complex reasoning, spec writing, architecture decisions |
| `claude-sonnet-4-6` | Balanced | Most agent tasks — code generation, design, planning, review |
| `claude-haiku-4-5` | Fastest / cheapest | Structured tasks, CI monitoring, PR management, simple reviews |

## Agent Catalog

### Design Pipeline (`packages/agents-design`)

| Role | Default Model | HITL | Description |
|------|---------------|------|-------------|
| `ux_researcher` | `claude-sonnet-4-6` | notify_only | Analyzes page descriptions and produces UX layout suggestions |
| `wireframe_generator` | `claude-sonnet-4-6` | full_approval | Generates wireframe designs from UX research layout suggestions |
| `visual_designer` | `claude-sonnet-4-6` | review_and_override | Applies design tokens to wireframes, producing high-fidelity visual designs |
| `design_reviewer` | `claude-sonnet-4-6` | notify_only | Reviews visual designs for accessibility, responsiveness, and compliance |

**Why Sonnet?** Design tasks require creative reasoning but operate on
structured inputs (specs, tokens). Sonnet provides sufficient capability at
reasonable cost.

**CLI:** `agentforge design:figma`, `agentforge design:penpot`

---

### UX Dashboard Pipeline (`packages/agents-ux`)

| Role | Default Model | HITL | Description |
|------|---------------|------|-------------|
| `ux_research` | `claude-sonnet-4-6` | notify_only | Analyzes PRD requirements for dashboard modules and produces design briefs |
| `ux_planning` | `claude-sonnet-4-6` | review_and_override | Translates design briefs into component specs with token bindings and responsive rules |
| `ux_design` | `claude-sonnet-4-6` | full_approval | Creates Figma designs from component specs using TalkToFigma MCP bridge |
| `penpot_design` | `claude-sonnet-4-6` | full_approval | Creates Penpot designs from component specs using execute_code tool |
| `penpot_browser_design` | `claude-sonnet-4-6` | full_approval | Creates Penpot designs using Playwright browser automation |
| `ux_implementation` | `claude-sonnet-4-6` | review_and_override | Generates React 19 + Tailwind CSS code from component specs |
| `ux_review` | `claude-sonnet-4-6` | notify_only | Runs accessibility, design-system compliance, and visual fidelity evaluations |
| `ux_testing` | `claude-sonnet-4-6` | notify_only | Generates Playwright tests via a 3-stage Plan, Generate, Heal pipeline |

**Why Sonnet?** UX agents deal with structured design-to-code workflows. Sonnet
handles the translation between design specs and implementation well. The design
agents require `full_approval` HITL because they modify external tools (Figma/Penpot).

**CLI:** `agentforge design:figma`, `agentforge design:penpot`,
`agentforge design:penpot-browser`, `agentforge design:penpot-all`

---

### Spec Pipeline (`packages/agents-spec`)

| Role | Default Model | HITL | Description |
|------|---------------|------|-------------|
| `spec_writer` | `claude-opus-4-6` | review_and_override | Translates design artifacts into structured technical specifications |
| `task_decomposer` | `claude-sonnet-4-6` | notify_only | Decomposes technical specs into discrete implementable tasks |

**Why Opus for spec_writer?** Spec writing requires synthesizing design
artifacts, PRD requirements, and architecture constraints into coherent technical
specifications. This is the most reasoning-intensive task in the pipeline and
benefits from Opus's superior capability. The 200K-token context window is
fully utilized.

**Why Sonnet for task_decomposer?** Task decomposition follows clearer patterns
(break spec into tasks) and doesn't require the same depth of reasoning.

**CLI:** `agentforge start spec`

---

### Code Pipeline (`packages/agents-code`)

| Role | Default Model | HITL | Description |
|------|---------------|------|-------------|
| `frontend_coder` | `claude-sonnet-4-6` | review_and_override | Generates React components from spec + design context |
| `backend_coder` | `claude-sonnet-4-6` | review_and_override | Generates API endpoints, business logic, data access layers, and Prisma migrations |
| `test_writer` | `claude-sonnet-4-6` | notify_only | Generates unit, integration, and e2e tests from specs |
| `pr_reviewer` | `claude-haiku-4-5` | review_and_override | Reviews generated code for quality, security, and architecture compliance |

**Why Haiku for pr_reviewer?** Code review follows well-defined checklists
(security, style, correctness). Haiku handles structured evaluation tasks
efficiently at a fraction of the cost. The 50K-token context is sufficient
for typical PR diffs.

**CLI:** `agentforge start code`

---

### CI/CD Pipeline (`packages/agents-cicd`)

| Role | Default Model | HITL | Description |
|------|---------------|------|-------------|
| `build_agent` | `claude-haiku-4-5` | fully_autonomous | Monitors CI failures, analyzes error logs, generates fixes for known patterns |
| `security_scanner` | `claude-sonnet-4-6` | notify_only | Runs SAST scans on every PR, categorizes findings by severity, blocks critical issues |
| `pr_manager` | `claude-haiku-4-5` | notify_only | Creates pull requests via MCP client after CI passes |
| `deploy_agent` | `claude-haiku-4-5` | review_and_override | Manages deployment to staging, monitors post-deploy health |

**Why Haiku for build/deploy/PR agents?** These agents perform structured,
repetitive tasks (parse logs, create PRs, trigger workflows). They don't need
deep reasoning — speed and cost matter more. `build_agent` is the only
`fully_autonomous` agent in the system.

**Why Sonnet for security_scanner?** Security analysis requires nuanced
understanding of code patterns and vulnerability classification. Haiku could
miss subtle issues.

**CLI:** `agentforge start cicd`

## Model Distribution Summary

| Model | Agent Count | Roles |
|-------|-------------|-------|
| `claude-sonnet-4-6` | 17 | Most agents across all pipelines |
| `claude-haiku-4-5` | 4 | `pr_reviewer`, `build_agent`, `pr_manager`, `deploy_agent` |
| `claude-opus-4-6` | 1 | `spec_writer` |

## How to Change an Agent's Model

### Option 1: Per-Project Override (Recommended)

Edit your project's `agentforge.yaml`:

```yaml
agents:
  providers:
    default: claude-sonnet-4-6
    overrides:
      # Upgrade the test writer to Opus for better test coverage
      test_writer: claude-opus-4-6
      # Downgrade design reviewer to Haiku to save costs
      design_reviewer: claude-haiku-4-5
```

This affects only the current project. The `ProviderConfig` type
(`packages/core/src/types/project-manifest.ts`) defines the schema:

```typescript
interface ProviderConfig {
  readonly default: string;
  readonly overrides?: Readonly<Record<string, string>>;
}
```

### Option 2: Global Override via Environment Variable

```bash
# All agents use Haiku (cheapest option for testing)
export AGENTFORGE_DEFAULT_MODEL=claude-haiku-4-5

# Or inline for a single command
AGENTFORGE_DEFAULT_MODEL=claude-haiku-4-5 agentforge start spec
```

This overrides everything — YAML config and contract defaults. Useful for quick
testing or CI environments where cost control matters.

### Option 3: Edit the Contract Source (Permanent)

Each agent's contract is defined in its package source. For example, to change
`spec_writer`'s default from Opus to Sonnet, edit the contract's `provider`
field. This is a code change and should go through normal PR review.

YAML and env var overrides are preferred over source edits because they don't
require rebuilding or redeploying.

## Cost Optimization Tips

### When to Downgrade to Haiku

- **Structured, repetitive tasks**: If an agent follows a checklist or template
  (reviews, CI monitoring, PR creation), Haiku is usually sufficient.
- **High-volume runs**: If you're running agents frequently during development,
  switch to Haiku to reduce costs.
- **Testing pipelines**: Use the env var trick to force all agents to Haiku:
  ```bash
  AGENTFORGE_DEFAULT_MODEL=claude-haiku-4-5 agentforge start code
  ```

### When Opus Is Worth It

- **Spec writing**: The `spec_writer` defaults to Opus because translating
  design artifacts into technical specs requires deep reasoning across large
  contexts.
- **Complex architecture decisions**: If you add a custom agent that needs to
  reason about system-wide tradeoffs, Opus is the right choice.
- **One-time tasks**: For tasks that run infrequently (e.g., initial spec
  generation), the cost difference is negligible.

### Cost Control Checklist

1. Start with the defaults — they're tuned for a good cost/capability balance.
2. If costs are too high, downgrade review/CI agents to Haiku first (lowest
   impact on output quality).
3. Use `AGENTFORGE_DEFAULT_MODEL` for test runs — never burn Opus tokens on
   throwaway iterations.
4. Check per-role overrides in `agentforge.yaml` before editing source contracts.

## Related Documentation

- [ADR-033: Configurable Model Resolution](adrs/ADR-033-configurable-model-resolution.md) — design rationale
- [Agent Contracts Reference](agent-contracts.md) — schema, lifecycle, and field definitions
- [Architecture Overview](architecture.md) — system layer diagram
- [PRD v2.0](PRD-v2.md) — full product specification
