# Current Status

> Last updated: 2026-04-30

The Clarifier graph, retrieval layer, and observability infrastructure are operational end-to-end from CLI. The design pipeline generates multi-screen prototypes from product requirements. The remaining spine stages (Architect, Implementer, Reviewer) are specified in the vision but not yet implemented.

## Architecture layers

| # | Layer | State | What exists today |
|---|-------|-------|-------------------|
| 1 | Orchestration | Partial | `@langchain/langgraph` (TypeScript) is the runtime. Python engine in `services/engine/` is deprecated per ADR-043 and scheduled for deletion. |
| 2 | Coordination | Partial | Clarifier uses typed LangGraph channels (`Annotation.Root()`). Older code paths in the design pipeline still use in-memory EventEmitter for telemetry. |
| 3 | Agent taxonomy | 1 of 4 | Clarifier is the only implemented spine stage (6 nodes). Architect, Implementer, and Reviewer are specified in [vision.md](../vision.md) but have no code. |
| 4 | State | Partial | YAML artifact persistence is operational. Postgres checkpointer factory in `packages/core/src/checkpointer/` supports `MemorySaver` (dev) and `PostgresSaver` (production). Wired into Clarifier. |
| 5 | Clarifier | Done | LangGraph `StateGraph` with 6 nodes, 2 HITL interrupts, bootstrap + evolution modes. Runs from CLI; dashboard `/new` page exists but needs UX redesign. |
| 6 | RAG | Done | 5 tools operational (`searchCode`, `searchDocs`, `searchDesigns`, `getRepoMap`, `findSimilarPatterns`). Qdrant + Voyage + Cohere Rerank. Merkle-tree incremental indexing. Not yet wired into spine stages — Clarifier will be the first consumer. |
| 7 | Design pipeline | Partial | `runDesignPipeline()` runs research → planning → design → evaluator. Single-screen generation works. Cross-screen coherence is post-hoc only — in-loop coherence is planned. |
| 8 | Implementation | Not started | Specified in vision Layer 8. Single-threaded tool loop with deterministic gates. |
| 9 | Review | Not started | Specified in vision Layer 9. Fresh-context multi-pass review. |
| 10 | HITL | 2 of 3 | Gate 1 (clarification): `interruptBefore` in Clarifier graph, working. Gate 2 (design): Design Studio UI approval, working. Gate 3 (code merge): not started. |
| 11 | Observability | Done | `TracedProvider` + `LangfuseSink` + `createTracedMCPClient`. Prompt versioning via frontmatter + pre-commit hook. Langfuse self-hosted via Docker Compose. |
| 12 | Evaluation | Not started | Golden test sets for regression detection are planned. Design evaluator exists but is a different concern (design quality, not system evaluation). |
| 13 | Sandboxing | Not started | Runs on developer machine. Ephemeral container isolation is planned. |
| 14 | Dashboard | Active | Next.js 16 + Mantine v9. 15 routes. Active redesign (CHIP UX Overhaul). |
| 15 | Integrations | Not started | Slack, GitHub, CI/CD integrations planned. |

**Why Layers 1–2 are "Partial":** The Clarifier uses LangGraph typed channels correctly. The design pipeline, which predates the Clarifier, still uses in-process imperative orchestration (`runDesignPipeline()`) rather than a LangGraph graph. New code follows the LangGraph pattern; the design pipeline will migrate when the spine stages are built.

**Why Layer 7 is "Partial":** Per-screen design generation works and includes an evaluator with a correction loop. However, cross-screen design coherence (consistent navigation, shared components, unified color schemes) is validated post-hoc by the evaluator, not enforced during generation. In-loop coherence is the next design pipeline improvement.

## Active initiatives

| Initiative | Current state | Next milestone | Blocked by |
|-----------|---------------|----------------|------------|
| Visual Diversity | Phases 1–4 + 3.1–3.8 complete. Evaluator calibration, catalog bridge, progressive evaluator, and correction parity all shipped. | Phase 5: Domain + Effects Foundation | Clarifier (needs domain context) |
| Clarifier | Backend complete (6 LangGraph nodes, event emission, interrupt detection). API routes done. Dashboard `/new` page exists but UX is not production-ready. | UX redesign for `/new` page | CHIP UX Overhaul Phase 3 |
| CHIP UX Overhaul | Phase 1 (branding) + Phase 2 (layout shell) + Phase 4.0 (Runs page) + Phase 4.1 (Home page) complete. Phase 4.2 (Design Studio) in progress. | Phase 3: Clarifier `/new` page showcase | — |
| Dashboard Pipeline Fix | Root cause identified: `import.meta.url` resolves to webpack chunk path instead of filesystem path when `@agentforge/source` compiles raw TypeScript. Design pipeline works from CLI but fails from dashboard. | Diagnostic logging + root cause confirmation | — |
| Observability | Phases 1–4 complete. TracedProvider, LangfuseSink, MCP tracing, OTel upgrade, cost verification all operational. | Phase 5: Evaluation infrastructure (deferred) | — |
| Docs Reorganization | Phases 1–4, 6–7 complete (branding, nav, 7 concept pages, `/backstage` skill, path registry, auto-generated dashboards). | Phase 5: Tutorials (backlog) | — |

**Dependency flow:** The Clarifier's dashboard UX is blocked by the CHIP UX Overhaul Phase 3 (which redesigns the `/new` page). Visual Diversity Phase 5 is blocked by the Clarifier (needs domain context from clarified requirements). The Dashboard Pipeline Fix is independent — it affects only the browser-triggered design pipeline, not CLI.

## Package inventory

| Package | Role | State |
|---------|------|-------|
| `core` | Types, config, LLM wrapper, checkpointer factory, test utilities | Production |
| `agents-clarifier` | Clarifier LangGraph graph (6 nodes, 2 HITL interrupts) | Production |
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
