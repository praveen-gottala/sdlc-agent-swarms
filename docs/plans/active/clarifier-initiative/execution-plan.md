# Clarifier Initiative — Execution Plan

## Related Documents

- **Roadmap:** `docs/roadmap.md` Phases 0, 1, 2
- **Vision:** `docs/vision.md` Layer 2 (coordination), Layer 3 (spine), Layer 5 (Clarifier), Layer 6 (RAG), Layer 10 (HITL), Layer 14 (dashboard)
- **ADR-043:** `docs/adrs/ADR-043-typescript-only-orchestration.md` — LangGraph TypeScript commitment
- **Planning docs:** `docs/guides/planning-docs.md` — document lifecycle

## Context

The Clarifier is the first spine stage (vision Layer 3). Today, `/new` is a text box with no gap analysis, question loop, or assumption handling. This initiative builds the full six-stage Clarifier with both bootstrap and evolution modes, backed by real RAG retrieval.

**Resequenced roadmap:** Phase 0 -> Phase 2 (RAG) -> Phase 1 (Clarifier), instead of Phase 0 -> 1 -> 2. Rationale: evolution mode needs real semantic search, not stubs. RAG built first so the Clarifier demo shows grounded questions from day one.

**Context for implementers:**
- **Use LangGraph `StateGraph` from day one** — do NOT follow the plain async `runDesignPipeline` pattern. The Clarifier is the first LangGraph graph in the monorepo (see challenge report below).
- Follow `generateAppSpec` pattern for LLM calls with Zod schemas (`packages/agents-ux/src/app-spec/generate-app-spec.ts`)
- Follow `packages/agents-ux/` structure for new agent package scaffold
- See `.claude/rules/new-agent.md` for the full agent role checklist

---

## Progress Checklist

### Phase 0 — Foundation Completion
- [x] **0.1** ADR-043 orchestration runtime (pre-existing, merged)
- [x] **0.2** Typed cross-boundary artifact schemas (2026-04-28) — 9 Zod schemas + TS interfaces in `packages/core/src/types/cross-boundary-artifacts.{schemas,}.ts`. 25 tests (parse + reject invalid). Exported from barrel.
- [x] **0.3** Postgres checkpointer (2026-04-28) — `@langchain/langgraph-checkpoint` + `@langchain/langgraph-checkpoint-postgres` in core. Factory `createCheckpointer()`: MemorySaver when no DB, PostgresSaver when `DATABASE_URL` set. Docker Compose at `docker/docker-compose.agentforge.yml` (port 5433). 4 unit tests, 3 integration tests (skipped without `AGENTFORGE_TEST_POSTGRES`). Exported from core barrel.

### Phase 2 — RAG Layer
- [x] **2.0** Package scaffold + integration spike (2026-04-28) — `packages/retrieval/` scaffolded with ESM config, 3 client wrappers (Voyage embeddings, Cohere reranking, Qdrant vector store), config resolver, types, 23 unit tests, 1 integration test (gated). Native `tree-sitter` failed node-gyp on Node 25.8.1 — switched to `web-tree-sitter` 0.26.8 (WASM). Qdrant added to docker-compose (port 6333/6334). `cohere-ai` v8.0.0 (not 7.20.0 as planned). All monorepo checks green (typecheck 17 projects, 391 tests, lint).
- [x] **2.1** Aider-style repo map (2026-04-28) — Regex-based parser (deferred web-tree-sitter WASM to code chunker), symbol graph, personalized PageRank (damping 0.85, convergence 1e-6, seed file personalization), token-budgeted renderer. `generateRepoMap()` orchestrator with recursive directory scan. 5 test fixture files, 19 unit tests across parser/graph/pagerank/renderer/orchestrator. Verified: `add` (2 importers) ranks above `formatNumber` (0 importers). Output against repo-map source dir produces meaningful ~2000-char summary.
- [x] **2.2** Code embedding pipeline (2026-04-28) — `chunkCodeFile()` AST-aware chunking at symbol boundaries with merge/split. `tokenize()` + `buildVocabulary()` + `computeBM25Sparse()` for BM25 sparse vectors. `buildMerkleTree()` + `diffMerkleTrees()` for incremental indexing. `indexCodebase()` orchestrator: Merkle diff → chunk changed → batch embed (Voyage, 64/batch) → upsert Qdrant (dense+sparse). `searchCode()`: embed query → BM25 sparse → Qdrant hybrid (RRF) → Cohere rerank. 20 new unit tests (BM25, code-chunker, merkle-tree).
- [x] **2.3** Document embedding pipeline (2026-04-28) — `chunkMarkdown()` (heading-boundary splitting), `chunkYaml()` (top-level key splitting), `chunkDocument()` auto-detect. `indexDocuments()` orchestrator with Merkle diff. `searchDocs()` hybrid search. 8 new unit tests. Plus `chunkDesignSpec()` and `chunkCatalog()` for design retrieval (Task 2.3b). Design indexer (`indexDesigns()`) and design search (`searchDesigns()`) added 2026-04-28 — full design retrieval pipeline with `__`-prefix dir filtering, screenId from filename, Merkle-based incremental indexing, hybrid search + rerank. `searchDesigns` wired into `RetrievalTools` interface and tool factory. 10 new tests.
- [x] **2.4** RetrievedContext type + tool registration (2026-04-28) — `RetrievedContextSchema` (Zod) in `packages/core/src/types/retrieved-context.ts` with codeChunks, docChunks, designChunks, repoMap. 5 MCP-compatible tool definitions: `searchCode`, `searchDocs`, `searchDesigns`, `getRepoMap`, `findSimilarPatterns`. `createRetrievalTools(config, rootDir, projectId)` factory + `createRetrievalToolsFromEnv()` convenience. All exported from barrel.
- [x] **2.5** Golden query set + precision gate (2026-04-28) — 15 code + 5 doc golden queries with expected file paths. `computePrecisionAtK()` evaluator with prefix matching for directory-level expectations. 6 unit tests. Integration eval against live indexed monorepo gated by `AGENTFORGE_TEST_RETRIEVAL`. Gate: precision@5 >= 70% on both code and doc queries.

