# ADR-044: DesignPhaseState lives in agents-ux, not core

**Status:** Accepted  
**Date:** 2026-04-25  
**Context:** Execution plan §0.1 envisioned `DesignPhaseStateSchema` in `packages/core/src/types/design-phase-state.ts`. The composite `DesignPhaseState` type references `UXResearchOutput` and `UXPlanningOutput` which are defined in `@agentforge/agents-ux`. Re-exporting these from core would create a circular dependency (core → agents-ux → core).

**Decision:** `DesignPhaseState` (the TypeScript interface) and `DesignPhaseState`-related types (`PipelineInput`, `NodeContext`, `PipelineTelemetrySink`) live in `packages/agents-ux/src/design-pipeline/types.ts`. Core retains the Zod sub-schemas (`DesignToolSchema`, `DesignOutputSchema`) that were created in Phase 0 Task 0.1. The composite state type lives in the package that owns the agent output types.

**Consequences:** Phase M-3 (LangGraph port) will define the `StateGraph` schema in agents-ux, not core. If a future consumer outside agents-ux needs the state type, it imports from `@agentforge/agents-ux` — consistent with the existing pattern for `UXResearchOutput` and `UXPlanningOutput`.
