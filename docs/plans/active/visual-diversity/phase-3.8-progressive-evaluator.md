# Phase 3.8 — Progressive Evaluator + Correction Loop Parity

**Parent plan:** `docs/plans/active/visual-diversity/execution-plan.md` → Phase 3.8 section
**Status:** Planned (2026-04-28). Ready to implement.
**Prerequisite:** Phase 3.7 code complete (evaluator calibration, prompt cleanup, catalog bridge).

## Context

Two architectural gaps identified during visual diversity pipeline verification:

1. **Structural quality checks (diversity, catalog adoption) only run when the expensive vision evaluator is invoked.** The pipeline's evaluator stage (`evaluatorNode` in `nodes.ts:139-149`) returns `undefined` — it's a no-op per ADR-045 because it needs a browser screenshot. But the structural checks DON'T need a screenshot — they're pure JSON analysis.

2. **Correction loop diverges between CLI and Dashboard.** CLI has iterative `runBrowserCorrectionPipeline()`. Dashboard has manual-only `BrowserFeedbackAdapter`. Dashboard's "Fix All" should use the same shared correction function.

### Challenge report resolution (2026-04-28)
- **Single evaluator, progressive** — `evaluatorNode` runs structural checks in Phase 1, adds vision in Phase 2. One gate, one score, one approval. No two-gate violation of vision.md Layer 7/10.
- **Include correction parity** — unify Dashboard's "Fix All" with CLI's correction pipeline.

---

## Part A — Progressive Evaluator

### A.1 — Extract structural checks into standalone function

**New file:** `packages/agents-ux/src/ux-design/structural-quality-gate.ts`

```typescript
export interface StructuralQualityResult {
  score: number;  // 100 minus deductions
  deductions: number;
  issues: DesignIssue[];
  containerDiversity: ContainerDiversityResult;
  catalogAdoption: CatalogAdoptionResult;
}

export function runStructuralQualityGate(spec: DesignSpecV2): StructuralQualityResult
```

- Calls `assessContainerDiversity(spec)` and `assessCatalogAdoption(spec)`
- Deductions capped at `MAX_STRUCTURAL_DEDUCTION` (20)
- Pure function, synchronous, no LLM/screenshot/browser

### A.2 — Wire into evaluatorNode (progressive Phase 1)

**File:** `packages/agents-ux/src/design-pipeline/nodes.ts:139-149`

Replace the no-op. The evaluator now produces a structural-only result in Phase 1:

```typescript
export async function evaluatorNode(state, ctx) {
  if (!state.design?.spec) {
    return Err(pipelineStageError('evaluator', 'design output missing'));
  }
  const spec = state.design.spec as unknown as DesignSpecV2;
  const result = runStructuralQualityGate(spec);
  return Ok({
    evaluation: {
      score: result.score,
      overallQuality: result.score >= 80 ? 'good' : result.score >= 50 ? 'needs_fixes' : 'poor',
      issues: result.issues,
      structural: true,
    },
  });
}
```

Phase 2 (future): add screenshot capture + `evaluateDesign()` call that combines vision score with structural deductions.

### A.3 — Refactor evaluateDesign() to use shared function

**File:** `packages/agents-ux/src/ux-design/design-evaluator.ts:343-397`

Replace the inline diversity + catalog adoption logic with a call to `runStructuralQualityGate()`. The vision evaluator still applies structural deductions on top of the vision score, but the deduction logic lives in one place.

### A.4 — Export from barrel

**File:** `packages/agents-ux/src/index.ts`

Export `runStructuralQualityGate`.

### A.5 — Amend ADR-045

**File:** `docs/adrs/ADR-045-evaluator-deferred-to-phase-2.md`

Add section: "Phase 1.1: Structural-only evaluation (2026-04-28)". Document that structural checks (container diversity, catalog adoption) run in the evaluator node without vision. Vision integration remains deferred to Phase 2. The evaluator returns `structural: true` to distinguish from full vision evaluation.

### A.6 — Unit tests

**File:** `packages/agents-ux/src/ux-design/structural-quality-gate.test.ts`

Test `runStructuralQualityGate()` with specs that trigger both, one, or neither deduction.

---

## Part B — Correction Loop Parity

### B.1 — Verify current Dashboard correction route

**Read:** `packages/dashboard/src/app/api/pages/[pageId]/design/correct/route.ts`

Current flow: `BrowserFeedbackAdapter` — accepts manual feedback tags, generates patches via LLM, applies patches. Manual-only, no iterative re-evaluation.

### B.2 — Wire `runBrowserCorrectionPipeline()` into Dashboard "Fix All"

**File:** `packages/dashboard/src/app/api/pages/[pageId]/design/correct/route.ts`

When the request contains vision audit issues (from Deep Audit), call `runBrowserCorrectionPipeline()` from `@agentforge/agents-ux` instead of `BrowserFeedbackAdapter`. This gives Dashboard the same iterative correction loop as CLI.

The route should:
1. Accept vision issues from the audit result
2. Call `runBrowserCorrectionPipeline()` with the current spec + issues
3. Return the corrected spec + final score
4. Write corrected spec via `writeDesignSpec()`

Keep `BrowserFeedbackAdapter` for manual user feedback (chat-based corrections). Use `runBrowserCorrectionPipeline()` for automated fix-all.

### B.3 — Verify shared imports

Confirm `runBrowserCorrectionPipeline` is already exported from `@agentforge/agents-ux` barrel. If not, add export.

### B.4 — Tests

Integration test: Dashboard API route calls `runBrowserCorrectionPipeline()` with mock provider.

---

## CLI/Dashboard Parity Matrix (verified 2026-04-28)

| Capability | CLI | Dashboard | Shared? |
|---|---|---|---|
| Design generation | `runDesignPipeline()` | Same function | YES |
| Catalog promotion | Inside `browserDesignWork()` | Same (via pipeline) | YES |
| Structural quality gate | `evaluatorNode` (no-op → structural) | Same (via pipeline) | YES after A.2 |
| Mechanical audit | Not in CLI | `/api/design/audit` (DOM checks) | Dashboard-only |
| Vision evaluation | `evaluateDesign()` via correction loop | `/api/design/audit/vision` (on-demand) | Both import same function |
| Correction loop | `runBrowserCorrectionPipeline()` iterative | `BrowserFeedbackAdapter` manual | **DIVERGED → fix in B.2** |
| Pipeline input | `design-page.ts:542-562` | `pipeline-input-builder.ts` | Duplicated (future unification) |

---

## Key Files

| File | Change |
|------|--------|
| `packages/agents-ux/src/ux-design/structural-quality-gate.ts` | NEW: standalone structural checks |
| `packages/agents-ux/src/design-pipeline/nodes.ts:139-149` | Progressive evaluator (structural Phase 1) |
| `packages/agents-ux/src/ux-design/design-evaluator.ts:343-397` | Refactor to call shared function |
| `packages/agents-ux/src/index.ts` | Export `runStructuralQualityGate` |
| `docs/adrs/ADR-045-evaluator-deferred-to-phase-2.md` | Amend: structural-only Phase 1.1 |
| `packages/dashboard/src/app/api/pages/[pageId]/design/correct/route.ts` | Wire `runBrowserCorrectionPipeline()` |

## Verification

1. `nx run-many -t typecheck && nx run-many -t test && nx run-many -t lint` — all green
2. Run `design:page dashboard --fresh` — pipeline output shows structural score (not `undefined`)
3. Dashboard loads same design, Deep Audit shows vision+structural score
4. Dashboard "Fix All" with vision issues triggers iterative correction (same as CLI)
5. Both paths produce consistent structural deductions for same spec
