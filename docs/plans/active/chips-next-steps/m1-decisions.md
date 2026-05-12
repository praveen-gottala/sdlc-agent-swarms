# R7: Dashboard → Spine Integration — Decisions

Decisions made 2026-05-12 based on [R7 research report](R7-dashboard-spine-integration.md) and [verification report](briefs/R7-dashboard-spine-integration-review.md).

## Prerequisites (3 decisions)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Feature-to-screen mapping | **Defer FeaturePlan to M2.** Thread only `EnrichedRequirement` in M1. | Simplest M1 scope. `ScreenPlan.featureId` (Architect output) provides clean mapping in M2. No schema changes or heuristic matching needed in M1. |
| D2 | Structured artifact persistence | **Both disk + checkpointer.** Write `enriched-requirement.yaml` to disk on approval. Keep in LangGraph checkpointer for continuity. Disk is primary source for M1. | Offline-capable, testable, consistent with existing YAML patterns. Checkpointer preserved for M2+ LangGraph graph continuity. |
| D3 | CreateProjectSchema extension | **Single wrapper field:** `clarifierOutput: { enrichedRequirement, assumptionLedger, threadId }` | Groups related data. `threadId` saved to project config for M2 but not used for data retrieval in M1. |

## Recommendations (6 decisions)

| # | Decision | Choice | Key constraint |
|---|----------|--------|---------------|
| D4 | Shared `buildPipelineInput()` | **Accept.** Place in `@agentforge/agents-ux`. Use core's canonical YAML loaders. | Dependency chain verified safe: no circular deps. agents-ux already has `buildComponentCatalogPrompt`, `buildPageContext`, `resolvePageEntry`. |
| D5 | Unified `createPipelineContext()` | **Accept.** Options bag in `@agentforge/agents-ux`. Delete both separate factories. CLI keeps I/O helpers in `pipeline-io.ts`. | Two factories differ only in 3 params (mcpClient, projectRoot default, providerFactory optionality). |
| D6 | Dashboard all-pages loop | **Accept.** Dashboard owns its own loop with `DashboardSseSink` + run tracking. Extract `runPagesWithChromePass()` as shared helper. | Fixes no-op sink bug. Dashboard gets SSE per page, run tracking, Langfuse tracing. |
| D7 | Clarifier → Design bridge | **Disk primary, threadId optional.** `buildPipelineInput()` reads `enriched-requirement.yaml` from disk. `threadId` saved to project config during approval for M2 LangGraph continuity. Not used for data retrieval in M1. | Consistent with D2. No Postgres dependency at design-time in M1. |
| D8 | PipelineInput extension | **Accept (enrichedRequirement only).** Add optional `enrichedRequirement` field. `prdRequirements` auto-populated from `enrichedRequirement.prd`. No `featurePlan` field in M1. | Consistent with D1 (FeaturePlan deferred to M2). Incremental: stages consume same `prdRequirements` field but get richer content. |
| D9 | Data-driven StageDescriptor | **Accept.** `StageDescriptor[]` parameter on `DashboardSseSink`. Defaults to current 3-stage map. No behavioral change for existing callers. | Future-proofs for spine mode. Also applies to Clarifier route (8 hardcoded stages). |

## M1 Scope Summary (derived from decisions)

**In scope for M1:**

- Shared `buildPipelineInput()` + `createPipelineContext()` in agents-ux (D4, D5)
- Dashboard all-pages loop with proper telemetry (D6)
- `clarifierOutput` wrapper on `CreateProjectSchema` (D3)
- `enriched-requirement.yaml` written to disk on approval (D2)
- `enrichedRequirement` field on `PipelineInput` with compat fallback (D8)
- Data-driven `StageDescriptor` on `DashboardSseSink` (D9)
- `threadId` saved to project config (D7)

**Deferred to M2:**

- `FeaturePlan` threading into per-page design (D1)
- `featureIds` on `ScreenRefSchema` or `ScreenPlan` mapping
- `threadId` as data retrieval mechanism (checkpointer lookup at design-time)
- Stage renaming (research/planning → architect)

**External dependency:**

- Dashboard Pipeline Fix (`import.meta.url` under webpack) must be resolved before dashboard changes can be tested.
