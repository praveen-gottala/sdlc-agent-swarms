# R10: Visual Delta Rendering

**Status:** Phase A COMPLETE (2026-05-16). Phases B (side-by-side) and C (slider) deferred.
**Blocks:** Brownfield request UI (M5 candidate). Unblocks M4 demos and M3.6 visual inspection.
**Depends on:** R9 schemas (`DesignSpecDelta`, `DesignNodeDelta`) — accepted, M3.5 COMPLETE.

## Scope

This brief specifies the renderer extension that takes a `DesignSpecV2` (existing) and a `DesignSpecDelta` (from R9) and produces a visual representation showing what is being added, modified, or removed — for human review before the delta is applied.

The output is consumable by the dashboard's design preview surface and by the M3.6 eval brief (as a richer artifact than JSON-only fixture descriptions). It is NOT a production rendering — applied DesignSpecs continue to be rendered through the existing `renderToJSX` path. This is a separate path specifically for delta preview.

R10 is a renderer extension, not a new system. It builds directly on the existing `packages/designspec-renderer` package and consumes R9's locked schemas.

## What this unblocks

- **M4 demo value.** The first end-to-end brownfield run in M4 will produce a DesignSpecDelta. Without R10, demonstrating it requires reading JSON. With R10, the demo is a visual.
- **M3.6 inspection.** The eval brief can illustrate "good" and "bad" outputs visually, not just by code snippets.
- **Dashboard brownfield preview.** The medium-term brownfield request UI consumes R10 directly. Without R10, the preview layer is gated.
- **Schema validation.** Forcing the renderer to consume R9's DesignSpecDelta surfaces any schema gaps before M4 commits.

## Locked decisions (NOT relitigated)

- `DesignSpecDelta` hybrid schema with `added` / `modified` / `removed` / `reordered` maps (R9 §6.2)
- `DesignSpecV2` flat adjacency list with `NodeSpec` budget of 24 optional fields (19 used)
- Renderer produces JSX via `renderToJSX` (existing) — R10 produces a separate `renderDelta` function, not a modification to `renderToJSX`
- `applyFrozenChromeToPageSpec` pattern as prior art for partial spec merging — R10 uses a similar approach internally

## Current state

Reading the renderer package at `packages/designspec-renderer/src/renderer/react/`:

- `renderToJSX(spec, tokens, catalog)` — produces a TSX string from a DesignSpecV2
- `tree-builder.ts` — converts the flat adjacency list to a tree with resolved catalog references
- `token-resolver.ts` — resolves token references (colors, typography) to concrete values
- The renderer has no concept of "diff" — it renders one spec at a time

No `renderDelta` function exists. No highlighting overlay logic exists. The dashboard's design page renders DesignSpecs via the existing path; there is no preview surface for an unapplied delta.

`packages/agents-ux/src/prototype/merge-frozen-chrome.ts` (`applyFrozenChromeToPageSpec`) is prior art for partial-spec merging — it takes a page spec and a chrome spec and produces a merged spec. The delta-apply logic in R10 follows a similar pattern but is more general.

## The API

### Public surface

```typescript
// packages/designspec-renderer/src/renderer/delta/index.ts

export function renderDelta(
  existingSpec: DesignSpecV2,
  delta: DesignSpecDelta,
  tokens: RendererTokens,
  catalog: CatalogMap,
  options?: DeltaRenderOptions,
): Result<DeltaRenderOutput, RenderError>;
```

### Input contracts

`existingSpec: DesignSpecV2` — the pre-change spec, from `readDesignSpec()`.

`delta: DesignSpecDelta` — the change description, from the design specialist (M4) or from a hand-crafted fixture.

`tokens: RendererTokens` — the design token set; reused from existing renderer call sites.

`catalog: CatalogMap` — the catalog of component definitions; reused.

`options: DeltaRenderOptions` — controls view mode, highlighting style, annotation visibility:

