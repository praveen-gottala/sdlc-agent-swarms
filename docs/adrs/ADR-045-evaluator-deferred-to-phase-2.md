# ADR-045: evaluatorNode returns undefined in Phase 1

**Status:** Accepted  
**Date:** 2026-04-25  
**Context:** The execution plan's Task 1.2 committed `evaluatorNode` to wrap `evaluateDesign(screenshotBase64, JSON.stringify(state.design.spec), ...)`. However, `evaluateDesign()` requires a browser screenshot (base64 PNG) which needs an active browser session — a capability the pipeline orchestrator does not yet have. Browser session management is a Phase 2 deliverable.

**Decision:** `evaluatorNode` validates preconditions (`state.design` must exist) but returns `{ evaluation: undefined }` in Phase 1. Full integration with `evaluateDesign()` using DesignSpec JSON as the second argument (not planning JSON — see G2 decision) is deferred to Phase 2 when browser session/screenshot capture is wired into the pipeline.

**Consequences:** Phase 2 must wire screenshot capture and call `evaluateDesign()` with the DesignSpec JSON shape.

## Phase 1.1: Structural-only evaluation (2026-04-28)

**Amendment:** `evaluatorNode` no longer returns `undefined`. It runs `runStructuralQualityGate(spec)` — a pure function that calls `assessContainerDiversity()` and `assessCatalogAdoption()` on the DesignSpec JSON. No browser, no screenshot, no vision LLM.

The result includes `structural: true` to distinguish from full vision evaluation (Phase 2). Structural deductions are capped at 20 points.

`evaluateDesign()` (the vision evaluator used by the correction pipeline and Dashboard audit) now also delegates to `runStructuralQualityGate()` for its structural deductions — one source of truth for deduction logic.

The naming test is updated: `'returns structural evaluation with score for a clean spec (ADR-045 Phase 1.1)'` in `nodes.test.ts`.
