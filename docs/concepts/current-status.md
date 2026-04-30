# Current Status

> Last updated: 2026-04-30

## Where We Are

CHIP is in active development with the design pipeline as the most mature subsystem. The four-stage spine is specified in the [vision document](../vision.md), with the Clarifier as the first fully-implemented LangGraph graph. The dashboard has been redesigned with Mantine v9 and is undergoing page-by-page UX overhaul.

## Initiative Status

| Initiative | Status | What's Done | What's Next | Plan |
|-----------|--------|------------|-------------|------|
| **Visual Diversity** | Active | Phases 1-4, Prerequisite, 3.1-3.8 complete. Evaluator calibration, catalog bridge, progressive evaluator, correction parity all done. | Phase 5: Domain + Effects Foundation | [Plan](../plans/active/visual-diversity/execution-plan.md) |
| **Observability** | Paused | Phases 1-4 complete. TracedProvider, LangfuseSink, MCP tracing, prompt versioning all working. | Phase 5: Evaluation infrastructure (deferred) | [Plan](../plans/active/observability/execution-plan.md) |
| **Clarifier Initiative** | Active | Phase 0, Phase 2 (RAG), Tasks 1.0-1.7 complete. 6-node LangGraph StateGraph, 114 tests. | Task 1.8: Dashboard UX redesign | [Plan](../plans/active/clarifier-initiative/execution-plan.md) |
| **CHIP UX Overhaul** | Active | Phases 1-2, 4.0-4.2 complete. Mantine migration, Home page, Runs page, Design Studio all redesigned. | Phase 4.3+: Remaining pages | [Plan](../plans/active/chip-ux-overhaul/execution-plan.md) |
| **Dashboard Pipeline Fix** | Active | Root cause identified (`import.meta.url` under webpack). Partial fix applied. | Full fix for agents-ux package | [Plan](../plans/active/dashboard-pipeline-fix/execution-plan.md) |
| **Docs Reorganization** | Active | Phase 1 complete (branding + nav). Phase 2 in progress (concept pages). | Phase 3: Vision.md refresh | [Plan](../plans/active/docs-reorganization/execution-plan.md) |

## Architecture Layer Status

| Layer | Vision | Current State | Gap |
|-------|--------|--------------|-----|
| 1. Orchestration | TypeScript LangGraph only | Split: TS agents + deprecated Python engine | Python engine needs deletion (ADR-043) |
| 2. Coordination | Typed LangGraph channels | EventEmitter for some control flow | Legacy event-bus coordination in older code |
| 3. Agent Taxonomy | 4-stage spine + specialists | Clarifier implemented; others specified | Architect, Implementer, Reviewer not built |
| 4. State | YAML + Postgres checkpointer | YAML working; Postgres factory ready | Checkpointer not wired into pipelines |
| 5. Clarifier | 6-stage conversational pipeline | Fully implemented (114 tests) | Dashboard UX needs redesign |
| 6. RAG | Hybrid retrieval (5 tools) | All 5 tools implemented | Not yet wired into spine stages |
| 7. Design Pipeline | In-loop cross-screen coherence | Per-screen pipeline working | Cross-screen coherence is post-hoc |
| 8. Implementation | Single-threaded tool-loop | Not started | Blocked by Architect stage |
| 9. Review | Fresh-context multi-pass review | Not started | Blocked by Implementer stage |
| 10. HITL | 3 gates via LangGraph interrupts | 1 gate (design approval) | Clarification + merge gates pending |
| 11. Observability | OTel + Langfuse + prompt versioning | Working end-to-end | Cost dashboard in CHIP UI not built |
| 12. Evaluation | Golden test sets + CI regression | Not started | Deferred to post-Clarifier |
| 13. Sandboxing | Ephemeral containers, zero-secret | Runs on dev machine | Not started |
| 14. Dashboard | CHIP-branded Mantine v9 | Active redesign (Phase 4) | Multiple pages remaining |
| 15. Integrations | Slack, GitHub, CI/CD | Not started | Post-spine completion |

## What's Working Today (Demo-Ready)

These features can be demonstrated end-to-end:

1. **Design Pipeline** — Give it a product idea, get multi-screen designs with real shadcn components, vision-based quality evaluation, and a navigable prototype
2. **Clarifier** — Conversational requirement gathering with gap detection, question prioritization, and assumption tracking (114 tests, 6 LangGraph nodes)
3. **RAG** — Code, document, and design search with hybrid BM25+dense retrieval and Cohere reranking
4. **Design Studio** — Per-screen design approval with chat-driven iteration, mechanical + vision audits, and edit-in-place
5. **Observability** — Every LLM call and pipeline stage traced to Langfuse with prompt versioning

## Backlog (Paused Work)

| Initiative | Status | Why Paused |
|-----------|--------|-----------|
| Screen Types Plan B | B0-B2.7 complete | Visual diversity is higher priority |
| Structured Output Migration | Planned | Waiting for stable `output_config` SDK support |
| Brownfield Import Pipeline | Planned | Post-spine completion |

## Related Docs

- [Vision Document](../vision.md) — full 15-layer architecture authority
- [Roadmap](../roadmap.md) — eight-phase rollout plan
- [What is CHIP?](overview.md) — product overview