```typescript
export interface DeltaRenderOptions {
  /** Rendering mode. Default: 'overlay'. */
  mode?: 'overlay' | 'side-by-side' | 'slider';

  /** Highlight color tokens. Defaults to mint/amber/red. */
  highlighting?: {
    added?: HighlightStyle;     // default: 'mint'
    modified?: HighlightStyle;  // default: 'amber'
    removed?: HighlightStyle;   // default: 'red-dashed'
  };

  /** Show "Added" / "Modified" / "Removed" badges. Default: true. */
  annotations?: boolean;

  /** Enable hover-to-see-field-diff on modified regions. Default: true. */
  hoverDiff?: boolean;

  /** Component name for the output JSX. Default: derived from screen name. */
  componentName?: string;
}

export type HighlightStyle =
  | 'mint' | 'green'
  | 'amber' | 'yellow'
  | 'red-dashed' | 'red-ghost'
  | { outline: string; fill: string; opacity?: number };
```

### Output contract

```typescript
export interface DeltaRenderOutput {
  /** Rendered JSX as a string, ready to write to disk or eval. */
  jsx: string;

  /** Identified change regions, for downstream UI to wire approval handlers. */
  changeRegions: ChangeRegion[];

  /** Summary metadata, useful for impact preview cards. */
  metadata: DeltaRenderMetadata;
}

export interface ChangeRegion {
  /** Node ID this region corresponds to. */
  nodeId: string;

  /** Operation type. */
  op: 'added' | 'modified' | 'removed' | 'reordered';

  /** Human-readable description (from delta.description if present, else derived). */
  description: string;

  /** Field-level diff for modified ops. Empty for added/removed. */
  fieldDiffs?: FieldDiff[];
}

export interface FieldDiff {
  field: string;        // e.g., 'background'
  before: unknown;      // e.g., 'surface'
  after: unknown;       // e.g., 'recurring-tint'
}

export interface DeltaRenderMetadata {
  addedCount: number;
  modifiedCount: number;
  removedCount: number;
  reorderedCount: number;
  totalNodeCount: number;
  estimatedRenderComplexity: 'low' | 'medium' | 'high';
}
```

`changeRegions` is the key output for the dashboard's per-region approval UI. Each region carries enough metadata to render a tooltip, fire an approval callback, or expand a field-level diff panel.

## Rendering model

Three view modes, distinct implementations:

### Overlay mode (default)

The mature, primary mode. Renders the *applied* spec (computed via `deltaApply(existingSpec, delta)`) with semantic highlighting overlaid on changed regions.

For nodes in `delta.added`: render the new node with the added highlight style (mint outline + subtle mint fill). Wrap in `data-delta-op="added"` and `data-node-id="..."` for the dashboard to attach approval handlers.

For nodes in `delta.modified`: render the modified node with the modified highlight style (amber outline + subtle amber fill). If `hoverDiff` is enabled, attach a hover handler that reveals field-level diff (e.g., a tooltip showing `Background: surface → recurring-tint`).

For nodes in `delta.removed`: render the *original* node (from existingSpec) with the removed highlight style (red dashed outline + 50% opacity + strikethrough on text content). Position absolutely in its original layout slot so it appears alongside surrounding unchanged content.

For nodes in `delta.reordered`: render with a small sibling-position indicator (↑ or ↓ icon) and the modified highlight. Reorders are technically modifications of the `order` field, so they overlap with modified — the indicator helps disambiguate.

### Side-by-side mode

Renders the existing spec on the left, the applied spec on the right, both at the same scale. Highlights apply to both panels — removed regions highlight on the left, added regions highlight on the right, modified regions highlight on both. Suitable for users who want to see explicit before/after rather than overlay.

### Slider mode

Interactive. Renders the applied spec on top, the existing spec underneath, with a draggable vertical divider. The divider position controls what proportion of each is visible. Highlights apply on the applied side only.

Slider mode is JSX-only — it requires runtime interactivity. The static output for slider mode is the JSX component with the divider control; rendering requires React.

### Compositing strategy

For overlay and side-by-side modes, the output is static JSX — no runtime interactivity needed. The JSX bakes in the highlights as CSS classes and `data-*` attributes.

For slider mode, the output JSX includes a small React state hook for the divider position. The JSX is self-contained.

The actual rendering of nodes uses the existing tree-builder + token-resolver pipeline from the renderer; R10 wraps the renderer output, it does not reimplement node rendering.

## Highlighting conventions

These are the defaults; consumers can override via `options.highlighting`.

