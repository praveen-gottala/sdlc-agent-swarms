# Clarifier Phase 1 Remaining — Answer Key

## Turn 2 — Answers

1. Six factories: (1) **`createContextRetriever`** in `src/nodes/context-retriever.ts`, (2) **`createPrdAnalyzer`** in `src/nodes/prd-analyzer.ts`, (3) **`createGapDetector`** in `src/nodes/gap-detector.ts`, (4) **`createQuestionPrioritizer`** in `src/nodes/question-prioritizer.ts`, (5) **`createStoryWriter`** in `src/nodes/story-writer.ts`, (6) **`createCritic`** in `src/nodes/critic.ts`. All under `packages/agents-clarifier/`.
   - `packages/agents-clarifier/src/nodes/index.ts` — barrel exports all 6
   - `packages/agents-clarifier/src/graph/clarifier-graph.ts` — imports and wires all 6

2. `emitComplete` currently **returns an empty object** (`return {}`). Task 1.7 must add emission of the **`RequirementsClarified`** domain event. The event is already registered in `packages/core/src/events/domain-events.ts` (added in Task 1.0) with fields: `mode`, `questionCount`, `roundCount`, `assumptionCount`, `confidence`.
   - `packages/agents-clarifier/src/graph/clarifier-graph.ts` → `emitComplete` function (line 65)
   - `docs/plans/active/clarifier-initiative/execution-plan.md` → Task 1.7

3. The event was **already registered** in Task 1.0 — `event-bus.test.ts` already has `RequirementsClarified` in both `fixtures` and `allEventTypes`. For Task 1.7 (emission), the integration test should verify the event is emitted after the graph completes. The test file is `packages/agents-clarifier/src/__tests__/clarifier-pipeline.integration.test.ts` (to be created).
   - `docs/plans/active/clarifier-initiative/execution-plan.md` → Task 1.7 remaining work

4. **`runClarifierPipeline(input: ClarifierInput)`** in **`packages/agents-clarifier/src/run.ts`**. On **HITL interrupt**: catches `GraphInterrupt`, calls `compiled.getState()`, returns `Ok({ state, threadId, interrupted: true })`. On **completed run**: returns `Ok({ state, threadId, interrupted: false })`. On error: returns `Err({ code: 'GRAPH_ERROR', message })`.
   - `packages/agents-clarifier/src/run.ts` → full file

5. Two HITL interrupt points: (1) **`storyWriter`** — fires after question prioritizer; human answers questions before story writer runs. (2) **`escalationGate`** — fires after max rounds exhausted; human chooses **accept/restart/abandon**. Configured via `interruptBefore: ['storyWriter', 'escalationGate']`.
   - `packages/agents-clarifier/src/graph/clarifier-graph.ts` → `compileClarifierGraph` (line 103)

6. `RequirementsClarified` is a **telemetry plane event**, NOT a coordination event. Two valid emission mechanisms exist: (a) **EventEmitter** — the legacy telemetry bus pattern used by existing domain events. Would require adding an optional `eventBus` field to `ClarifierDeps`. (b) **OTel/LangfuseSink** — the newer observability pattern (ADR-046). Already wired via `TracedProvider`. Either approach is acceptable. The trap is using the event for **coordination** (graph routing) — that must use LangGraph channels, not events.
   - `CLAUDE.md` → "Event Registry Completeness" section, "Scope clarification" note
   - `docs/vision.md` → Layer 2: "Event bus is demoted to telemetry only"
   - Implementation decision: whichever mechanism is chosen, the event must NOT influence graph routing

7. Reuse the **ChatTab pattern** from `packages/dashboard/src/components/design/design-inspector.tsx` **lines 497-560**. Also reuse event polling via `/api/events`.
   - `docs/plans/active/clarifier-initiative/execution-plan.md` → Task 1.8 "Reuse" section

8. Resume via **`graph.invoke(humanResponse, { configurable: { thread_id } })`** where `thread_id` is the checkpoint thread ID from the initial run. The dashboard calls `POST /api/clarifier/respond` which passes the human answers and resumes the graph.
   - `docs/plans/active/clarifier-initiative/execution-plan.md` → Task 1.8 route descriptions
   - `docs/vision.md` → Layer 10: "On decision, graph resumes from the interrupt point"

9. Phase 1 exit criteria: (1) User submits seed at **`/new`**, (2) clarifier asks **<=7 questions** in **<=3 rounds**, (3) produces **structured PRD YAML** with **assumption ledger**, (4) dashboard shows **PRD for approval**, (5) **both modes** (bootstrap + evolution) work, (6) **HITL interrupt persists in Postgres** (survives page refresh), (7) all tests green (**typecheck, unit, lint, E2E**).
   - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Phase 1 exit criteria"

10. Three docs in order: (1) **`docs/vision.md`**, (2) **`docs/specs/PRD.md`**, (3) **`CLAUDE.md`**.
    - `CLAUDE.md` → "Reading order (IMPORTANT)"

11. PRD Analyzer uses **`claude-opus-4-6`** (Opus) because "structured intent extraction from ambiguous raw input requires stronger reasoning." Gap Detector and Story Writer use **`claude-sonnet-4-6`** (Sonnet) — adequate for divergence analysis and criteria generation at lower cost.
    - `docs/plans/active/clarifier-initiative/execution-plan.md` → Task 1.2 "Model" field

12. **`ClarifierDeps`** interface in **`packages/agents-clarifier/src/deps.ts`**. **Factory pattern**: each node is `create*(deps: ClarifierDeps) → ClarifierNodeFn`. Fields: `provider` (LLMProvider), `retrievalTools?` (RetrievalTools), `projectRoot` (string), `projectId` (string).
    - `packages/agents-clarifier/src/deps.ts`

13. **`ClarifierInput`** is defined in **`packages/agents-clarifier/src/run.ts`**. Fields: `rawInput` (string), `mode` (ClarifierMode), `provider` (LLMProvider), `projectRoot` (string), `projectId` (string), `retrievalTools?` (RetrievalTools), `maxRounds?` (number, default 3), `threadId?` (string), `checkpointer?` (BaseCheckpointSaver).
    - `packages/agents-clarifier/src/run.ts` → `ClarifierInput` interface

14. **Do NOT create a new StateGraph.** Call **`runClarifierPipeline()`** from the dashboard API route (`/api/clarifier/route.ts`). It creates, compiles, and invokes the graph internally. The dashboard only needs to pass a `ClarifierInput` and handle the `ClarifierOutput` (checking `interrupted` flag). For HITL resume, call `runClarifierPipeline()` again with the same `threadId` — the checkpointer resumes from the interrupt point.
    - `packages/agents-clarifier/src/run.ts` → `runClarifierPipeline` function
    - `docs/plans/active/clarifier-initiative/execution-plan.md` → Task 1.8

15. `CostRecord` requires **`model: string`** and **`timestamp: string`** beyond the USD amounts (`inputCostUsd`, `outputCostUsd`, `totalCostUsd`). The field names are `*CostUsd` not `*Cost`. SWC-transformed Jest tests compile without type errors; only `tsc --build` catches it.
    - `packages/core/src/types/cost.ts` → `CostRecord` interface
    - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Implementation gotchas (Tasks 1.2-1.6)"