### Phase 1 — Clarifier
- [x] **1.0** Clarifier package scaffold (2026-04-28) — `packages/agents-clarifier/` with ESM config, 6 node stubs, LangGraph StateGraph with `interrupt_before` on storyWriter, `ClarifierStateAnnotation` with typed channels, internal Zod schemas (Gap, Question, ClarifierContext, HumanResponse). Full new-agent checklist: `RequirementsClarified` domain event, init.ts clarifier role, governance `clarify` phase + `clarification` HITL phase, CLAUDE.md deps. 7 scaffold tests, 391 monorepo tests green.
- [ ] **1.1** Context Retriever node (bootstrap: catalog; evolution: all 5 RAG tools incl. `searchDesignsTool`)
- [ ] **1.2** PRD/Request Analyzer node (forced-JSON, claude-opus-4-6, TracedProvider)
- [ ] **1.3** Gap/Conflict Detector node (deterministic checklist + ClarifyGPT, TracedProvider)
- [ ] **1.4** Question Prioritizer node (EVPI proxy ranking)
- [ ] **1.5** Story Writer / PRD Synthesizer node (EARS format, INVEST stories, TracedProvider)
- [ ] **1.6** Critic node (compliance check, bounded retry)
- [ ] **1.7** LangGraph StateGraph assembly (typed channels, `interrupt_before` for HITL, Postgres checkpointer)
- [ ] **1.8** Dashboard integration (`/new` bootstrap, `/evolve` evolution, chat UI)

**Context for Phase 1 implementers (2026-04-28 challenge report):**
- **LangGraph StateGraph from day one.** Do NOT use plain async `runDesignPipeline` pattern. The Clarifier is the first spine stage (vision Layer 3) and owns the first HITL checkpoint (Layer 10). HITL must use real LangGraph `interrupt_before` persisted to Postgres checkpointer, not simulated polling. This is the first LangGraph graph in the monorepo — validates the runtime pattern for all future spine stages.
- **Cross-boundary schemas already exist.** `EnrichedRequirementSchema` and `AssumptionLedgerSchema` are in `packages/core/src/types/cross-boundary-artifacts.schemas.ts` (Phase 0.2). Import from `@agentforge/core`, do NOT duplicate in `agents-clarifier/src/schemas.ts`. Only internal types (`ClarifierState`, `Gap`, `Question`, `ClarifierContext`) go in the agent package.
- **All 5 retrieval tools in evolution mode.** `searchDesignsTool` was missing from the original plan but vision Layer 5 explicitly lists "existing designs" as a Context Retriever source. The tool exists and is wired in `createRetrievalTools()`.
- **TracedProvider on every LLM call.** Observability Phase 1-3 is complete (ADR-046). All LLM calls must use `createTracedProvider()` from `@agentforge/telemetry`. Tasks 1.2, 1.3, 1.5 each make LLM calls.
- **Full new-agent checklist.** `.claude/rules/new-agent.md` requires 7 items: init.ts, domain-events, core barrel export, implementation, permission-checker, hitl-enforcer, integration test. Don't skip governance stubs.
- **`screenId` derivation for design search.** `chunkDesignSpec(filePath, content, screenId)` requires a third argument. The design indexer extracts screenId via `basename(filePath, '.json')`. This is NOT stored in the spec — it's derived from the filename.
- **Design retrieval gap was closed (2026-04-28).** `design-indexer.ts` and `design-search.ts` were added to complete Task 2.3b. The `searchDesigns` method is now on the `RetrievalTools` interface.
- **Domain event name:** Add `RequirementsClarified` to `packages/core/src/events/domain-events.ts`. This is a telemetry event (not coordination) per vision Layer 2.

