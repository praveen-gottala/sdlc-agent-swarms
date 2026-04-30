# Current Status

> Last updated: 2026-04-30

## Architecture Layer Implementation

| # | Layer | Implementation | Status |
|---|-------|---------------|--------|
| 1 | Orchestration | `@langchain/langgraph` (TypeScript). Python engine deprecated (ADR-043, pending deletion). | Partial |
| 2 | Coordination | Clarifier uses typed LangGraph channels (`Annotation.Root()`). Older code paths still on EventEmitter. | Partial |
| 3 | Agent taxonomy | 4-stage spine specified. Clarifier implemented (6 nodes, 116 tests). Architect/Implementer/Reviewer specified only. | 1 of 4 |
| 4 | State | YAML artifacts operational. Postgres checkpointer factory in `packages/core/src/checkpointer/` (`MemorySaver` / `PostgresSaver`). Docker Compose ready. Wired into Clarifier. | Partial |
| 5 | Clarifier | LangGraph `StateGraph`, 6 nodes, 2 HITL interrupts, bootstrap + evolution modes. 116 tests. | Done |
| 6 | RAG | 5 tools operational: `searchCode`, `searchDocs`, `searchDesigns`, `getRepoMap`, `findSimilarPatterns`. Qdrant + Voyage + Cohere Rerank. Merkle-tree incremental indexing. | Done |
| 7 | Design pipeline | `runDesignPipeline()`: research → planning → design → evaluator. Per-screen generation working. Cross-screen coherence post-hoc only. | Partial |
| 8 | Implementation | Specified in vision. Single-threaded tool loop with deterministic gates. Not started. | Specified |
| 9 | Review | Specified in vision. Fresh-context multi-pass review. Not started. | Specified |
| 10 | HITL | Gate 1 (clarification): `interruptBefore` in Clarifier graph. Gate 2 (design): Design Studio UI. Gate 3 (merge): not started. | 2 of 3 |
| 11 | Observability | `TracedProvider` + `LangfuseSink` + `createTracedMCPClient`. Prompt versioning (frontmatter + pre-commit hook). Langfuse self-hosted via Docker Compose. | Done |
| 12 | Evaluation | Not started. Golden test sets planned. | Not started |
| 13 | Sandboxing | Runs on dev machine. Ephemeral containers planned. | Not started |
| 14 | Dashboard | Next.js 16 + Mantine v9. 15 routes. Redesign in progress (CHIP UX Overhaul Phase 4). | Active |
| 15 | Integrations | Not started. Slack, GitHub, CI/CD planned. | Not started |

## Active Initiatives

| Initiative | Phase | Last Milestone | Next Step | Plan |
|-----------|-------|---------------|-----------|------|
| Visual Diversity | Phase 5 next | 3.1-3.8 complete: evaluator calibration, catalog bridge, progressive evaluator, correction parity | Domain + Effects Foundation | [Plan](../plans/active/visual-diversity/execution-plan.md) |
| Clarifier | Task 1.8 | Tasks 1.0-1.7: 6 LangGraph nodes, 116 tests, event emission, interrupt detection | Dashboard UX redesign for `/new` | [Plan](../plans/active/clarifier-initiative/execution-plan.md) |
| CHIP UX Overhaul | Phase 4.3+ | Phase 4.2: Design Studio — Mantine migration, edit mode gate, generate picker, resizable panels | Remaining pages per priority | [Plan](../plans/active/chip-ux-overhaul/execution-plan.md) |
| Dashboard Pipeline Fix | Root cause found | `import.meta.url` under webpack identified. `serverExternalPackages` partial fix for agents-clarifier. | Full fix for agents-ux | [Plan](../plans/active/dashboard-pipeline-fix/execution-plan.md) |
| Docs Reorganization | Phase 2 done | Phase 1 (branding + nav) + Phase 2 (concept pages) complete | Phase 3: vision.md refresh | [Plan](../plans/active/docs-reorganization/execution-plan.md) |
| Observability | Phase 4 done | Phases 1-4: TracedProvider, LangfuseSink, MCP tracing, OTel upgrade, cost verification | Phase 5: evaluation infrastructure (deferred) | [Plan](../plans/active/observability/execution-plan.md) |

## Package Inventory

19 packages in the Nx monorepo:

| Package | Tests | Status |
|---------|-------|--------|
| `core` | Types, config, LLM wrapper, checkpointer, test utils | Production |
| `agents-clarifier` | 116 tests, 7 suites | Production |
| `agents-ux` | Design pipeline orchestration | Production |
| `designspec-renderer` | DesignSpec → React/shadcn renderer | Production |
| `retrieval` | 5 RAG tools, Qdrant integration | Production |
| `providers` | Multi-provider LLM (Claude, OpenAI, Vertex AI) | Production |
| `telemetry` | OTel + Langfuse | Production |
| `governance` | Permission, budget, HITL, audit middleware | Partial |
| `dashboard` | Next.js 16 + Mantine v9, 15 routes | Active development |
| `cli` | Commander.js, 7 command groups | Production |
| `agents-spec` | Specification agent | Scaffolded |
| `agents-design` | Design agent | Scaffolded |
| `agents-code` | Code generation agent | Scaffolded |
| `agents-cicd` | CI/CD agent | Scaffolded |
| `channels` | Event channel definitions | Production |
| `integration-tests` | Cross-package integration | Active |
| `e2e-test` | Playwright E2E | Active |
| `stacks` | Project scaffolding templates | Production |

## Backlog

| Initiative | Completed | Paused Reason |
|-----------|-----------|---------------|
| Screen Types Plan B | B0-B2.7 | Visual diversity higher priority |
| Structured Output Migration | Planned | Waiting for stable `output_config` SDK |
| Brownfield Import Pipeline | Planned | Post-spine completion |
| Base Catalog Enrichment | Planned | Post-visual diversity |

## Related Docs

- [Vision](../vision.md) — 15-layer architecture authority with current/target per layer
- [Roadmap](../roadmap.md) — eight-phase rollout plan
- [CHIP Overview](overview.md) — architecture and package structure
