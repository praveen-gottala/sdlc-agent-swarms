# Task: Implement Phase A Standalone Design Correction Pipeline

## Source Plan
Read `/Users/praveengottala/.claude/plans/purring-sauteeing-stonebraker.md` — this is the implementation plan. Follow it step by step (Steps 1–7) in the order specified. All file paths, interfaces, and test requirements in the plan are authoritative.

## Three Adjustments to Apply During Implementation

### Adjustment 1: Add `dataCatalog` to DOMNodeLayout (Step 2)

In `dom-extraction.ts`, add `dataCatalog: string | null` to the `DOMNodeLayout` interface:

```typescript
interface DOMNodeLayout {
  nodeId: string;
  dataCatalog: string | null;  // from data-catalog attribute — identifies badge/chip/button
  rect: { x: number; y: number; width: number; height: number };
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  textContent: string;
  parentNodeId: string | null;
  childNodeIds: string[];
  computed: { overflow: string; display: string; position: string };
}
```

In the `page.evaluate()` call inside `extractDOMLayout()`, read it:
```typescript
dataCatalog: htmlEl.getAttribute("data-catalog"),
```

Before implementing: verify that the browser renderer's catalog component renderers in `packages/designspec-renderer/src/renderer/react/components/` set `data-catalog` on their root element. If they don't, add it. Every catalog renderer's output must include `data-catalog={catalogName}` alongside the existing `data-node={nodeId}`.

The badge-oversize check in Step 3 must use `dataCatalog` to identify badges/chips — not heuristics based on element size or text length.

### Adjustment 2: Split Detection from Auto-Fix (Step 3)

The plan's `mechanical-fixes.ts` should split into two tiers:

**Tier 1 — Auto-fixable (apply directly, re-render, monotonic guard):**
- `badge-oversize`: Remove explicit `width` from badge/chip catalog nodes
- `text-clip`: Remove explicit `width`, set `width: 'fill'`
- `zero-size`: Remove explicit `width`/`height` constraints

**Tier 2 — Report only (include in issues array but do NOT auto-fix):**
- `overlap`: Sibling rects overlap — report with both nodeIds and overlap dimensions
- `child-overflow`: Child rect extends beyond parent — report with overflow amounts per direction

Update `applyMechanicalFixes()` to only apply fixes for Tier 1 rules. Tier 2 issues should be included in the returned `MechanicalIssue[]` array so the pipeline orchestrator (Step 6) can forward them to the vision correction adapter as context.

The `MechanicalIssue` type should include an `autoFixable: boolean` field:

```typescript
interface MechanicalIssue {
  nodeId: string;
  rule: 'overlap' | 'child-overflow' | 'zero-size' | 'text-clip' | 'badge-oversize';
  autoFixable: boolean;
  description: string;
  suggestedFix: Partial<NodeSpec> | null;  // null for Tier 2 (report-only)
}
```

In the pipeline orchestrator (Step 6), pass Tier 2 issues to the vision correction adapter so it has mechanical checker context alongside screenshot + DOM + user tags.

### Adjustment 3: Threshold Constants (Step 3)

Use these starting threshold values in `mechanical-fixes.ts`. They come from a separate mechanical validation harness that tested these thresholds against LLM-generated DesignSpec fragments:

```typescript
const OVERLAP_THRESHOLD_PX = 2;       // ignore sub-pixel overlap from browser rounding
const OVERFLOW_THRESHOLD_PX = 2;      // ignore sub-pixel overflow
const COLLAPSE_HEIGHT_PX = 1;         // below this = zero-size collapse
const BADGE_WIDTH_RATIO = 2.5;        // badge computed width / estimated text width
const TEXT_CLIP_TOLERANCE_PX = 2;     // scrollWidth - clientWidth tolerance
```

Export these as named constants so they can be imported by test fixtures and the external validation harness later.

## Implementation Order

Follow the plan's order exactly:
1. Step 1: `screenshot-session.ts` + refactor `screenshot.ts`
2. Step 2: `dom-extraction.ts` + test (with Adjustment 1)
3. Step 3: `mechanical-fixes.ts` + test (with Adjustments 2 and 3)
4. Step 4: `interactive-preview.ts` + `preview-overlay.js`
5. Step 5: `browser-correction-adapter.ts` + test
6. Step 6: `browser-correction-pipeline.ts` + test
7. Step 7: Export updates

## Verification

After each step, run:
- `nx run designspec-renderer:typecheck`
- `nx run designspec-renderer:test`

After Step 5+:
- `nx run agents-ux:typecheck`
- `nx run agents-ux:test`

After Step 7:
- `nx run-many -t typecheck`
- `nx run-many -t test`

All existing tests must pass at every step. Zero regressions.
