# Plan: Execute R10 Phase A — Visual Delta Rendering (Overlay Mode)

## Context

R10 is the renderer extension that produces visual deltas — taking an existing `DesignSpecV2` plus a `DesignSpecDelta` (from R9) and rendering them with semantic highlighting on added, modified, and removed regions. The brief at `docs/research/briefs/R10-visual-delta-rendering.md` specifies the full API; this plan covers Phase A specifically: overlay mode only. Side-by-side (Phase B) and slider (Phase C) are out of scope.

Phase A is the M4-unblocking deliverable. It also gives the M3.6 eval brief a richer artifact than JSON fixture descriptions, and unblocks the eventual brownfield request UI in the dashboard.

The visual target for this phase is the reference mockup at `docs/research/briefs/R10-visual-delta-mockup.html`. Implementation output must match its highlighting conventions, badge positioning, opacity values, and color choices.

## Deliverables

1. `packages/designspec-renderer/src/renderer/delta/` — new module with three exports:
   - `deltaApply(existing, delta)` — produces the applied DesignSpecV2
   - `deltaCompute(existing, applied)` — produces a DesignSpecDelta by diffing two specs
   - `renderDelta(existing, delta, tokens, catalog, options)` — produces the visual output
2. `packages/designspec-renderer/src/renderer/delta/index.test.ts` — unit tests covering empty/added/modified/removed/mixed/invalid deltas
3. `packages/designspec-renderer/src/renderer/delta/__snapshots__/` — snapshot tests on three hand-crafted fixtures
4. `packages/designspec-renderer/dev/delta-preview.html` — small standalone preview harness so the renderer output can be viewed in a browser
5. `packages/designspec-renderer/dev/render-delta-fixture.ts` — CLI script that renders the M3.5 brownfield dashboard delta to the preview harness; used for visual verification
6. Updated `packages/designspec-renderer/src/index.ts` exporting the new public surface
7. R10 brief status updated to "Phase A COMPLETE"

## Phases

### Phase A.1: Delta utilities (no rendering yet)

Smallest first. Build `deltaApply` and `deltaCompute` as pure functions with no rendering concerns. These get tested independently before any UI work.

**`deltaApply(existing: DesignSpecV2, delta: DesignSpecDelta) → Result<DesignSpecV2, DeltaError>`:**
- Clone `existing.nodes`
- For each `nodeId` in `delta.added`: insert into nodes map; validate parent exists in result
- For each `nodeId` in `delta.modified`: shallow-merge fields into existing node; validate node exists
- For each `nodeId` in `delta.removed`: delete from nodes map; cascade-delete any descendants whose parent chain leads to a removed ancestor; track for return
- For each `nodeId` in `delta.reordered`: update `order` field; validate sibling order remains gap-free after all reorders applied
- Return the new spec, or DeltaError with specific failing nodeId for any validation failure

**`deltaCompute(existing: DesignSpecV2, applied: DesignSpecV2) → DesignSpecDelta`:**
- Iterate both nodes maps
- nodes in `applied` not in `existing` → `added`
- nodes in `existing` not in `applied` → `removed`
- nodes in both with field differences → `modified` (partial NodeSpec with only diffing fields)
- nodes in both with only `order` differing → `reordered`
- Return delta with all four maps populated

Both functions: pure, deterministic, no LLM calls, no async. Hot-path-callable.

**Unit tests** for Phase A.1 cover:
- `deltaApply` empty delta returns identical spec
- `deltaApply` add to non-existent parent returns DeltaError
- `deltaApply` modify non-existent node returns DeltaError
- `deltaApply` remove cascades to descendants correctly
- `deltaCompute` round-trips: `deltaApply(existing, deltaCompute(existing, applied))` deep-equals `applied`
- `deltaCompute` produces empty delta when `existing === applied`

### Phase A.2: renderDelta core (no highlights)

Build the core renderer that produces JSX from `existing` + `delta`. No highlight markup yet — just render the applied spec correctly through the existing `renderToJSX` path with `data-node-id` attributes on every node so the highlight pass can target them later.

**`renderDelta` signature exactly as R10 §"Public surface":**