**Implementation gotchas (discovered during Task 1.0, 2026-04-28):**
- **New-agent checklist has hidden test dependencies.** `.claude/rules/new-agent.md` lists 7 items, but two test files also need updating: `event-bus.test.ts` requires the new event in BOTH its `fixtures` record AND its `allEventTypes` array; `agent-contract-schema-p12.test.ts` requires the new role in `PHASE_1_AGENTS`.
- **Packages with `.md` prompt files need a `project.json`.** Nx auto-infers targets for packages without non-TS assets, but prompt files require explicit `cp -r src/prompts/* dist/prompts/` in the build. See `packages/agents-ux/project.json` for the pattern. Packages without prompts (like `retrieval`, `telemetry`) need NO `project.json`.
- **LangGraph `Annotation.Root()` pattern.** First usage in the monorepo is `packages/agents-clarifier/src/graph/state.ts`. Each channel gets a `reducer` function (last-write-wins for scalars, concatenation for arrays like `humanResponses`) and a `default` factory. The `interruptBefore` option on `graph.compile()` takes an array of node names — e.g., `['storyWriter']`.
- **Governance phase naming convention.** `AgentAction.phase` uses short names (`clarify`, `design`, `spec`, `code`). `HITLPhase` uses descriptive names (`clarification`, `spec_review`, `code_generation`). The mapping is in `PHASE_MAPPING` in `hitl-enforcer.ts`.

**Phase 1 exit criteria:** User submits seed at `/new`, clarifier asks <=7 questions in <=3 rounds, produces structured PRD YAML with assumption ledger, dashboard shows PRD for approval. Both modes (bootstrap + evolution) work. HITL interrupt persists in Postgres (survives page refresh). All tests green (typecheck, unit, lint, E2E).

### Phase 1 Task Detail

Six internal stages (vision Layer 5), wired as a **LangGraph `StateGraph`** with typed channels and `interrupt_before` for HITL (vision Layers 1, 10). This is the first LangGraph graph in the monorepo — validates the runtime pattern for all future spine stages.

**Challenge report applied (2026-04-28):** LangGraph from day one (not plain async), complete new-agent checklist, reuse existing cross-boundary schemas, add `searchDesignsTool` to Context Retriever, TracedProvider on all LLM calls.

#### Task 1.0: Clarifier Package Scaffold (0.5 session)

**Files to create:**
- `packages/agents-clarifier/package.json` — deps: `@agentforge/core`, `@agentforge/providers`, `@agentforge/retrieval`, `@agentforge/telemetry`, `@langchain/langgraph`, `@langchain/core`, `zod`
- `packages/agents-clarifier/tsconfig.json`, `tsconfig.lib.json`, `jest.config.cjs`, `project.json`
- `packages/agents-clarifier/src/index.ts` — barrel
- `packages/agents-clarifier/src/types.ts` — internal types only: `ClarifierState`, `ClarifierMode`, `Gap`, `Question`, `ClarifierContext`
- `packages/agents-clarifier/src/schemas.ts` — internal Zod schemas for `Gap`, `Question`, `ClarifierContext`. Cross-boundary schemas (`EnrichedRequirementSchema`, `AssumptionLedgerSchema`) imported from `@agentforge/core` — NOT duplicated here.

**Full new-agent checklist (per `.claude/rules/new-agent.md`):**
1. `packages/cli/src/commands/init.ts` — add `clarifier` to `buildAgentsYaml()` with all 7 PRD sections
2. `packages/core/src/events/domain-events.ts` — add `RequirementsClarified` event (telemetry plane)
3. `packages/core/src/index.ts` — export the new event type
4. Agent implementation — Tasks 1.1–1.7
5. `packages/governance/src/permission-checker.ts` — add clarifier role permissions (stub initially)
6. `packages/governance/src/hitl-enforcer.ts` — add clarifier HITL gate (Layer 10)
7. Integration test — `packages/agents-clarifier/src/__tests__/clarifier-pipeline.integration.test.ts`
8. CLAUDE.md Package Dependencies — add `agents-clarifier` depends on: `core`, `providers`, `retrieval`, `telemetry`

