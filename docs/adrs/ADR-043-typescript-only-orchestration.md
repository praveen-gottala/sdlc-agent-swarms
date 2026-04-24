# ADR-043: TypeScript-Only Orchestration — Deprecate Python Engine, Commit to @langchain/langgraph

## Date

2026-04-23

## Status

Accepted

Supersedes ADR-022 (TypeScript-Only Orchestration Engine) where they conflict —
specifically the "custom DAG engine" framing, the unresolved option (a)-vs-(b)
question, and the absence of a deletion timeline for `services/engine/`.
ADR-022 status changes from "Partially Implemented" to "Superseded by ADR-043."

Fulfills the vision document Layer 1 requirement for formal Python engine
deprecation.

## Context

### What in services/engine/ actually runs today

`services/engine/` is a Python LangGraph prototype (~1,860 lines source,
~2,148 lines tests). It contains:

**Five LangGraph StateGraphs (one per SDLC phase):**

| Phase | Nodes | HITL Gates | Notable Patterns |
|---|---|---|---|
| design | 7 | 2 (`human_review`, `human_approve`) | Conditional loop: rejected wireframe routes back to `wireframe` node |
| spec | 3 | 1 (`human_review`) | Linear; simplest graph |
| code_gen | 7 | 1 (`human_review`) | CI retry loop (max 3), SlotManager concurrency |
| cicd | 7 | 1 (`human_approve`) | Build-fix retry loop (max 3), health-check conditional edges |
| observe | 1 | 0 | Single `monitor` node; placeholder |

**Supporting infrastructure:**
- FastAPI server (`server.py`, 301 lines) with 6 endpoints: `/phase/start`,
  `/phase/pause`, `/status`, `/gate/approve`, `/task/abort`, `/health`
- `MemorySaver` checkpointer for graph state persistence
- `SlotManager` (`concurrency.py`, 67 lines) for concurrent agent slot limits
- Task dependency resolver (`task_resolver.py`, 84 lines) with cycle detection
- File-based event bridge (`event_bridge.py`, 112 lines) using JSON Lines for
  cross-process communication
- 30 Pydantic domain event models (`models.py`, 509 lines) mirroring TypeScript types
- YAML round-trip I/O (`config.py`, 62 lines) via `ruamel.yaml`

**What it does NOT have:**
- Zero LLM calls — every agent node produces hardcoded stub output
- No LLM provider SDKs installed (no `anthropic`, `openai`, `langchain-anthropic`)
- No real computation in any graph node

**How it connects to the rest of the system:**
- `packages/cli/src/engine-client.ts` (215 lines) spawns the engine as a
  `uvicorn` subprocess with PID tracking and health polling
- `packages/cli/src/engine-setup.ts` (387 lines) bootstraps a Python venv
- The `agentforge start`, `status`, `approve`, and `abort` CLI commands call
  the Python engine's REST endpoints
- **No active workflow reaches this path.** All real agent execution uses the
  TypeScript in-process path.

**Dependencies** (from `pyproject.toml`):
```
langgraph>=0.2, langchain-core>=0.2, fastapi>=0.110, uvicorn>=0.27,
pydantic>=2.0, pyyaml>=6.0, ruamel.yaml>=0.18
```

### Which packages already have agent logic in TypeScript

All real agent implementations are TypeScript, running in-process via
`runAgent()` from `@agentforge/core`:

| Package | Agents | What They Do |
|---|---|---|
| `@agentforge/core` | — | `runAgent()` orchestrator, EventEmitter event bus, task manager, state persistence (YAML), learnings manager, MCP client |
| `@agentforge/governance` | — | Permission checker, budget tracker, HITL enforcer, audit logger (ADR-004 ordering) |
| `@agentforge/agents-ux` | 7 | Research, planning, design, implementation, review, testing, Penpot browser — all with real LLM calls |
| `@agentforge/agents-spec` | 2 | Spec writer, task decomposer |
| `@agentforge/agents-code` | 3 | Frontend coder, backend coder, test writer |
| `@agentforge/agents-cicd` | 4 | Build agent, security scanner, PR manager, deploy agent |

