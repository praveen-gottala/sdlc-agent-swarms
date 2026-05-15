# Current Status

> Authoritative source: [CLAUDE.md Current State](../../CLAUDE.md)
>
> Last updated: 2026-05-15

The Clarifier and Architect graphs, retrieval layer, and observability infrastructure are operational end-to-end from CLI. The design pipeline generates multi-screen prototypes from product requirements, now receiving structured PRD from the Clarifier (M1: 1,086x richer context). The remaining spine stages (Implementer, Reviewer) are specified in the vision but not yet implemented.

## Architecture layers

| # | Layer | State | What exists today |
|---|-------|-------|-------------------|
| 1 | Orchestration | Partial | `@langchain/langgraph` (TypeScript) is the runtime. Python engine in `services/engine/` is deprecated per ADR-043 and scheduled for deletion. |
| 2 | Coordination | Partial | Clarifier uses typed LangGraph channels (`Annotation.Root()`). Older code paths in the design pipeline still use in-memory EventEmitter for telemetry. |
| 3 | Agent taxonomy | 2 of 4 | Clarifier (9 nodes) and Architect (7 nodes, 24 channels, 14 Critic gates) are operational. Implementer and Reviewer are specified in [vision.md](../vision.md) but not yet implemented. |
| 4 | State | Partial | YAML artifact persistence is operational. Postgres checkpointer factory in `packages/core/src/checkpointer/` supports `MemorySaver` (dev) and `PostgresSaver` (production). Wired into Clarifier. |
| 5 | Clarifier | Done | LangGraph `StateGraph` with 9 nodes, 2 HITL interrupts, bootstrap + evolution modes. Runs from CLI; dashboard `/new` page exists but needs UX redesign. |
| 6 | RAG | Done | 5 tools operational (`searchCode`, `searchDocs`, `searchDesigns`, `getRepoMap`, `findSimilarPatterns`). Qdrant + Voyage + Cohere Rerank. Merkle-tree incremental indexing. Wired into Clarifier's Context Retriever node. |
| 7 | Design pipeline | Partial | `runDesignPipeline()` runs research → planning → design → evaluator. Now receives structured PRD from Clarifier (M1). Single-screen generation works. Cross-screen coherence is post-hoc only — in-loop coherence is planned. Architect (M3) absorbs Research + Planning; Implementer (M4) will invoke only Design + Evaluator. |
| 8 | Implementation | Not started | Specified in vision Layer 8. Single-threaded tool loop with deterministic gates. |
| 9 | Review | Not started | Specified in vision Layer 9. Fresh-context multi-pass review. |
| 10 | HITL | 2 of 3 | Gate 1 (clarification): `interruptBefore` in Clarifier graph, working. Gate 2 (architecture): `interruptBefore` in Architect graph, machinery built (dashboard UI deferred). Gate 3 (code merge): not started. |
| 11 | Observability | Done | `TracedProvider` + `LangfuseSink` + `createTracedMCPClient`. Prompt versioning via frontmatter + pre-commit hook. Langfuse self-hosted via Docker Compose. |
| 12 | Evaluation | Partial | `packages/eval` exists with golden test sets for Clarifier + Architect regression detection. 4 Architect eval scenarios (3 migrated + 1 brownfield). Design evaluator is a separate concern (design quality). |
| 13 | Sandboxing | Not started | Runs on developer machine. Ephemeral container isolation is planned. |
| 14 | Dashboard | Active | Next.js 16 + Mantine v9. 15 routes. Active redesign (CHIP UX Overhaul). |
| 15 | Integrations | Not started | Slack, GitHub, CI/CD integrations planned. |

**Why Layers 1–2 are "Partial":** The Clarifier uses LangGraph typed channels correctly. The design pipeline, which predates the Clarifier, still uses in-process imperative orchestration (`runDesignPipeline()`) rather than a LangGraph graph. New code follows the LangGraph pattern; the design pipeline will migrate when the spine stages are built.

**Why Layer 7 is "Partial":** Per-screen design generation works and includes an evaluator with a correction loop. However, cross-screen design coherence (consistent navigation, shared components, unified color schemes) is validated post-hoc by the evaluator, not enforced during generation. In-loop coherence is the next design pipeline improvement.

## Active initiatives