#### Task 1.1: Context Retriever Node (1 session)

- `packages/agents-clarifier/src/nodes/context-retriever.ts`
- Bootstrap: loads catalog from `packages/core/src/catalogs/base-component-catalog.yaml`, pattern library, platform constraints (file reads, no RAG)
- Evolution: calls `getRepoMapTool`, `searchCodeTool`, `searchDocsTool`, `searchDesignsTool` from `@agentforge/retrieval` (vision Layer 5)
- Output: `ClarifierContext` typed object

#### Task 1.2: PRD/Request Analyzer Node (1 session)

- `packages/agents-clarifier/src/nodes/prd-analyzer.ts`
- `packages/agents-clarifier/src/prompts/prd-analyzer-system.md` (frontmatter: version 1.0.0)
- Forced-JSON via `provider.complete(prompt, { responseSchema })` with Zod schema
- Model: `claude-opus-4-6` (vision Layer 5: reasoning)
- All LLM calls via `createTracedProvider()` from `@agentforge/telemetry` (ADR-046)
- Follows `generateAppSpec` pattern (`packages/agents-ux/src/app-spec/generate-app-spec.ts`)

#### Task 1.3: Gap/Conflict Detector Node (1 session)

- `packages/agents-clarifier/src/nodes/gap-detector.ts`
- **Pass 1 (deterministic):** checklist (auth, validation, error states, edge cases, NFR targets, metrics)
- **Pass 2 (ClarifyGPT):** 3 plausible implementations via LLM, divergence = gap. Model: `claude-sonnet-4-6`. Cost cap: 3 extra LLM calls.
- All LLM calls via `createTracedProvider()` (ADR-046)
- Output: `Gap[]` with `{ id, description, category, confidence, deterministic, divergentInterpretations? }`

#### Task 1.4: Question Prioritizer Node (0.5 session)

- `packages/agents-clarifier/src/nodes/question-prioritizer.ts`
- EVPI proxy: `blast_radius * answerability * confidence_gap`
- Budget: micro 0-2, standard 3-7, cross-cutting max 15/round, max 3 rounds
- Multiple-choice when codebase precedent exists (evolution mode)
- Below-threshold gaps become `AssumptionLedger` entries (using `AssumptionLedgerSchema` from `@agentforge/core`)

#### Task 1.5: Story Writer / PRD Synthesizer Node (1 session)

- `packages/agents-clarifier/src/nodes/story-writer.ts` (evolution: EARS stories)
- `packages/agents-clarifier/src/nodes/prd-synthesizer.ts` (bootstrap: structured PRD YAML)
- EARS format: "WHEN `<condition>` THE SYSTEM SHALL `<behavior>`"
- INVEST-compliant stories, typed feature DAG
- All LLM calls via `createTracedProvider()` (ADR-046)
- Output: `EnrichedRequirement` + `AssumptionLedger` (using schemas from `@agentforge/core`)

#### Task 1.6: Critic Node (0.5 session)

- `packages/agents-clarifier/src/nodes/critic.ts`
- INVEST + EARS compliance check, bounded retry (max 2)
- DAG consistency: no orphans, no cycles
- After 2 retries: flag as warnings, don't block

#### Task 1.7: LangGraph StateGraph Assembly (1.5 sessions)

- `packages/agents-clarifier/src/graph/clarifier-graph.ts` — LangGraph `StateGraph` definition
- **Typed state channels** with Zod schemas (vision Layer 2): `ClarifierState` containing `rawInput`, `mode`, `context`, `gaps`, `questions`, `requirement`, `assumptions`, `round`
- **Sequential node execution:** contextRetriever → prdAnalyzer → gapDetector → questionPrioritizer → storyWriter/prdSynthesizer → critic
- **HITL via `interrupt_before`** on the storyWriter/prdSynthesizer node — after question prioritizer produces batched questions, the graph interrupts. Human answers resume the graph. Timeout: 24h, fallback to assumptions.
- **Postgres checkpointer** via `createCheckpointer()` from `@agentforge/core` (Phase 0.3). State persists across interrupts.
- `packages/agents-clarifier/src/graph/state.ts` — typed state definition with `Annotation` from `@langchain/langgraph`
- `runClarifierPipeline()` convenience wrapper that creates graph, compiles, invokes with checkpointer.

