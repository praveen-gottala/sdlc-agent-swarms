# Gate 2 ContractBundle Review Page

**Status:** Not started
**Blocked by:** None (M3 Gate 2 channels delivered in M3 Phase 3)
**Parent:** CHIP UX Overhaul Phase 4.6

## Scope

Build the dashboard UI for Gate 2 HITL approval — the Architect's structural checkpoint where a human reviews the full `ContractBundle` before implementation begins.

## What M3 Delivers (machinery only)

- `gate2Approval` no-op pass-through node in `packages/agents-architect/`
- `gate2Decision` channel (`'approved' | 'rejected' | null`)
- `gate2Edits` channel (`Partial<ContractBundle> | null`)
- `interruptBefore: ['gate2Approval', 'escalationGate']` in the Architect graph
- CLI resume: `updateState({ gate2Decision: 'approved' }) + stream(null)` (mirrors Clarifier HITL resume)
- Eval-time deterministic responder (always approves)

## What This Plan Builds (UI)

### Rendering

- Architecture decisions table with rationale and ADR links
- ADR list with status and key excerpts
- Task DAG visualization (React Flow) showing dependencies, file paths, estimated budgets
- API contract preview (OpenAPI 3.1 fragments)
- Data model entity-relationship view
- Component composition tree
- Screen plan cards with data binding indicators
- Design system diff (token additions/modifications)

### Controls

- **Approve** — sets `gate2Decision: 'approved'`, resumes graph
- **Reject with edits** — inline editing of `ContractBundle` fields, sets `gate2Decision: 'rejected'` + `gate2Edits`, routes back to Node 3
- **Request re-run** — clears state, re-runs from specified node

### Integration

- Dashboard polling for pending Gate 2 approvals (same pattern as Clarifier HITL)
- SSE endpoint for Architect pipeline streaming
- Runs page integration: Architect stage shows "Awaiting Approval" state when interrupt fires

## Dependencies

- `packages/agents-architect/` (M3 — delivered)
- `packages/dashboard/` (CHIP UX Overhaul)
- React Flow (already installed for graph viz)

## Estimated Effort

2–3 sessions. Primarily frontend work in `packages/dashboard/`.
