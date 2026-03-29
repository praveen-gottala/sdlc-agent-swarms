---
paths: ["packages/orchestrator/agents/**", "packages/orchestrator/graphs/**", "packages/cli/src/commands/**"]
---

# PRD Compliance Rules

Before modifying any file in these paths, cross-reference with `docs/prd.yaml`:

- Every interface/return type must include ALL fields the PRD specifies — never skip fields
- API endpoint signatures (method, path, request/response schema) must match PRD exactly
- Enum values: if the PRD defines an enum with N values, all N must have handlers
- If adding a new feature not in the PRD, STOP and create an ADR first via `/write-adr`
- If removing or renaming a PRD-defined field, STOP and create an ADR first
- Configurable values in PRD must be read from config YAML, never hardcoded
- Every agent's input/output contract must match the event registry payload schemas
- After completing a change, mentally verify: "Does this match what the PRD says, word for word?"