#### Task 1.8: Dashboard Integration (2 sessions)

- `packages/dashboard/src/app/(dashboard)/new/page.tsx` — bootstrap clarifier UI (chat metaphor)
- `packages/dashboard/src/app/(dashboard)/evolve/page.tsx` — evolution clarifier UI
- `packages/dashboard/src/app/api/clarifier/route.ts` — calls `runClarifierPipeline`, passes checkpointer thread_id
- `packages/dashboard/src/app/api/clarifier/respond/route.ts` — human answers resume the LangGraph graph via `graph.invoke(humanResponse, { configurable: { thread_id } })`
- `packages/dashboard/src/components/clarifier/chat-interface.tsx` — shared chat component
- `packages/dashboard/src/components/clarifier/question-card.tsx` — multiple-choice display
- `packages/dashboard/src/components/clarifier/assumption-list.tsx` — assumption ledger display
- `packages/dashboard/src/components/clarifier/prd-preview.tsx` — PRD for approval
- **Reuse:** Extend existing ChatTab pattern from `packages/dashboard/src/components/design/design-inspector.tsx:497-560`. Reuse event polling via `/api/events`.

#### Patterns to Reuse

| Pattern | Source file |
|---------|------------|
| Result `Ok`/`Err` | `packages/core/src/types/result.ts` |
| LLM + Zod structured output | `packages/agents-ux/src/app-spec/generate-app-spec.ts` |
| TracedProvider wrapping | `packages/telemetry/src/traced-provider.ts` |
| Retrieval tool factory | `packages/retrieval/src/tools/tool-factory.ts` |
| Checkpointer factory | `packages/core/src/checkpointer/index.ts` |
| Package scaffold | `packages/telemetry/` (cleanest recent example) |
| Cross-boundary schemas | `packages/core/src/types/cross-boundary-artifacts.schemas.ts` |

#### Risks

1. **First LangGraph StateGraph in the monorepo** — no prior art. Spike in Task 1.7 to validate `interrupt_before` + Postgres checkpointer. Fallback: conditional node that writes state to Postgres manually (same external API).
2. **LLM cost for ClarifyGPT** — 3 extra LLM calls per gap detection (Task 1.3). Budget cap keeps cost bounded. Monitor via Langfuse.
3. **HITL interrupt UX** — dashboard must poll for graph state. Use existing `/api/events` pattern.

---

## Key Files

| File | Role | Phase |
|------|------|-------|
| `packages/core/src/types/cross-boundary-artifacts.schemas.ts` | 9 Zod schemas | 0.2 |
| `packages/core/src/checkpointer/index.ts` | Checkpointer factory | 0.3 |
| `docker/docker-compose.agentforge.yml` | Postgres + Qdrant | 0.3, 2.2 |
| `packages/retrieval/src/repo-map/` | Tree-sitter repo map | 2.1 |
| `packages/retrieval/src/embeddings/` | Voyage + Cohere clients | 2.2 |
| `packages/retrieval/src/search/` | Hybrid search | 2.2, 2.3 |
| `packages/retrieval/src/tools/` | 5 LangGraph tools (incl. searchDesigns) | 2.1-2.4 |
| `packages/retrieval/src/indexing/design-indexer.ts` | Design spec indexing | 2.3b |
| `packages/retrieval/src/search/design-search.ts` | Design spec search | 2.3b |
| `packages/agents-clarifier/src/nodes/` | 6 clarifier stages | 1.1-1.6 |
| `packages/agents-clarifier/src/graph/` | LangGraph StateGraph + typed state | 1.7 |
| `packages/dashboard/src/components/clarifier/` | Chat UI | 1.8 |

---

## Exit Criteria

**Phase 0:** All 9 artifact schemas with tests; Postgres checkpointer integration test passes.

**Phase 2:** `searchCodeTool`, `searchDocsTool`, `getRepoMapTool`, `findSimilarPatternsTool` work; Qdrant with 2 collections; incremental indexing; all tests green.

**Phase 1 (roadmap exit criteria):** User submits seed at `/new`, clarifier asks <=7 questions in <=3 rounds, produces structured PRD YAML with assumption ledger, dashboard shows PRD for approval. Both modes work.

**Decision gate (after Phase 1):** "Demo the clarifier. If it doesn't feel obviously better than the text box, reconsider."
