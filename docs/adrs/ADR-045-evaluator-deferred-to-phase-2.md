# ADR-045: evaluatorNode returns undefined in Phase 1

**Status:** Accepted  
**Date:** 2026-04-25  
**Context:** The execution plan's Task 1.2 committed `evaluatorNode` to wrap `evaluateDesign(screenshotBase64, JSON.stringify(state.design.spec), ...)`. However, `evaluateDesign()` requires a browser screenshot (base64 PNG) which needs an active browser session — a capability the pipeline orchestrator does not yet have. Browser session management is a Phase 2 deliverable.

**Decision:** `evaluatorNode` validates preconditions (`state.design` must exist) but returns `{ evaluation: undefined }` in Phase 1. Full integration with `evaluateDesign()` using DesignSpec JSON as the second argument (not planning JSON — see G2 decision) is deferred to Phase 2 when browser session/screenshot capture is wired into the pipeline.

**Consequences:** The pipeline runs all 4 stages but produces no evaluation output. Phase 2 must wire screenshot capture and call `evaluateDesign()` with the DesignSpec JSON shape. The naming test `'returns undefined evaluation in Phase 1 — full evaluation deferred to Phase 2 (execution-plan §2.x)'` in `nodes.test.ts` pins this contract.
