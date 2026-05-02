# How to configure agent models

> See also: [ADR-033: Configurable Model Resolution](../adrs/ADR-033-configurable-model-resolution.md)

Every CHIP agent has a default model, but you can override any agent's model without touching source code. This guide explains the resolution chain, the agents that exist today, and how to choose models based on your situation.

## Prerequisites

- Initialized project with `agentforge.yaml`
- Understanding of which pipeline you're running (design, clarifier)

## Model resolution chain

When CHIP resolves which model an agent should use, it walks a 4-tier priority chain (highest wins). Implemented in `packages/core/src/config/model-resolver.ts` ([ADR-033](../adrs/ADR-033-configurable-model-resolution.md)).

| Priority | Source | Scope | Example |
|----------|--------|-------|---------|
| 1 (highest) | `AGENTFORGE_DEFAULT_MODEL` env var | All agents | `export AGENTFORGE_DEFAULT_MODEL=claude-haiku-4-5` |
| 2 | `agentforge.yaml` → `agents.providers.overrides[role]` | One agent role | `overrides: { ux_design: claude-opus-4-7 }` |
| 3 | `agentforge.yaml` → `agents.providers.default` | All agents in project | `default: claude-sonnet-4-6` |
| 4 (lowest) | Pipeline stage default (hardcoded) | One agent | `STAGE_DEFAULTS` in `pipeline.ts` |

## Available models

| Model ID | Strength | Cost | Use when |
|----------|----------|------|----------|
| `claude-opus-4-7` | Highest capability | $$$ | Complex planning, architecture decisions, quality-critical design |
| `claude-opus-4-6` | High capability | $$ | Design generation, spec writing |
| `claude-sonnet-4-6` | Balanced | $ | Research, most pipeline tasks |
| `claude-haiku-4-5` | Fastest, cheapest | ¢ | Structured reviews, CI monitoring, test runs |

## Agents that exist today

### Design pipeline (`packages/agents-ux`)

These are the operational agents, with defaults defined in `packages/agents-ux/src/design-pipeline/pipeline.ts` (line 26):

| Role | Default model | Purpose |
|------|---------------|---------|
| `ux_research` | `claude-sonnet-4-6` | Analyzes page requirements, produces design briefs |
| `ux_planning` | `claude-opus-4-7` | Component tree, token bindings, responsive rules |
| `ux_design` | `claude-opus-4-6` | Generates DesignSpec v2 JSON via structured output |
| `ux_evaluator` | `claude-opus-4-7` | Scores designs, triggers correction loops |

### Clarifier pipeline (`packages/agents-clarifier`)

| Role | Default model | Purpose |
|------|---------------|---------|
| PRD Analyzer | `claude-opus-4-6` | Forced-JSON PRD extraction |
| Gap Detector (impl) | `claude-sonnet-4-6` | 3 implementation samples for divergence analysis |
| Gap Detector (diverge) | `claude-sonnet-4-6` | Divergence analysis at temperature 0 |
| Story Writer | `claude-sonnet-4-6` | EARS acceptance criteria, FeaturePlan DAG |
| Critic | `claude-sonnet-4-6` | INVEST/EARS compliance checking |

### Planned pipelines (not yet implemented)

The following are defined in the PRD but do not have running code:

- **Spec pipeline** (`packages/agents-spec/`) — spec_writer, task_decomposer
- **Code pipeline** (`packages/agents-code/`) — implementer (single-threaded per vision Layer 8)
- **Review pipeline** (`packages/agents-review/`) — deterministic gates + LLM review
- **CI/CD pipeline** (`packages/agents-cicd/`) — build, security, deploy agents

## Persona-based guidance

### Solo builder (Persona A)

You're iterating fast on your own project. Cost matters more than marginal quality differences.

```yaml
# agentforge.yaml — cost-efficient solo builder preset
agents:
  providers:
    default: claude-sonnet-4-6
    overrides:
      ux_planning: claude-sonnet-4-6    # downgrade from opus — good enough for solo iteration
      ux_evaluator: claude-sonnet-4-6   # faster evaluation cycles
```

**When to upgrade to Opus:** When you're generating designs for a demo or presentation. Switch `ux_design` to `claude-opus-4-7` for that run:

```bash
# One-time upgrade for a high-stakes design run
# (edit agentforge.yaml, run, then revert)
```

### Small team (5-15 engineers, Persona B)

Quality and consistency matter. You want the best output from each pipeline stage because multiple people will review and build on the results.

```yaml
# agentforge.yaml — quality-first team preset (the defaults)
agents:
  providers:
    default: claude-sonnet-4-6
    # No overrides needed — pipeline defaults already use opus for critical stages
```

The pipeline defaults are tuned for this persona: Opus for planning and evaluation (where reasoning quality has the highest downstream impact), Sonnet for research (where speed matters more than depth).

### Testing and CI

Force all agents to the cheapest model to avoid burning tokens on throwaway runs:

```bash
AGENTFORGE_DEFAULT_MODEL=claude-haiku-4-5 agentforge design:page home --project-dir ./my-app
```

Or use `--mock` to skip LLM calls entirely:

```bash
agentforge design:page home --mock --project-dir ./my-app
```

## Steps

### 1. Override a single agent

```yaml
# agentforge.yaml
agents:
  providers:
    default: claude-sonnet-4-6
    overrides:
      ux_design: claude-opus-4-7   # upgrade design agent for better output
```

### 2. Override all agents globally

```bash
export AGENTFORGE_DEFAULT_MODEL=claude-haiku-4-5
agentforge design:page home --project-dir ./my-app
```

### 3. Check which model an agent is using

The pipeline logs model selection at the start of each stage. Look for the model name in the output.

## Verify

After changing model configuration:

1. Run `agentforge design:page home --project-dir ./my-app` — verify the pipeline completes
2. Check pipeline output for the expected model name in stage logs
3. Compare output quality between model tiers if evaluating a downgrade

## What's next

- [ADR-033](../adrs/ADR-033-configurable-model-resolution.md) — design rationale for model resolution
- [Design Generation Guide](design-generation.md) — full pipeline workflow
