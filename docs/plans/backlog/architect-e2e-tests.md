# Architect E2E Browser Test Coverage

**Status:** Not started
**Blocked by:** Gate 2 Dashboard UI (for browser-driven approval flow)
**Parent:** CHIP's Next Steps (M3 deferred scope)

## Context

M3 ships unit tests, integration tests, and headless eval for the Architect. Browser-level E2E tests (Playwright) are deferred because they depend on dashboard UI that does not yet exist (Gate 2 approval page, Architect SSE streaming endpoint rendering).

## Scope

### Architect SSE Endpoint

- Navigate to dashboard, trigger Architect pipeline
- Verify SSE events stream to the UI (node progress, status updates)
- Verify pipeline completion renders final `ContractBundle` summary

### Gate 2 Approval Flow (Browser-Driven)

- Trigger Architect pipeline that reaches Gate 2 interrupt
- Verify dashboard shows "Awaiting Approval" state on Runs page
- Navigate to Gate 2 review page
- Verify `ContractBundle` renders (architecture decisions, ADRs, task DAG, API contracts)
- Click Approve → verify pipeline resumes and completes
- Click Reject with edits → verify pipeline re-runs from Node 3 with edits applied

### Clarifier → Architect Round-Trip

- Run Clarifier pipeline to completion (approve HITL questions)
- Verify Architect pipeline starts with Clarifier's `EnrichedRequirement`
- Verify data flows correctly (PRD entities, screens, assumption ledger)
- End-to-end from raw product idea to `ContractBundle`

## Prerequisites

- Gate 2 Dashboard UI (`docs/plans/backlog/gate2-dashboard-ui.md`)
- Architect SSE endpoint wired into dashboard
- Playwright test infrastructure (already exists in `e2e/`)

## Estimated Effort

1–2 sessions. Builds on existing Playwright infrastructure and patterns from `e2e/runs-page.spec.ts`.