**Total: 16+ agent work functions with real LLM logic, zero Python dependency.**

The active orchestration path is:
```
CLI command → TypeScript command handler → import agent from agents-*
  → runAgent() → resolveModel() → resolveProvider() → governance pipeline
  → workFn() calls LLM provider → emit on_complete → return result
```

No Python process is involved.

### The zombie problem

Two orchestrators exist. Only one is alive:
- The Python engine has the right graph patterns (declarative topology, typed
  state, HITL interrupts, checkpointing) but zero real agent logic.
- The TypeScript packages have the right agent logic (16+ agents with real LLM
  calls) but use imperative `if/else` and `Promise.all` instead of declarative
  graphs.

Maintaining both forces cross-language serialization (the JSON Lines bridge) or
duplicate logic (Pydantic models mirroring TypeScript types). The Python engine
is the zombie — it consumes maintenance attention without delivering value.

`CLAUDE.md` currently says "Decision pending: TypeScript vs Python engine for
future phases (needs ADR)" and "Treat orchestration authority as unresolved."
This ADR resolves both.

## Decision

### 1. Close ADR-022's open question: choose option (a)

ADR-022 left open whether to "(a) port LangGraph patterns to TypeScript
orchestrator" or "(b) wire real agents into the existing Python engine."

**We choose option (a).** Port LangGraph's declarative graph topology, typed
state channels, HITL interrupts, and checkpointing to TypeScript via the
`@langchain/langgraph` npm package. Do not wire real agents into the Python
engine.

Rationale: all 16+ agent implementations are TypeScript. Porting graph patterns
to TypeScript (~500 lines of wiring) is far cheaper than porting 16+ agents to
Python (~10,000+ lines of agent logic plus provider integrations).

### 2. Formally deprecate services/engine/

`services/engine/` is deprecated effective immediately. Deletion is scheduled
for migration Phase M-4 (see Migration Plan below). This is not passive neglect
— it is active removal with defined cutover criteria.

### 3. Commit to @langchain/langgraph (TypeScript)