```typescript
export function renderDelta(
  existingSpec: DesignSpecV2,
  delta: DesignSpecDelta,
  tokens: RendererTokens,
  catalog: CatalogMap,
  options?: DeltaRenderOptions,
): Result<DeltaRenderOutput, RenderError>
```

Phase A.2 implementation:
1. Call `deltaApply(existing, delta)` internally to produce applied spec
2. For removed nodes (only in existing, not in applied): synthesize a "ghost spec" containing just those nodes + their parent chain so they can be rendered in their original layout slot
3. Pass through existing `renderToJSX` for the applied spec
4. Modify `jsx-builder.ts` to emit `data-node-id="{id}"` on every node's outer element
5. Return `DeltaRenderOutput` with empty `changeRegions` (filled in Phase A.3) and correct `metadata` counts

Modes other than overlay return `Err(RenderError)` with message "Not implemented in Phase A."

### Phase A.3: Highlight markup

Wrap nodes with highlight markup based on which delta map they appear in.

For each node ID in the rendered output:
- If in `delta.added`: wrap with `<div class="r10-highlight r10-added" data-delta-op="added" data-node-id="{id}">...</div>` plus the "Added" badge as a sibling element
- If in `delta.modified`: same pattern with `r10-modified` class and "Modified" badge
- If in `delta.removed`: render from ghost spec with `r10-removed` class, "Removed" badge, and strikethrough applied to text content via CSS
- If in `delta.reordered` (and not also in modified): same as modified plus a small arrow indicator

Highlight CSS lives in a separate file (`packages/designspec-renderer/src/renderer/delta/highlight-styles.ts`) exported as a string constant that callers include in their preview harness. The CSS must match the mockup at `docs/research/briefs/R10-visual-delta-mockup.html` for:
- Border colors and weights (2px solid for added/modified, 2px dashed for removed)
- Background tint colors and opacities (8% for added, 4% for modified, 4% for removed at 55% overall opacity)
- Badge positioning (absolute top: -10px, right: 8-10px from highlight border)
- Badge background, text color, border (light-shade fill + dark-shade text from same color ramp)

**Visual verification step.** After Phase A.3 implementation, run `packages/designspec-renderer/dev/render-delta-fixture.ts` to render the M3.5 brownfield dashboard delta to the preview harness. Open the preview harness in a browser. Visually compare to the mockup. List any divergences. Do not declare Phase A.3 done until rendered output matches the mockup's highlight conventions.

### Phase A.4: ChangeRegion output and field diff

Populate the `changeRegions` array in `DeltaRenderOutput`. Each entry corresponds to one delta operation.

