# ADR-050: Runs Page — Deferred Vision Layer 14 Decisions

**Status:** Accepted  
**Date:** 2026-04-29  
**Context:** CHIP UX Phase 4.0 Pipeline → Runs page redesign

## Decision

Two locked decisions in `docs/vision.md` Layer 14 are intentionally deferred for the Runs page initial implementation.

### 1. Graph visualization → Stage-timeline rail

**Vision says:** "Graph visualization via LangGraph's built-in Mermaid export." (Layer 14, locked)

**We chose:** A horizontal stage-timeline rail showing the 4-stage spine (Clarifier → Architect → Implementer → Reviewer) with status indicators, HITL gate diamonds, and "Upcoming" badges on unimplemented stages.

**Why:** Only the Clarifier stage is implemented. Architect, Implementer, and Reviewer have no LangGraph graphs to visualize. A React Flow DAG with 3/4 nodes permanently in "coming soon" state would be 75% placeholder, violating the design principle "every pixel serves a purpose" (CHIP UX execution plan, principle #5). The stage-timeline rail shows real data — which stages exist, which are active, where HITL gates are — without decoration.

**Trigger to revisit:** When the Architect stage is implemented as a LangGraph graph, swap the rail for a React Flow graph showing the full spine DAG. `@xyflow/react` is already installed.

### 2. SSE/WebSocket → 2-second polling

**Vision says:** "Real-time updates via Server-Sent Events or websockets rather than 2s polling for active runs." (Layer 14, locked)

**We chose:** 2-second polling via the existing `useRunProgress` hook in `packages/dashboard/src/lib/hooks/use-run-progress.ts`.

**Why:** SSE requires new server infrastructure (event stream endpoint, connection management, reconnection handling) that doesn't exist in the codebase. The entire dashboard currently uses polling — activity sidebar, design studio, run progress. Adding SSE for one page would create two real-time patterns without benefiting the other consumers. SSE infrastructure should be a cross-cutting migration that upgrades all pages at once.

**Trigger to revisit:** When SSE or WebSocket infrastructure is added as a cross-cutting concern (planned but not scheduled), migrate the Runs page to use it alongside all other polling consumers.

## Consequences

- The Runs page ships without graph visualization and without SSE. Both are explicitly planned for later.
- No functional capability is lost — the page shows all available run data with the timeline rail + run history table.
- These two deviations are the only departures from vision Layer 14 in Phase 4.0.
