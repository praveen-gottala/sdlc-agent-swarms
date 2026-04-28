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
- Follow `runDesignPipeline` pattern for pipeline orchestration (`packages/agents-ux/src/design-pipeline/pipeline.ts`)
- Follow `generateAppSpec` pattern for LLM calls with Zod schemas (`packages/agents-ux/src/app-spec/generate-app-spec.ts`)
- Follow `packages/agents-ux/` structure for new agent package scaffold
- See `.claude/rules/new-agent.md` for the full agent role checklist
- Pre-LangGraph: pipeline runs as plain async function. Designed for future StateGraph refactor.

---

## Progress Checklist

### Phase 0 — Foundation Completion
- [x] **0.1** ADR-043 orchestration runtime (pre-existing, merged)
- [x] **0.2** Typed cross-boundary artifact schemas (2026-04-28) — 9 Zod schemas + TS interfaces in `packages/core/src/types/cross-boundary-artifacts.{schemas,}.ts`. 25 tests (parse + reject invalid). Exported from barrel.
- [ ] **0.3** Postgres checkpointer — LangGraph checkpoint with Docker Postgres

### Phase 2 — RAG Layer
- [ ] **2.0** Package scaffold + integration spike (`packages/retrieval/`)
- [ ] **2.1** Aider-style repo map (tree-sitter + PageRank, deterministic)
- [ ] **2.2** Qdrant + code embedding pipeline (voyage-code-3, hybrid BM25+dense, Cohere rerank)
- [ ] **2.3** Document embedding pipeline (voyage-3-large, header-aware splitting)
- [ ] **2.4** RetrievedContext type + tool registration

### Phase 1 — Clarifier
- [ ] **1.0** Clarifier package scaffold (`packages/agents-clarifier/`)
- [ ] **1.1** Context Retriever node (bootstrap: catalog; evolution: RAG tools)
- [ ] **1.2** PRD/Request Analyzer node (forced-JSON, claude-opus-4-6)
- [ ] **1.3** Gap/Conflict Detector node (deterministic checklist + ClarifyGPT consistency sampling)
- [ ] **1.4** Question Prioritizer node (EVPI proxy ranking)
- [ ] **1.5** Story Writer / PRD Synthesizer node (EARS format, INVEST stories)
- [ ] **1.6** Critic node (compliance check, bounded retry)
- [ ] **1.7** Pipeline assembly (`runClarifierPipeline()`, HITL interrupt)
- [ ] **1.8** Dashboard integration (`/new` bootstrap, `/evolve` evolution, chat UI)

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
| `packages/retrieval/src/tools/` | 4 LangGraph tools | 2.1-2.4 |
| `packages/agents-clarifier/src/nodes/` | 6 clarifier stages | 1.1-1.6 |
| `packages/agents-clarifier/src/pipeline/` | Pipeline orchestrator | 1.7 |
| `packages/dashboard/src/components/clarifier/` | Chat UI | 1.8 |

---

## Exit Criteria

**Phase 0:** All 9 artifact schemas with tests; Postgres checkpointer integration test passes.

**Phase 2:** `searchCodeTool`, `searchDocsTool`, `getRepoMapTool`, `findSimilarPatternsTool` work; Qdrant with 2 collections; incremental indexing; all tests green.

**Phase 1 (roadmap exit criteria):** User submits seed at `/new`, clarifier asks <=7 questions in <=3 rounds, produces structured PRD YAML with assumption ledger, dashboard shows PRD for approval. Both modes work.

**Decision gate (after Phase 1):** "Demo the clarifier. If it doesn't feel obviously better than the text box, reconsider."