| Op | Outline | Fill | Opacity | Other |
|----|---------|------|---------|-------|
| Added | 2px solid mint-500 | mint-500 @ 8% | 100% | "Added" badge top-right |
| Modified | 2px solid amber-500 | amber-500 @ 4% | 100% | "Modified" badge top-right; field diff on hover |
| Removed | 2px dashed red-500 | red-500 @ 4% | 50% | "Removed" badge top-right; strikethrough on text content |
| Reordered | 2px solid amber-500 | amber-500 @ 4% | 100% | Small ↑/↓ arrow indicator + "Reordered" badge |

Color tokens come from `RendererTokens.semantic.*` — they should resolve to actual project token values so the highlight aesthetic matches the project's design system. The default values above are the fallback when no project tokens are passed.

Annotation badges are small pill labels (12px font, 4px padding, rounded). Positioned top-right of each highlighted region. Color-matched to the highlight color.

## Field-level diff for modified nodes

When `delta.modified[nodeId]` is present, it contains a partial NodeSpec with only the changed fields. The renderer can compute the diff:

```typescript
function computeFieldDiff(
  existing: NodeSpec,
  partial: Partial<NodeSpec>,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const [field, value] of Object.entries(partial)) {
    if (existing[field as keyof NodeSpec] !== value) {
      diffs.push({
        field,
        before: existing[field as keyof NodeSpec],
        after: value,
      });
    }
  }
  return diffs;
}
```

These diffs surface as hover tooltips in overlay mode and as an expandable section in side-by-side mode.

## Edge cases and constraints

**Removed nodes need original spec context.** A removed node's render comes from the existing spec, not the delta. The implementation must keep both in scope during rendering — straightforward but easy to get wrong.

**Nested change regions.** If a parent node is added and contains added children, the children are nested inside the parent's highlight. The parent's highlight outline wraps everything; the children do not get their own outlines (visual noise reduction). Modified parents with added children: parent gets modified highlight, children get added highlights (different colors, visible nesting).

**Layout shifts.** Adding a node may shift surrounding nodes. In overlay mode, the user sees the final layout (after the shift). In side-by-side mode, the shift is visible — that is correct behavior, the user should see that the layout shifted.

**Text content changes.** A modified node with new label/content text shows the new text in the rendered output, with the field diff revealing the old text on hover. Removed nodes show the old text with strikethrough.

**24-field budget.** R10 does NOT add fields to NodeSpec. Highlight state is rendered via CSS classes and data attributes on the wrapper, not new NodeSpec fields. Budget is unchanged.

**Empty deltas.** If a delta has no operations (all maps empty), `renderDelta` returns the existing spec rendered as-is with no highlights, plus metadata showing all counts as 0. Useful for sanity-checking the apply path.

**Invalid deltas.** If the delta references node IDs not present in the existing spec (e.g., trying to modify a node that does not exist), return a `RenderError` with the offending IDs. Do not try to render around the issue.

**Chrome interaction.** When the existing spec has shared chrome (via `applyFrozenChromeToPageSpec`), the chrome nodes are part of the spec but generally not part of the delta. The renderer must distinguish chrome nodes from screen nodes and not highlight chrome unless the delta explicitly references it.

## What is out of scope for R10

- **Runtime interactivity beyond slider mode.** Approval handlers, refinement chat, etc. — those are dashboard-layer concerns. R10 exposes `changeRegions` with metadata; the dashboard wires the interactions.
- **Code diff display.** The collapsed code-changes panel in the vision is generated from M4's Implementer outputs, not from R10.
- **Multi-screen impact preview.** R10 renders one delta against one screen. The dashboard composes multiple per-screen previews into the impact view.
- **Producing deltas.** R10 only consumes deltas. Producing them is the design specialist's job (M4).
- **Persistence of preview state.** Whether a preview is saved to disk and reloadable is a dashboard concern. R10 produces output strings; persistence is upstream.

## Testing

Three test layers:

**Unit tests** in `packages/designspec-renderer/src/renderer/delta/index.test.ts`:
- Empty delta produces the existing spec rendered as-is with all counts 0
- Added-only delta renders new nodes with added styling and correct `changeRegions` entries
- Modified-only delta renders existing nodes with modified styling and correct `fieldDiffs`
- Removed-only delta keeps original layout with removed styling
- Mixed delta produces correct counts in metadata
- Invalid delta (non-existent node ID) returns RenderError
- Catalog override conflicts (a delta modifies a catalog-referenced field but the node uses a catalog) are handled — the override takes precedence in render
- Reordered nodes get the arrow indicator

