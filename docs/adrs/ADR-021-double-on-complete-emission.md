# ADR-021: Double on_complete Event Emission

## Date
2026-03-18

## Status
Rejected

## PRD Reference
Section 10.1 — Agent Contract Definition:
> `on_complete: emit(DesignPhaseComplete)` — fires once when the agent completes its work.

Section 7.1 — Event Chain:
> `DesignPhaseComplete -> SpecComplete -> tasks created`

Each event in the chain is expected to fire exactly once per phase/task completion.

## Context
During Wave 6 validation (P29 Design-to-Spec Pipeline), the test suite discovered
that `on_complete` events were being emitted **twice** per task completion:

1. **Manually** by the `workFn` inside the agent's work function (e.g.,
   `ctx.eventBus.publish({ type: 'UXResearchComplete', ... })`)
2. **Automatically** by `runAgent()` in `base-agent.ts` at line 178-183, which
   publishes `contract.on_complete` after the work function succeeds.

This double emission violates the PRD specification and creates concrete downstream
risks:
- **Audit log duplication**: P09 audit logger records every event, producing
  duplicate completion entries
- **Orchestrator double-trigger**: The orchestrator's task completion handler
  would fire twice, potentially corrupting task state transitions
- **V3 Dashboard (P31)**: The event bus relay to the WebSocket would send
  duplicate events to the frontend, causing incorrect counts in the Event
  Catalog and Kanban board

## Decision
**Rejected** — the implementation is incorrect. The fix is applied.

The correct behavior is:
- `runAgent()` auto-emits the `on_complete` event (with minimal fields: `type`,
  `source`, `timestamp`).
- `workFn` implementations should **NOT** manually emit the same `on_complete`
  event type. They may emit intermediate events (e.g., progress events), but
  the completion event is exclusively managed by `runAgent()`.

This is documented explicitly in `base-agent.ts` with a code comment referencing
this ADR.

## Alternatives Considered
1. **Remove auto-emission from runAgent, keep manual emission in workFn**: Rejected
   because workFn implementations vary across agent packages and manual emission
   is error-prone (forgetting to emit, inconsistent payloads). Centralizing in
   `runAgent()` ensures every agent emits exactly once with consistent structure.

2. **Deduplicate in the event bus**: Rejected because deduplication adds complexity
   and masks the root cause. The correct solution is to emit once at the source.

## Fix Applied
1. Added explicit code comment in `base-agent.ts` documenting that `runAgent()`
   owns `on_complete` emission.
2. Updated existing tests that manually emitted `on_complete` inside `workFn` to
   remove the manual emission or adjust expected event counts.
3. Full test suite passes with 0 regressions.
