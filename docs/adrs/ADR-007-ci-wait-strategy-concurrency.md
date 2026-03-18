# ADR-007: CI Wait Strategy and Concurrency Slot Management

## Date
2026-03-18

## Status
Accepted

## PRD Reference
Section 11.3.4 — "Each task gets its own agent instance. The orchestrator spawns up to N concurrent agents (configurable via max_concurrent_agents, default 3). When an agent is blocked waiting for CI results, the slot does not open; instead, the next independent task is assigned to a new agent instance up to the concurrency limit."

## What the Implementation Does
The `getSchedulableTasks()` function in `task-dependency-graph.ts` counts all active slots (both `executing` and `ci_waiting`) toward the concurrency limit. When all slots are occupied — including those waiting for CI — no new tasks are scheduled. The `ci_wait_strategy` config value from `agentforge.yaml` (which has value `"spawn_next"`) is not yet wired to the dependency graph; the implementation currently applies the PRD-specified behavior (slots held during CI) without reading the config value. Additionally, the PRD says "the next independent task is assigned to a new agent instance" — the implementation returns ready tasks but does not itself instantiate new agent instances; that responsibility belongs to the orchestrator.

## Reasoning
The PRD describes a two-part behavior: (1) CI-waiting agents hold their slot, and (2) independent tasks can still start on new agent instances up to the limit. Part (1) is fully implemented. Part (2) requires orchestrator-level agent spawning which is outside the scope of the dependency graph primitive. The `ci_wait_strategy` config wiring is deferred because only one strategy (`spawn_next`) is defined in the PRD — hardcoding this behavior is correct for Phase 1.

## Downstream Impact
- **P11 Agent Runtime:** Must consume `getSchedulableTasks()` and spawn new agent instances for returned tasks. The `AgentSlot` type provides the status tracking needed.
- No impact on P16, P29, P31, P32.

## Decision
Accept deviation and update PRD to clarify implementation boundaries.

## PRD Update Required
Yes — Section 11.3.4 should note that the dependency graph enforces slot accounting, while the orchestrator handles agent instance lifecycle.
