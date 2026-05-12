# Coordination & State

> Authoritative source: [vision.md Layers 2 and 4](../vision.md#layer-2-coordination-substrate)

Each spine stage reads from shared state, does its work, and writes back the fields it changed. The runtime merges updates automatically using declared merge rules. No message passing, no event subscriptions — stages coordinate by reading and writing named, typed slots called **channels**.

A **channel** is a named typed slot in the shared state (e.g., `gaps: readonly Gap[]`). A **reducer** is the merge rule that decides how a channel update combines with its previous value. CHIP uses 14 last-write-wins channels (newest value replaces the old) and 1 accumulator channel (`humanResponses` — each HITL round appends answers without losing previous rounds). This combination, together with telemetry separated onto its own plane and a checkpointer that enables HITL resume across interrupts, is what makes CHIP's coordination concrete rather than a generic LangGraph default.

Research Report Part 1, ["Inter-agent communication,"](../research/research-report.md#part-1-ideal-sdlc-framework-architecture) ranks five coordination patterns and concludes: "Shared typed state (channels + reducers) — the right default for spine-level artifacts." Event buses lose type information at boundaries, producing silent drift bugs that are expensive to debug in production agent pipelines ([Design Decisions, Section 1.2](../design-decisions.md#12-coordination-typed-channels-not-event-bus)).

## How it works

```mermaid
graph LR
    subgraph State ["Shared State (typed channels)"]
        direction TB
        CH1["rawInput: string"]
        CH2["gaps: Gap[]"]
        CH3["questions: Question[]"]
        CH4["humanResponses: HumanResponse[]"]
        CH5["requirement: EnrichedRequirement"]
        CH6["prdDraft: PRD"]
    end

    A["Stage A"] -->|"writes gaps, questions"| State
    State -->|"reads rawInput, context"| A
    B["Stage B"] -->|"writes requirement"| State
    State -->|"reads gaps, humanResponses"| B
    C["Stage C"] -->|"writes prdDraft"| State
    State -->|"reads requirement, assumptions"| C

    style CH4 fill:#F39C12,color:#fff
```

Channels with a white background use last-write-wins (LWW). The orange channel (`humanResponses`) uses an accumulator reducer — each round's answers append.

Every node function receives the full state and returns `Partial<State>` — only the fields it changed. LangGraph's channel reducers merge the partial into the full state automatically. Shape errors are caught at authoring time because channels are typed with TypeScript generics and Zod schemas.

## Worked example: Clarifier state channels

The Clarifier graph (`packages/agents-clarifier/src/graph/state.ts`) defines 15 typed channels via `Annotation.Root()`:

```typescript
export const ClarifierStateAnnotation = Annotation.Root({
  rawInput:    Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  mode:        Annotation<ClarifierMode>({ reducer: (_, b) => b, default: () => 'bootstrap' }),
  context:     Annotation<ClarifierContext>({ reducer: (_, b) => b, default: () => ({}) }),
  gaps:        Annotation<readonly Gap[]>({ reducer: (_, b) => b, default: () => [] }),
  questions:   Annotation<readonly Question[]>({ reducer: (_, b) => b, default: () => [] }),
  // The only accumulator: each HITL round's answers append, never overwrite
  humanResponses: Annotation<readonly HumanResponse[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  requirement: Annotation<EnrichedRequirement | null>({ reducer: (_, b) => b, default: () => null }),
  assumptions: Annotation<AssumptionLedger | null>({ reducer: (_, b) => b, default: () => null }),
  round:       Annotation<number>({ reducer: (_, b) => b, default: () => 1 }),
  // ... plus maxRounds, error, prdDraft, featurePlan, criticRetries, criticPassed, escalationDecision
});
```

`Annotation.Root()` is LangGraph's channel declaration API — each field becomes a named typed channel with an explicit reducer and default value.

Two reducer strategies appear:

| Reducer | Behavior | Used by |
|---------|----------|---------|
| `(_, b) => b` | Last-write-wins | 14 of 15 channels (`rawInput`, `gaps`, `requirement`, `assumptions`, etc.) |
| `(a, b) => [...a, ...b]` | Accumulator (append) | `humanResponses` only — each HITL round adds answers without losing previous rounds |

The graph compiles with HITL interrupts at `storyWriter` (human answers questions) and `escalationGate` (accept/restart/abandon after max rounds):

```typescript
const compiled = graph.compile({
  interruptBefore: ['storyWriter', 'escalationGate'],
  checkpointer,  // MemorySaver or PostgresSaver
});
```

When an interrupt fires, the checkpointer persists the full channel state. The dashboard resumes by calling `compiled.invoke()` with the same `threadId` — the graph picks up exactly where it left off.

## Components

| Component | File | Role |
|-----------|------|------|
| `ClarifierStateAnnotation` | `packages/agents-clarifier/src/graph/state.ts` | Channel definitions with reducers |
| `compileClarifierGraph()` | `packages/agents-clarifier/src/graph/clarifier-graph.ts` | Graph topology: 9 nodes, conditional edges, HITL interrupts |
| `routeAfterCritic()` | same file | Routes to retry, new round, escalation, or complete |
| `routeAfterPrdUpdater()` | same file | Routes to gap detector or completion after PRD merge |
| `routeAfterEscalation()` | same file | Routes to accept, restart, or abandon |
| `createCheckpointer()` | `packages/core/src/checkpointer/index.ts` | `MemorySaver` (dev) or `PostgresSaver` (when `DATABASE_URL` set) |
| Cross-boundary Zod schemas | `packages/core/src/types/cross-boundary-artifacts.schemas.ts` | 10 schemas for artifacts crossing stage boundaries |

## Telemetry plane

`EventEmitter` from `eventemitter3` handles observability only — it is not a coordination mechanism. `TracedProvider` in `packages/telemetry/` wraps LLM calls with OTel spans. `LangfuseSink` emits pipeline-stage lifecycle spans. `CompositeSink` combines transport sinks (CLI stdout, dashboard SSE) with LangfuseSink.

The Clarifier's only event emission is `writeBridgeEvent()` after successful completion — a telemetry notification, not a control-flow signal.

## Current implementation

- **Zod schemas:** 10 cross-boundary artifact schemas in `packages/core/src/types/cross-boundary-artifacts.schemas.ts` (AssumptionLedger, EnrichedRequirement, PRD, FeaturePlan, ChangeClassification, ScreenPlan, APIChangeSet, Diff, ReviewResult).
- **Persistence:** Checkpointer factory operational. Postgres via Docker Compose at `docker/docker-compose.agentforge.yml` (Postgres 16, port 5433). See [State Persistence](state-persistence.md) for storage tiers and crash recovery details.

## Known limitations

- Older design pipeline code paths still use EventEmitter for some control flow — migration to typed channels is ongoing per vision Layer 2.
- The gap-detector node defines LLM response schemas as raw JSON Schema objects rather than using `zod-to-json-schema` — a deviation from the typed contract rule.
- State persistence degrades silently to in-memory when `DATABASE_URL` is unset — crash recovery is unavailable in dev without explicit Postgres setup.

## Related

- [State Persistence](state-persistence.md) — where state lives: YAML artifacts, checkpointer tiers, crash recovery
- [Clarifier Pipeline](clarifier-pipeline.md) — the nine-node graph that uses these channels
- [Vision Layer 2](../vision.md#layer-2-coordination-substrate) — coordination authority
- [Vision Layer 4](../vision.md#layer-4-state-and-persistence) — persistence authority
- [ADR-043](../adrs/ADR-043-typescript-only-orchestration.md) — LangGraph adoption
- [Observability](observability.md) — telemetry plane details
- [Research Report Part 1](../research/research-report.md#part-1-ideal-sdlc-framework-architecture) — coordination pattern analysis
- [Design Decisions §1.2](../design-decisions.md#12-coordination-typed-channels-not-event-bus) — why channels over event bus