The orchestration runtime is `@langchain/langgraph` (TypeScript), not a generic
"custom DAG engine" (ADR-022's framing). This aligns with the vision document
Layer 1 locked decision.

`@langchain/langgraph` provides:
- `StateGraph` with declarative node/edge topology
- Typed state channels (with Zod schemas in TS)
- `interrupt_before` / `interrupt_after` for HITL gates
- `MemorySaver` (dev) and `PostgresSaver` (production) checkpointers
- Conditional edges via router functions
- LangGraph Studio compatibility for visual debugging

### 4. Demote event bus to telemetry

Per vision document Layer 2, `EventEmitter` becomes telemetry-only. Typed
LangGraph state channels with Zod schemas become the coordination substrate.
The `CLAUDE.md` rule "Agents communicate via event bus ONLY" must be rewritten
to: "Agents coordinate via typed LangGraph channels. Event bus is for telemetry
only."

## Patterns Worth Porting from the Python Engine

The Python engine contains real orchestration patterns that the TypeScript
codebase lacks. These are worth porting — the agent stubs are not.

| Python Pattern | Source | TS Equivalent Today | Action |
|---|---|---|---|
| Declarative `StateGraph` topology | `graphs/*.py` | Imperative `if/else` in orchestration functions | **Port:** rebuild as `@langchain/langgraph` `StateGraph` in TS |
| Typed state schemas per phase | `BasePhaseState` (TypedDict) | No typed graph state; agents receive ad-hoc input | **Port:** define Zod schemas for each phase graph's state channels |
| HITL via `interrupt_before` | `server.py` graph compilation | Governance middleware `pause` + YAML polling | **Port:** use `@langchain/langgraph` interrupt API |
| Conditional edge routers | `_route_after_review()`, `_route_after_ci()` | TypeScript `if/else` after agent returns | **Port:** use `addConditionalEdges()` |
| `MemorySaver` checkpointing | `server.py` line 39 | None — process death loses run state | **Port:** closes ADR-022's acknowledged gap |
| `SlotManager` concurrency | `concurrency.py` (67 lines) | None in graph layer | **Port:** 67 lines of pure algorithmic code |
| Task dependency resolver | `task_resolver.py` (84 lines) | Partial in `@agentforge/core` task manager | **Port:** 84 lines of pure algorithmic code |
| File event bridge | `event_bridge.py` (112 lines) | `file-event-bridge.ts` (125 lines) | **Delete both:** single runtime eliminates need for cross-language bridge |
| Pydantic domain event models | `models.py` (509 lines) | `domain-events.ts` with typed union | **Delete Python side:** TypeScript is canonical |
| FastAPI HTTP server | `server.py` (301 lines) | None needed — CLI calls in-process | **Do not port:** in-process TS calls are simpler; dashboard API serves HTTP if needed |

## Migration Plan

### Phase M-1: Foundation

- Install `@langchain/langgraph` as a dependency of `@agentforge/core`
- Define `BasePhaseState` Zod schema: `projectRoot`, `phase`, `tasks`,
  `events`, `hitlDecision`, `hitlFeedback`, `error`
- Integrate `MemorySaver` checkpointer for local development
- Port `SlotManager` to TypeScript (67 lines, pure algorithmic)
- Port `find_runnable_tasks()` and `detect_circular_deps()` to TypeScript
  (84 lines, pure algorithmic)

**Cutover criterion:** a `StateGraph` from `@langchain/langgraph` compiles and
runs a trivial 2-node graph with checkpoint save/restore in the existing test
harness.

### Phase M-2: Port one graph end-to-end (proof of concept)

- Port `spec_phase` — the simplest graph (3 nodes, linear, 1 HITL gate)
- Replace stub nodes with calls to existing `@agentforge/agents-spec` agents
  (`specWriterWork`, `taskDecomposerWork`)
- Wire `interrupt_before: ["human_review"]` using `@langchain/langgraph`
  interrupt API
- Add `SpecPhaseState` Zod schema extending `BasePhaseState`
- Validate: graph runs, checkpoints, interrupts, resumes, and produces the same
  artifacts as the current imperative `runAgent()` flow

**Cutover criterion:** `agentforge start spec` executes the TypeScript LangGraph
graph instead of spawning the Python engine.

### Phase M-3: Port remaining graphs

Port order (complexity-ascending):
1. **design** (7 nodes, 2 HITL gates, conditional wireframe loop) — tests
   conditional edge routing and the most complex HITL flow
2. **code_gen** (7 nodes, CI retry loop, concurrency) — exercises ported
   `SlotManager` and task resolver
3. **cicd** (7 nodes, build-fix retry loop, deploy gates) — exercises
   deployment and health-check conditional edges
4. **observe** (1 node) — trivial; placeholder until observability agents exist

For each graph: define phase-specific Zod state, wire existing TypeScript agents
as node functions, add interrupt gates, add conditional edge routers.

**Cutover criterion:** all 5 phase graphs compile and pass test suites
equivalent to their Python counterparts.

### Phase M-4: Delete Python engine and cross-language bridge

Delete:
- `services/engine/` directory entirely (~4,000 lines)
- `packages/cli/src/engine-client.ts` (215 lines)
- `packages/cli/src/engine-setup.ts` (387 lines)
- `packages/core/src/events/file-event-bridge.ts` (125 lines)

Update:
- `packages/cli/src/commands/start.ts` — call TypeScript LangGraph graph
  directly instead of spawning uvicorn
- `packages/cli/src/commands/approve.ts`, `abort.ts` — remove
  `writeBridgeEvent` calls; approvals go through LangGraph interrupt resume
- `packages/cli/src/commands/doctor.ts`, `setup.ts` — remove Python
  prerequisite checks
- `CLAUDE.md` — remove "Decision pending" and "unresolved" language; rewrite
  event bus rule
- `docs/architecture/architecture.md` — remove Python/LangGraph layer reference

**Cutover criterion:** `grep -r "services/engine\|uvicorn\|pyproject\|engine-client\|engine-setup" packages/ docs/` returns zero hits. Full test suite passes.

## What Stays in Python

**Nothing.** No Python code is load-bearing in the current system. All 16+ real
agent implementations are TypeScript. No auxiliary Python service (ML
preprocessing, embedding pipeline, tree-sitter parser) exists in the codebase.

The vision document Layer 1 states "Python remains available for auxiliary
services only (not orchestration)." This ADR confirms there are currently zero
auxiliary Python services. The most likely future candidate — tree-sitter
parsing for RAG (vision Layer 6) — has TypeScript bindings (`tree-sitter` npm
package) and does not require Python. If a future auxiliary service genuinely
requires Python (no TypeScript equivalent exists), it would run as a standalone
tool or MCP server, not as an orchestration runtime. This is not an invitation
to reintroduce Python for convenience — TypeScript-first is the default.

## What Breaks Until Migration Is Complete

### Nothing breaks in active workflows

The Python engine is unreachable by any active workflow. The design pipeline
runs via dashboard API routes and `runAgent()`. No user-facing feature depends
on `services/engine/`.

### CLI commands with dead code paths

During migration (M-1 through M-3), these CLI commands hit dead code paths that
are harmless (the Python engine is never running):

| Command | Current Behavior | After M-4 |
|---|---|---|
| `agentforge start <phase>` | Attempts to spawn Python engine (fails if Python not installed) | Calls TypeScript LangGraph graph directly |
| `agentforge approve <taskId>` | Writes to file event bridge (no reader) | Approves via LangGraph interrupt resume |
| `agentforge abort` | Writes to file event bridge (no reader) | Aborts via LangGraph state update |
| `agentforge setup` | Bootstraps Python venv | Removed or repurposed for Node.js-only setup |
| `agentforge doctor` | Checks Python/pip prerequisites | Python checks removed |

### Temporary dual-path coexistence

During M-1 through M-3, the old `runAgent()` imperative flow and the new
LangGraph graphs coexist. The imperative flow remains the active path; LangGraph
graphs are validated in tests before cutover.

Risk: divergent behavior between imperative and graph flows. Engineers add
features to the imperative side because it is the active path, divergence
accumulates, and the cutover keeps slipping.

Mitigations:
- Each graph is validated against the same test scenarios as the imperative
  flow before the command-level cutover.
- **Feature freeze policy:** once a phase graph enters M-2/M-3 validation, no
  new features land on the imperative version of that phase — bug fixes only.
  This prevents the migration from becoming permanent.

## Deviations from ADR-022

| ADR-022 Statement | ADR-043 Position | Nature of Change |
|---|---|---|
| "custom DAG engine" (title, gap table, PRD update section) | `@langchain/langgraph` (TypeScript) | **Superseded:** ADR-022 left the orchestration framework unspecified; ADR-043 commits to a specific library |
| "decide whether to (a) port LangGraph patterns to TS or (b) wire real agents into Python engine" (Status section) | Option (a) chosen | **Closed:** ADR-022's open question resolved |
| "All behavioral requirements met" with checkpoint/replay acknowledged as gap | Checkpoint/replay gap closed via `MemorySaver`/`PostgresSaver` | **Enhanced:** ADR-043 addresses a gap ADR-022 deferred |
| No deletion timeline for `services/engine/` | Hard deletion after Phase M-4 | **New:** ADR-022 left removal implicit; ADR-043 makes it explicit with cutover criteria |
| PRD update: "change to TypeScript (custom DAG engine)" | PRD update: change to "`@langchain/langgraph` (TypeScript)" | **Superseded:** more specific technology commitment |
| Event bus architecture unchanged | Event bus demoted to telemetry per vision Layer 2 | **New scope:** ADR-043 addresses coordination substrate, which ADR-022 did not |

## Consequences

### Positive

- Single orchestration runtime eliminates cross-language serialization and
  duplicate domain models (~1,000 lines of Pydantic/bridge code)
- Declarative `StateGraph` topology makes phase flow visible and debuggable;
  LangGraph Studio compatible
- `MemorySaver`/`PostgresSaver` checkpointing provides crash recovery that the
  current system lacks (closes ADR-022's acknowledged gap)
- `interrupt_before` HITL gates replace polling-based governance approach,
  aligning with vision Layer 10
- Typed LangGraph channels with Zod schemas catch inter-agent payload errors at
  compile time
- Removing ~4,000 lines of Python and ~700 lines of bridge TypeScript reduces
  maintenance scope

### Negative

- `@langchain/langgraph` npm package becomes a hard runtime dependency; version
  coupling with LangChain ecosystem
- Migration effort: ~5-8 weeks for one developer. M-1 foundation (~1 week),
  M-2 spec graph POC (~1 week), M-3 four remaining graphs (~2-3 weeks,
  design graph alone has 7 nodes with conditional loops and concurrency),
  M-4 deletion and cleanup (~1 week). This competes with the eight-phase
  roadmap (Clarifier, RAG, etc.) for engineering bandwidth — schedule
  accordingly
- During M-1 through M-3, two orchestration patterns coexist temporarily
- Python test suite (2,148 lines) is lost — equivalent coverage must be rebuilt
  in TypeScript

### Risks

- **TypeScript SDK maturity:** `@langchain/langgraph` TypeScript is less
  battle-tested than the Python version. Mitigation: agent logic is TypeScript
  regardless; LangGraph provides graph structure, not agent implementation.
- **Vendor coupling:** `StateGraph` topology is LangGraph-specific. Mitigation:
  graph definitions are thin wrappers (~500 lines) around existing agent
  functions (~10,000+ lines); switching frameworks means rewriting wiring, not
  agents.
- **LangChain ecosystem volatility:** LangChain has historically shipped
  breaking changes across minor versions. Mitigation: pin `@langchain/langgraph`
  to an exact version in `package.json`, budget time for periodic upgrades, and
  keep graph wiring thin so version bumps stay contained.

## PRD Issues Found

This decision surfaces the following conflicts between the PRD and current state:

1. **Section 4.1 (Architecture Layers):** Currently says "TypeScript (custom DAG
   engine)" per ADR-022 update. Must be further updated to
   "`@langchain/langgraph` (TypeScript)" per this ADR.

2. **Section 4.2 (Core Design Principles):** States "Event-driven coordination:
   Agents communicate through an event bus, not direct calls." This conflicts
   with vision Layer 2 which demotes the event bus to telemetry-only and
   establishes typed LangGraph channels as the coordination substrate. Must be
   updated.

3. **Section 4.3 (Process Architecture):** Correctly describes single-process
   TypeScript architecture but does not mention LangGraph or checkpointing.
   Should reference `@langchain/langgraph` and `MemorySaver`/`PostgresSaver`.

4. **CLAUDE.md (Current State section):** Line "Decision pending: TypeScript vs
   Python engine for future phases (needs ADR)" is now resolved by this ADR.
   Line "Treat orchestration authority as unresolved until Phase 0 produces an
   ADR and migration plan" is now resolved.

5. **CLAUDE.md (Architecture section):** Rule "Agents communicate via event bus
   ONLY. No direct agent-to-agent calls." conflicts with vision Layer 2 and
   must be rewritten to describe LangGraph channel coordination as primary and
   event bus as telemetry-only.

6. **docs/architecture/architecture.md:** Still labels the orchestration layer
   as "Python / LangGraph" with an ADR-022 note. Should be updated to reference
   ADR-043 and `@langchain/langgraph` (TypeScript).

Additional PRD/vision conflicts exist outside orchestration scope (e.g.,
Section 24.2 parallel coders vs. vision Layer 8 single-threaded implementer,
Section 11.3.1 parallel agent pattern). These are tracked separately and not
exhaustively listed here.
