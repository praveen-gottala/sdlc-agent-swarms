# Plan: docs/ Directory Reorganization

## Context

The `docs/` directory has 20+ files at the root level mixing architecture
docs, PRDs, guides, issue trackers, and reference material. Finding the
right doc requires knowing the filename. This plan proposes subdirectories
by topic.

## Proposed Structure

```
docs/
  architecture/              # How things work (system design)
    architecture.md          # System overview, layer diagram
    design-pipeline-dataflow.md  # Stages 0-7 data flow
    prototype-rendering-dataflow.md  # Prototype rendering pipeline
    component-catalog.md     # Catalog system design
    provider-abstraction.md  # LLM provider layer
    error-handling.md        # Error patterns
    agent-contracts.md       # Agent interfaces & contracts

  specs/                     # What to build (product requirements)
    PRD-v1.md
    PRD-v1.5.md
    PRD-2.md
    PRD-Dashboard-v3.md
    prd-differences.md

  guides/                    # How to use/configure (operational)
    agent-model-guide.md     # Model selection guide
    viewport-config.md       # Viewport configuration
    messaging-integration.md # Slack/Telegram integration
    design-generation.md     # Design generation guide
    design-studio-logging.md # Studio logging guide

  reference/                 # Status, assessments, known gaps
    v2-readiness-certification.md
    prototype-limitations.md
    failure-modes.md
    pipeline-improvements.md
    plan-prompt-quality.md

  adrs/                      # (unchanged)
  cli/                       # (unchanged)
  plans/                     # (unchanged)
  issues/                    # (unchanged)
  pending-evaluation/        # (unchanged)
  archive/                   # (unchanged)
  lessons-learned.md         # (stays at root — cross-cutting)
```

## File Move Mapping

| Current Path | New Path |
|---|---|
| `docs/architecture.md` | `docs/architecture/architecture.md` |
| `docs/design-pipeline-dataflow.md` | `docs/architecture/design-pipeline-dataflow.md` |
| `docs/prototype-rendering-dataflow.md` | `docs/architecture/prototype-rendering-dataflow.md` |
| `docs/component-catalog.md` | `docs/architecture/component-catalog.md` |
| `docs/provider-abstraction.md` | `docs/architecture/provider-abstraction.md` |
| `docs/error-handling.md` | `docs/architecture/error-handling.md` |
| `docs/agent-contracts.md` | `docs/architecture/agent-contracts.md` |
| `docs/PRD-v1.md` | `docs/specs/PRD-v1.md` |
| `docs/PRD-v1.5.md` | `docs/specs/PRD-v1.5.md` |
| `docs/PRD-2.md` | `docs/specs/PRD-2.md` |
| `docs/PRD-Dashboard-v3.md` | `docs/specs/PRD-Dashboard-v3.md` |
| `docs/prd-differences.md` | `docs/specs/prd-differences.md` |
| `docs/agent-model-guide.md` | `docs/guides/agent-model-guide.md` |
| `docs/viewport-config.md` | `docs/guides/viewport-config.md` |
| `docs/messaging-integration.md` | `docs/guides/messaging-integration.md` |
| `docs/design-generation.md` | `docs/guides/design-generation.md` |
| `docs/design-studio-logging.md` | `docs/guides/design-studio-logging.md` |
| `docs/v2-readiness-certification.md` | `docs/reference/v2-readiness-certification.md` |
| `docs/prototype-limitations.md` | `docs/reference/prototype-limitations.md` |
| `docs/failure-modes.md` | `docs/reference/failure-modes.md` |
| `docs/pipeline-improvements.md` | `docs/reference/pipeline-improvements.md` |
| `docs/plan-prompt-quality.md` | `docs/reference/plan-prompt-quality.md` |

## Cross-Reference Update Checklist

After moving files, grep for and update all references:

```bash
# Find all references to moved docs
grep -rn 'docs/architecture\.md' CLAUDE.md .claude/ packages/ e2e/
grep -rn 'docs/PRD' CLAUDE.md .claude/ packages/ e2e/
grep -rn 'docs/error-handling' CLAUDE.md .claude/ packages/
grep -rn 'docs/design-pipeline-dataflow' CLAUDE.md .claude/ packages/ docs/
grep -rn 'docs/prototype-rendering-dataflow' CLAUDE.md .claude/ packages/ docs/
grep -rn 'docs/prototype-limitations' .claude/ packages/
grep -rn 'docs/agent-contracts' .claude/ packages/
grep -rn 'docs/provider-abstraction' .claude/ packages/
```

Key files that reference docs paths:
- `CLAUDE.md` — references `docs/architecture.md`, `docs/PRD-v2.md`
- `.claude/rules/design-pipeline.md` — references `docs/design-pipeline-dataflow.md`
- `.claude/rules/testing.md` — references `docs/error-handling.md`
- `docs/lessons-learned.md` — internal cross-references
- Various ADRs — reference PRDs and architecture docs

## Risk

Broken links. Mitigate by running the grep checklist above and verifying
every match is updated before committing.
