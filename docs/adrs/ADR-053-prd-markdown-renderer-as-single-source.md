# ADR-053: PRD markdown renderer as single source of truth

## Status

Accepted

## Context

The structured PRD has two consumers needing a markdown form: `docs/prd.md` (human-readable, written on Clarifier approval) and `PipelineInput.prdRequirements[0]` (derived at design-pipeline init when an `EnrichedRequirement` is present). Two formatters guarantee drift.

## Decision

One function — `renderPrdToMarkdown(prd: PRD): string` in `@agentforge/core` — is the canonical markdown rendering of a structured PRD. Both consumers call it. No alternative renderer is permitted.

Output is deterministic for a given input (no timestamps, stable section order). Section order is fixed:

1. Title and description
2. Screens
3. Data Entities
4. Personas
5. Features
6. Non-Functional Requirements
7. Success Metrics
8. Out of Scope

Screens and Data Entities come first because the design stage grounds on screen names and entity field names. NFRs and metrics come later because they are planning/architecture-relevant, not visual-design-relevant.

## Consequences

- `docs/prd.md` and `PipelineInput.prdRequirements[0]` are byte-identical
  when both originate from the same `EnrichedRequirement`. Drift is a
  real bug, not a formatter mismatch.
- Eval gates can hash-compare PRD-derived input across runs to confirm
  "no behavior change unless enriched PRD changed."
- Any new consumer of the markdown form imports this function. Forking
  the renderer requires a new ADR superseding this one.
