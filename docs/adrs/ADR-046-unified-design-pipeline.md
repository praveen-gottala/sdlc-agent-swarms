# ADR-046: Unified Design Pipeline

**Status:** Accepted
**Date:** 2026-04-26
**Supersedes:** N/A
**Related:** ADR-043 (TypeScript-only orchestration), ADR-044 (DesignPhaseState location), ADR-045 (evaluator deferral)

## Context

The CLI and dashboard had parallel implementations of the UX design pipeline.
The CLI called canonical work functions (`uxResearchWork`, `uxPlanningWork`,
`penpotDesignWork`) with Zod-validated contracts. The dashboard reimplemented
the same stages via `callPipelineStage`, passing raw markdown strings between
agents — a direct `CLAUDE.md` violation of "Typed Contracts for Cross-Agent
Artifacts."

This blocked two roadmap items:
- **Phase 4** (cross-screen coherence) — requires one pipeline definition to
  wrap as a LangGraph subgraph.
- **ADR-043 Phase M-3** (design phase LangGraph port) — requires typed
  inputs/outputs per node.

Full divergence analysis: `docs/issues/cli-dashboard-pipeline-divergence.md`.

## Decision

Single `runDesignPipeline(input: PipelineInput)` in
`packages/agents-ux/src/design-pipeline/pipeline.ts`. Three-layer architecture:

- **Layer A — Work functions.** Pure agent logic (`uxResearchWork`,
  `uxPlanningWork`, `browserDesignWork`, `penpotDesignWork`, `evaluateDesign`).
  No transport awareness. Typed Zod inputs/outputs.

- **Layer B — Orchestrator.** `runDesignPipeline` sequences node functions,
  handles caching/resume, and calls `PipelineTelemetrySink` callbacks. The
  `designTool: 'browser' | 'penpot'` parameter dispatches Stage 4 to the
  correct work function. `chromePass` field groups Chrome Pass inputs.

- **Layer C — Transport callers.** CLI (`design-page.ts`) maps argv to
  `PipelineInput` and uses `CliStdoutSink`. Dashboard (`design/route.ts`)
  maps HTTP request to `PipelineInput` and uses `DashboardSseSink`.

`PipelineTelemetrySink` is an interface in `agents-ux`; implementations live
in their transport packages (dependency inversion).

## Consequences

- One pipeline definition for the ADR-043 M-3 LangGraph port.
- No drift between CLI and dashboard artifact shapes.
- Dashboard artifacts now pass Zod validation without `_migrated` markers.
- `callPipelineStage` and `callClaudeDesignAPI` deleted.
- Stage 1 (`design:generate`) also unified via shared `generateAppSpec()`.
- Execution plan: `docs/active-plan/unify-pipeline/execution-plan.md`.
