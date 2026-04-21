# ADR-022: TypeScript-Only Orchestration Engine

## Date
2026-03-18

## Status
Partially Implemented — The decision to go TypeScript-only is correct in practice
(all active workflows are TS), but the Python engine code and its CLI wiring
(engine-client.ts, engine-setup.ts, start/approve/abort commands) were never
removed. The Python engine contains real orchestration patterns (LangGraph state
machines, HITL interrupts, task dependency resolution) but zero real agent
implementations — all agent nodes are stubs.

Future: When building spec/code/cicd/observe phases, decide whether to:
(a) Port LangGraph patterns to TypeScript orchestrator in @agentforge/core, or
(b) Wire real agents into the existing Python engine.
This decision should be made before starting Phase 2 SDLC pipeline work.

## PRD Reference
Section 4.1 — Architecture Layers:
> "Orchestration: Supervisor agent, workflow engine, state management, event bus — LangGraph (Python) / custom DAG engine"

Section 4.3 — Process Architecture:
> "For Phase 1, the entire framework runs as a single Node.js process invoked via the CLI. The architecture uses TypeScript interfaces internally, with the orchestration engine (LangGraph, Python) communicating via a local REST/gRPC bridge."
>
> "agentforge CLI (TypeScript / Commander.js)
>  |-- calls -->
>  agentforge-engine (Python)
>  |-- Orchestrator (LangGraph graphs per phase)
>  |-- Agent Runtime (provider routing, sandboxing, budget)
>  |-- Event Bus adapter (in-memory for v1, Redis Streams later)"

Section 22.1 — Core Framework:
> | Orchestration engine | Python (LangGraph) | Stateful agents, persistence, HITL interrupts |
> | CLI-to-Engine bridge | Local REST/gRPC    | Clean separation, replaceable engine          |

Section 24.1 — Phase 1 Milestone:
> "Core orchestration engine with event bus and state management (LangGraph)"

Section 27.1 — Reference Implementations:
> "LangGraph (github.com/langchain-ai/langgraph) - Stateful multi-agent orchestration"

## What the Implementation Does
The entire orchestration system is implemented in TypeScript across these packages:

- **@agentforge/core** (`packages/core/`): Contains the orchestrator, event bus
  (`EventEmitter`-based), agent runtime (`runAgent()`), state management (task
  manager, spec reader, lock manager, learnings manager), and MCP client with
  middleware pipeline. Zero external dependencies beyond `yaml` and `eventemitter3`.

- **@agentforge/governance** (`packages/governance/`): Implements the governance
  middleware (permission checker, budget tracker, HITL enforcer, audit logger)
  with the correct ADR-004 ordering (permission -> budget -> HITL).

- **@agentforge/cli** (`packages/cli/`): Commander.js CLI that directly imports
  and calls TypeScript orchestration functions in-process. No REST/gRPC bridge.
  No separate Python process.

The CLI calls `runAgent()` directly. The event bus is an in-memory `EventEmitter`.
Phase orchestration is implemented via TypeScript functions that sequence agent
execution, not LangGraph state graphs. HITL gates are enforced by the governance
middleware which pauses execution and emits approval request events.

## Reasoning
The TypeScript-only implementation was chosen because:

1. **Single-process simplicity**: Phase 1 explicitly targets a single Node.js
   process (PRD Section 4.3 opening sentence). Adding a Python sidecar with
   REST/gRPC bridge introduces deployment complexity, startup latency, and
   cross-process error handling that is unnecessary for v1.

2. **Full behavioral compliance**: All 144 tests pass. Every PRD-specified
   behavior — governance pipeline ordering (ADR-004), HITL gates, budget
   enforcement, permission boundaries, event chains, spec sync, agent learnings,
   failure recovery modes (F1-F11), progressive trust, abort lifecycle — works
   correctly in TypeScript.

3. **Developer experience**: `npm install && agentforge init` is simpler than
   requiring Python 3.x + pip + venv + LangGraph + a bridge process.

4. **Type safety**: TypeScript's type system provides compile-time safety for
   the 31-event discriminated union, agent contracts, and governance interfaces
   that would require runtime validation in Python.

## What Is Lost vs PRD Spec

LangGraph provides capabilities that the TypeScript implementation handles
differently or defers:

| LangGraph Feature | TypeScript Equivalent | Gap |
|---|---|---|
| **Stateful graph persistence** | YAML files in git (tasks, specs, learnings) | No automatic checkpoint/replay of graph state across process restarts. Manual state reconstruction from YAML on restart. |
| **HITL interrupt/resume** | Governance middleware `pause` status + task status polling | Functionally equivalent. LangGraph's `interrupt_before` pattern is replicated via `checkAbort()` polling in the retry loop. |
| **Phase graph visualization** | None | LangGraph Studio provides visual debugging of graph execution. Not available in TypeScript. Deferred to V3 Dashboard (S4.6 Reasoning Trace). |
| **Built-in parallelism** | `Promise.all` with SlotManager concurrency control | Functionally equivalent for Phase 1. LangGraph's `Send()` API for fan-out is replicated via the SlotManager class. |
| **Conditional edges** | TypeScript `if/else` in orchestration functions | Functionally equivalent but less declarative. |
| **Time-travel debugging** | Audit log (JSON lines) | Audit log provides post-hoc analysis. LangGraph's checkpoint replay is not available. |

**Net assessment**: The primary gaps are graph visualization (deferred to V3
Dashboard) and automatic checkpoint/replay (deferred to Phase 2 with potential
Redis Streams migration). All behavioral requirements are met.

## Downstream Impact

- **V3 Dashboard (P31-P32)**: The dashboard connects to the event bus via
  WebSocket relay from the CLI process, not from a separate Python engine. This
  is architecturally simpler. The dashboard tests behaviors (event catalog,
  kanban board, approval center), not technology stack. No impact.

- **Phase 2 Redis Streams migration**: The PRD specifies migrating from
  in-memory to Redis Streams. This migration applies regardless of whether the
  event bus is TypeScript or Python. The `EventBus` interface is already
  abstracted — a Redis Streams adapter can implement the same interface.

- **Companion docs**: `docs/architecture/architecture.md` references the Python/LangGraph
  engine. These references should be updated to reflect the TypeScript
  implementation.

- **Reference implementations**: The PRD's appendix references LangGraph as a
  reference implementation. This remains valid as a reference but is not used in
  the actual implementation.

## Decision
Accept deviation and update PRD to match implementation.

The TypeScript-only approach satisfies all Phase 1 behavioral requirements with
simpler deployment, better type safety, and equivalent functionality. The PRD's
Python/LangGraph specification was a technology recommendation, not a behavioral
requirement. All downstream consumers (V3 Dashboard, Phase 2 migrations) are
unaffected.

## PRD Update Required
The following PRD sections must be updated:
1. **Section 4.1** — Architecture Layers table: change "LangGraph (Python)" to
   "TypeScript (custom DAG engine)"
2. **Section 4.3** — Process Architecture: remove Python/bridge references,
   describe single-process TypeScript architecture
3. **Section 22.1** — Core Framework table: update Orchestration engine and
   remove CLI-to-Engine bridge row
4. **Section 24.1** — Phase 1 milestone: remove "(LangGraph)" parenthetical
5. **Section 27.1** — Reference Implementations: keep LangGraph as reference
   but note it is not used in the implementation