| Initiative | Current state | Next milestone | Blocked by |
|-----------|---------------|----------------|------------|
| Visual Diversity | Phases 1–4 + 3.1–3.8 complete. Evaluator calibration, catalog bridge, progressive evaluator, and correction parity all shipped. | Phase 5: Domain + Effects Foundation | Clarifier (needs domain context) |
| Clarifier | Backend complete (9 LangGraph nodes, event emission, interrupt detection). API routes done. Dashboard `/new` page exists but UX is not production-ready. | UX redesign for `/new` page | CHIP UX Overhaul Phase 3 |
| CHIP UX Overhaul | Phase 1 (branding) + Phase 2 (layout shell) + Phase 4.0 (Runs page) + Phase 4.1 (Home page) complete. Phase 4.2 (Design Studio) in progress. | Phase 3: Clarifier `/new` page showcase | — |
| CHIP's Next Steps | M0--M3 complete (Architect pipeline: 7-node graph, 24 channels, 14 Critic gates, Gate 2 HITL, brownfield). M3.5 research (brownfield design delta) next. | M4: Full Spine (Implementer + Reviewer) | M3.5 research |
| Dashboard Pipeline Fix | Root cause identified: Opus 4.7 token quota on Vertex AI (not `import.meta.url`). Dashboard pipeline confirmed working (2026-05-14). | Partial fix applied | — |
| Observability | Phases 1–4 complete. TracedProvider, LangfuseSink, MCP tracing, OTel upgrade, cost verification all operational. | Phase 5: Evaluation infrastructure (deferred) | — |
| Docs Reorganization | Phases 1–4, 6–7 complete (branding, nav, 7 concept pages, `/backstage` skill, path registry, auto-generated dashboards). | Phase 5: Tutorials (backlog) | — |

**Dependency flow:** The Clarifier's dashboard UX is blocked by the CHIP UX Overhaul Phase 3 (which redesigns the `/new` page). Visual Diversity Phase 5 is blocked by the Clarifier (needs domain context from clarified requirements). The Dashboard Pipeline Fix is independent — it affects only the browser-triggered design pipeline, not CLI.

## Package inventory

| Package | Role | State |
|---------|------|-------|
| `core` | Types, config, LLM wrapper, checkpointer factory, test utilities | Production |
| `agents-clarifier` | Clarifier LangGraph graph (9 nodes, 2 HITL interrupts) | Production |
| `agents-architect` | Architect LangGraph graph (7 nodes, 14 Critic gates, Gate 2 HITL) | Production |
| `agents-ux` | Design pipeline orchestration | Production |
| `designspec-renderer` | DesignSpec JSON → React/shadcn browser renderer | Production |
| `retrieval` | RAG layer (5 tools, Qdrant, Voyage, Cohere) | Production |
| `providers` | Multi-provider LLM (Claude, OpenAI, Vertex AI) | Production |
| `telemetry` | OTel + Langfuse integration | Production |
| `governance` | Permission, budget, HITL, audit middleware | Partial |
| `dashboard` | Next.js 16 + Mantine v9, 15 routes | Active development |
| `cli` | Commander.js, 7 command groups | Production |
| `agents-spec` | Specification agent | Scaffolded |
| `agents-design` | Design agent | Scaffolded |
| `agents-code` | Code generation agent | Scaffolded |
| `agents-cicd` | CI/CD agent | Scaffolded |
| `eval` | Golden test sets, Clarifier + Architect eval scenarios | Active development |
| `channels` | Event channel definitions | Production |
| `integration-tests` | Cross-package integration | Active |
| `e2e-test` | Playwright E2E | Active |
| `stacks` | Project scaffolding templates | Production |

## Backlog

- **Screen Types Plan B** (B0–B2.7 complete) — paused for visual diversity work. Next: B3, layout-aware code generation.
- **Structured Output Migration** — waiting for stable `output_config` SDK support across providers.
- **Brownfield Import Pipeline** — deferred until spine stages are built.
- **Base Catalog Enrichment** — deferred until after visual diversity.

## Related

- [Vision](../vision.md) — 15-layer architecture authority with current/target per layer
- [Roadmap](../roadmap.md) — eight-phase rollout plan
- [CHIP Overview](overview.md) — architecture and package structure
