# Clarifier Phase 1 — Answer Key

## Turn 2 — Answers

1. **TypeScript LangGraph** `StateGraph` from `@langchain/langgraph`. NOT plain async. NOT Python.
   - `docs/vision.md` → Layer 1 (locked: "TypeScript LangGraph is the sole orchestration runtime")
   - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Context for Phase 1 implementers" block

2. **`interrupt_before`** on the story-writer/synthesizer node. State persists in **Postgres checkpointer** via `createCheckpointer()` from `@agentforge/core`. Human answers resume the graph via `graph.invoke(humanResponse, { configurable: { thread_id } })`.
   - `docs/vision.md` → Layer 10 ("All HITL implemented as LangGraph interrupts: State persists in the Postgres checkpointer")
   - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Context for Phase 1 implementers" block, Task 1.7

3. Two modes: **bootstrap** (catalog, pattern library, platform constraints — file reads, no RAG) and **evolution** (codebase via RAG). Evolution mode calls all 5 tools: **`searchCodeTool`**, **`searchDocsTool`**, **`searchDesignsTool`**, **`getRepoMapTool`**, **`findSimilarPatternsTool`**.
   - `docs/vision.md` → Layer 5 ("Evolution: codebase via RAG, existing designs, ADRs, PRD")
   - `docs/plans/active/clarifier-initiative/execution-plan.md` → Task 1.1 + "Context for Phase 1 implementers" block

4. They live in **`packages/core/src/types/cross-boundary-artifacts.schemas.ts`** (Phase 0.2). **Do NOT duplicate** in `agents-clarifier/src/schemas.ts`. Import from `@agentforge/core`. Only internal types (`ClarifierState`, `Gap`, `Question`, `ClarifierContext`) go in the agent package.
   - `CLAUDE.md` → "Every artifact that crosses an agent boundary has a Zod schema in `packages/core/src/types/`"
   - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Context for Phase 1 implementers" block

5. Seven items: (1) `packages/cli/src/commands/init.ts` — add to `buildAgentsYaml()`, (2) `packages/core/src/events/domain-events.ts` — add on_complete event, (3) `packages/core/src/index.ts` — export the new event type, (4) agent implementation in `packages/agents-*/src/`, (5) `packages/governance/src/permission-checker.ts`, (6) `packages/governance/src/hitl-enforcer.ts`, (7) integration test.
   - `.claude/rules/new-agent.md`

6. Tasks **1.2** (PRD Analyzer), **1.3** (Gap Detector), **1.5** (Story Writer/Synthesizer) make LLM calls. Every LLM call must use **`createTracedProvider()`** from `@agentforge/telemetry` per **ADR-046**.
   - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Context for Phase 1 implementers" block
   - `docs/adrs/ADR-046-langfuse-observability.md`

7. `screenId` is derived via **`basename(filePath, '.json')`** — e.g., `agentforge/designs/dashboard.json` → `dashboard`. It is NOT stored in the spec JSON because the filename IS the screen identifier in the `agentforge/designs/` convention.
   - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Context for Phase 1 implementers" block
   - `packages/retrieval/src/indexing/design-indexer.ts` → line 112

8. Three docs in order: (1) **`docs/vision.md`** — architectural vision, (2) **`docs/specs/PRD.md`** — product spec, (3) **`CLAUDE.md`** — development discipline rules. When they conflict: `CLAUDE.md` security/test rules > `vision.md` > ADRs > `PRD.md` > codebase.
   - `CLAUDE.md` → "Reading order (IMPORTANT)" section

9. **NO.** Do NOT follow the `runDesignPipeline` plain async pattern. The Clarifier must use **LangGraph StateGraph** with `interrupt_before` for HITL. The original plan proposed plain async but was challenged — vision Layer 1 locks LangGraph as the sole runtime, and Layer 10 requires LangGraph interrupts for HITL. This was resolved in the 2026-04-28 challenge report.
   - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Context for Phase 1 implementers" block (first bullet)
   - `docs/vision.md` → Layer 1 (locked), Layer 10

10. **`RequirementsClarified`** event. It is for the **telemetry plane** only — NOT coordination. Vision Layer 2: "Event bus is demoted to telemetry only. It is not the coordination substrate."
    - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Context for Phase 1 implementers" block ("Domain event name" bullet)
    - `CLAUDE.md` → "Event Registry Completeness" section + "Scope clarification" note
    - `docs/vision.md` → Layer 2

11. "Design retrieval gap was closed (2026-04-28). `design-indexer.ts` and `design-search.ts` were added to complete Task 2.3b. The `searchDesigns` method is now on the `RetrievalTools` interface."
    - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Context for Phase 1 implementers" block (last bullet before exit criteria)

12. "User submits seed at `/new`, clarifier asks <=7 questions in <=3 rounds, produces structured PRD YAML with assumption ledger, dashboard shows PRD for approval. Both modes (bootstrap + evolution) work. HITL interrupt persists in Postgres (survives page refresh). All tests green (typecheck, unit, lint, E2E)."
    - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Phase 1 exit criteria" paragraph

13. **`packages/agents-clarifier/src/graph/state.ts`**. Uses **`Annotation.Root()`** from `@langchain/langgraph`. Each channel gets a **`reducer`** function (last-write-wins for scalars, concatenation for arrays) and a **`default`** factory.
    - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Implementation gotchas" block
    - `packages/agents-clarifier/src/graph/state.ts` → lines 17-38

14. **`packages/core/src/events/event-bus.test.ts`** needs updating in **2 locations**: the `fixtures` record (line ~360) and the `allEventTypes` string array (line ~565). Missing either causes a typecheck or test failure respectively.
    - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Implementation gotchas" block
    - `.claude/rules/domain-events.md` → "New Domain Event Checklist" (lists the file but not the two-location requirement)

15. **Yes**, because it has `.md` prompt files in `src/prompts/` that need `cp -r src/prompts/* dist/prompts/` in the build. Packages WITHOUT prompt files (like `retrieval`, `telemetry`) use Nx auto-inferred targets and need NO `project.json`. The trap: you might think "no" because the cleanest examples (`telemetry`, `retrieval`) don't have one.
    - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Implementation gotchas" block
    - `packages/agents-clarifier/project.json` (exists, with prompt copy command)
    - `packages/agents-ux/project.json` (same pattern)