**Snapshot tests** with three or four hand-crafted fixtures (one each of added-only, modified-only, removed-only, mixed). Snapshot the JSX output. Snapshots get reviewed visually on first generation, then guarded by snapshot equality.

**Visual regression** using existing M0/M3.5 fixtures:
- Render M0 `dashboard.json` with an empty delta — must match existing `renderToJSX` output
- Render M0 `dashboard.json` with a hand-crafted "add recurring card" delta — visual review
- Render M0 `add-expense.json` with a hand-crafted "add recurrence toggle" delta — visual review

Visual regression is review-by-human at first; once R10 is stable, screenshot diffs become the regression check.

## Implementation phases

R10 is sized for two-to-three milestone-weeks of work, but the first phase delivers immediate value.

**Phase A: Overlay mode (the high-leverage piece).** Implement `renderDelta` in overlay mode only. Unit tests pass. Side-by-side and slider modes return a "not yet implemented" RenderError. This is the version that unblocks M4 demos and M3.6 visual inspection.

**Phase B: Side-by-side mode.** Add side-by-side rendering. Reuses overlay's per-node highlight logic; just adds the dual-panel layout.

**Phase C: Slider mode.** Add the interactive slider component. JSX-only output now includes a small React state hook. The most complex of the three modes but the least essential.

**Phase D (optional):** Performance optimization for large specs (159-node dashboards). Profile actual render times; add lazy rendering or virtualization if needed.

Phase A is the M4-unblocking deliverable. Phases B-D can ship later.

## Critical files

- `packages/designspec-renderer/src/renderer/react/render-to-jsx.ts` — existing render entry point (will be reused inside `renderDelta`)
- `packages/designspec-renderer/src/renderer/react/jsx-builder.ts` — JSX assembly (extended to wrap nodes with highlight markup)
- `packages/designspec-renderer/src/types/design-spec-v2.ts` — `DesignSpecV2`, `NodeSpec`
- `docs/research/briefs/R9-brownfield-design-delta.md` §6.2 — `DesignSpecDeltaSchema`
- `packages/core/src/design-spec-store.ts` — `readDesignSpec` (used by callers to load `existingSpec`)
- `packages/agents-ux/src/prototype/merge-frozen-chrome.ts` — prior art for partial-spec merge (`applyFrozenChromeToPageSpec` pattern)

## Open questions

1. **Should R10 implement `deltaApply` itself or take an applied spec as input?** Either it computes `applied = deltaApply(existing, delta)` internally, or the caller computes it and passes both `existing` and `applied`. Argument for internal: simpler API. Argument for external: `deltaApply` is M4's responsibility — if it lives in M4 and R10 calls into M4, that is a circular dependency. *Recommendation:* R10 implements its own delta-apply utility (light, no LLM calls, just adjacency-list manipulation). M4's `deltaApply` lives separately and may share code via a small `delta-utils` module.

2. **Reordering visual treatment.** A `reordered` op changes a node's sibling position without modifying other fields. How visually distinct should this be? *Recommendation:* same color/style as `modified`, with an additional small arrow indicator. If reorders prove visually noisy in practice, treat them as a sub-case of modified with no separate indicator.

3. **Highlight customization scope.** Should consumers be able to override colors per-screen, or just globally per `renderDelta` call? *Recommendation:* global per call. Per-screen customization adds API surface for unclear benefit; the dashboard can call `renderDelta` separately per screen with different options if needed.

4. **Dashboard integration as a R10 deliverable?** Should R10 include a dashboard preview component that consumes `renderDelta` output, or is that strictly M5 scope? *Recommendation:* strictly M5 scope. R10 ships the renderer extension; the dashboard wires it. Keeps R10 tractable.

5. **Optional `description` field in DesignSpecDelta.** R10's `ChangeRegion.description` populates from `delta.description` if present, else derives from the op type and node properties. R9's schema does not currently include a `description` field on delta ops. *Recommendation:* extend `DesignNodeDeltaSchema` with an optional `description: z.string().optional()` for human-readable change summaries. This is a low-risk additive change to R9's schema.