For each operation:
- `nodeId`: the affected node ID
- `op`: 'added' | 'modified' | 'removed' | 'reordered'
- `description`: from `delta.description` if present (R9 schema extension — see R10 open question #5), else derived as "Added {nodeType}" / "Modified {nodeType}" / etc.
- `fieldDiffs`: empty for added/removed; for modified, computed via `computeFieldDiff(existing[id], delta.modified[id])` per R10 §"Field-level diff"

`metadata` populated with counts and a `estimatedRenderComplexity` heuristic: total node count ≤ 50 → 'low', ≤ 150 → 'medium', else 'high'.

### Phase A.5: Preview harness and visual verification

Build `packages/designspec-renderer/dev/delta-preview.html`. Self-contained HTML page that:
- Loads React + ReactDOM from a CDN-pinned version (or includes them inline if no CDN allowed in dev env)
- Has a `<div id="root">` where rendered JSX is mounted
- Includes the highlight CSS from `highlight-styles.ts`
- Includes design tokens as inline CSS variables for the test fixture's project

Build `packages/designspec-renderer/dev/render-delta-fixture.ts`. Script that:
1. Reads M3.5 brownfield fixture from `packages/eval/src/scenarios/cashpulse-brownfield.yaml`
2. Reads existing dashboard spec from `fixtures/personal-expense-tracker/agentforge/designs/dashboard.json`
3. Computes (or uses pre-computed) DesignSpecDelta for the "add recurring transactions" change
4. Calls `renderDelta(existing, delta, tokens, catalog, { mode: 'overlay' })`
5. Writes the JSX output into the preview harness HTML at a `<!-- DELTA OUTPUT -->` placeholder
6. Prints the file path so it can be opened in a browser

**Visual verification gate.** Open the preview harness in a browser. Take a screenshot. Compare to the mockup at `docs/research/briefs/R10-visual-delta-mockup.html`. The comparison must score acceptable on these specific criteria:
- Added regions have green outline + green tint + "Added" badge in top-right
- Modified regions have amber outline + amber tint + "Modified" badge in top-right
- Removed regions have red dashed outline + reduced opacity + strikethrough + "Removed" badge
- Badge text uses dark shade of same color ramp (not white or generic gray)
- Highlight tint is subtle enough that the underlying component remains the focal point
- Multiple highlights on one screen don't visually compete or clash

If any criterion fails, iterate on `highlight-styles.ts` and re-render. Do not declare Phase A.5 done until visual verification passes.

### Phase A.6: Unit tests and snapshots

Complete the test coverage per R10 §"Testing":
- Unit tests in `packages/designspec-renderer/src/renderer/delta/index.test.ts` covering all cases listed in R10
- Snapshot tests on three hand-crafted fixtures (added-only, modified-only, mixed) — snapshots generated then reviewed visually before commit
- Regression: `renderDelta(spec, emptyDelta, ...)` produces the same JSX as `renderToJSX(spec, ...)` (modulo the added `data-node-id` attributes)

### Phase A.7: Status updates

1. Update `docs/research/briefs/R10-visual-delta-rendering.md` status line: "Phase A COMPLETE (DATE). Phases B-C deferred."
2. Update `CLAUDE.md` last-session line
3. Add R10 Phase A row to the master execution plan's milestone table if appropriate (this is a renderer extension milestone, not strictly a chips-next-steps milestone — consult before adding)

## Verification

1. `packages/designspec-renderer/src/renderer/delta/index.ts` exports `deltaApply`, `deltaCompute`, `renderDelta` with signatures matching R10 brief §"Public surface" verbatim
2. `npm test` in `packages/designspec-renderer` passes; new tests all green
3. `npm run build` in `packages/designspec-renderer` succeeds with no new type errors
4. `packages/designspec-renderer/dev/delta-preview.html` renders the M3.5 brownfield dashboard delta cleanly in a browser
5. Visual comparison against `docs/research/briefs/R10-visual-delta-mockup.html`: pass on all six criteria in Phase A.5
6. Snapshot tests produce stable output across two consecutive runs (determinism check)
7. R10 brief status line updated

## Critical files

- `docs/research/briefs/R10-visual-delta-rendering.md` — the brief (read in full before starting)
- `docs/research/briefs/R10-visual-delta-mockup.html` — visual target for verification
- `docs/research/briefs/R9-brownfield-design-delta.md` — DesignSpecDelta schema (§6.2)
- `packages/designspec-renderer/src/renderer/react/render-to-jsx.ts` — existing entry point, reused inside renderDelta
- `packages/designspec-renderer/src/renderer/react/jsx-builder.ts` — JSX assembly; extended to emit data-node-id
- `packages/designspec-renderer/src/types/design-spec-v2.ts` — DesignSpecV2, NodeSpec
- `packages/agents-ux/src/prototype/merge-frozen-chrome.ts` — prior art for partial-spec merging
- `fixtures/personal-expense-tracker/agentforge/designs/dashboard.json` — M0 baseline dashboard spec (used as `existing` for visual verification)
- `packages/eval/src/scenarios/cashpulse-brownfield.yaml` — M3.5 brownfield fixture

## STOP conditions

- DesignSpecDeltaSchema in the live repo differs from R9 §6.2 → STOP and report; do not infer the schema
- Phase A.1 round-trip property fails (`deltaApply(existing, deltaCompute(existing, applied)) !== applied`) → STOP; the utilities are wrong and must be fixed before A.2 starts
- Phase A.5 visual verification fails after three iteration cycles → STOP and report which criteria are failing; do not declare done
- Adding `data-node-id` to `jsx-builder.ts` introduces regressions in existing `renderToJSX` tests → STOP; the attribute addition must be backward-compatible