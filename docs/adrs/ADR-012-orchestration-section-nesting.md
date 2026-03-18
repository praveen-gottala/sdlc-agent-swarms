# ADR-012: Orchestration Section Nesting Under Agents

## Date
2026-03-18

## Status
Accepted

## PRD Reference
Section 5.1 — The YAML example shows orchestration nested under the `agents:` section:
```yaml
agents:
  providers:
    default: "claude-sonnet-4"
  sandbox:
    type: "github_actions"
  orchestration:
    max_concurrent_agents: 3
    ci_wait_strategy: "spawn_next"
```

## What the Implementation Does
The `ProjectManifest` type in `packages/core/src/types/project-manifest.ts` nests `orchestration` under `agents` as `agents.orchestration`. This exactly matches the YAML structure shown in PRD Section 5.1.

## Reasoning
This was initially flagged as a deviation because Criterion 3 of Wave 2 listed "orchestration" as a top-level section. However, re-reading PRD Section 5.1, the YAML example clearly shows `orchestration` indented under `agents:`, not at the root level. The implementation matches the PRD. This is not actually a deviation — it was a misclassification during Wave 2 testing.

## Downstream Impact
None. The implementation matches the PRD exactly. No Wave 3-7 prompts are affected.

## Decision
Accept — implementation already matches PRD. No changes needed.

## PRD Update Required
No — implementation already matches PRD Section 5.1.
