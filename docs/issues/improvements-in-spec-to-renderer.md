# Task: Fix DesignSpec Browser Renderer — Generic Style Builder Gaps

## Context

The browser renderer at `packages/designspec-renderer/src/renderer/browser/app/` converts DesignSpec JSON nodes into React elements with inline styles. During correction pipeline testing, three categories of DesignSpec properties are being silently ignored — the spec says one thing, the browser renders something else. These are not edge cases specific to one screen; they affect any DesignSpec that uses these properties.

The fix must be **in the core style builder** — the centralized place where DesignSpec node properties are mapped to CSS styles. Every node type (container, section, header, page) and every catalog renderer must inherit these fixes automatically.

## Real-world examples (Budgetly dashboard)

These are the actual nodes from the Budgetly dashboard DesignSpec (`designspec-v2.json`) that exposed these gaps during correction pipeline testing. The fixes must be generic, but use these as concrete verification targets.

### Example 1: Donut chart renders as rectangle instead of circle

Node `donut-placeholder` in the spec:
```json
{ "parent": "donut-chart-visual", "order": 0, "type": "container",
  "width": 180, "height": 180, "radius": 90,
  "background": "surface-elevated",
  "layout": { "dir": "column", "align": "center", "justify": "center", "gap": 4 } }
```

Expected: a 180×180 circle (border-radius equals half of width/height).
Actual: renders as a rectangle — `radius: 90` either isn't being applied as `borderRadius`, or is applied but children overflow past the rounded corners because `overflow: hidden` is missing.

### Example 2: Search bar ignores explicit width

Node `filter-search` in the spec:
```json
{ "parent": "filter-bar", "order": 6, "catalog": "search-input",
  "placeholder": "Search expenses...", "width": 200 }
```

Expected: renders at 200px wide.
Actual: renders at ~516px because the search-input catalog renderer applies its own flex sizing and ignores the node's `width` property.

### Example 3: Popover should be a centered modal overlay

Node `popover-overlay` in the spec (after correction pipeline patches):
```json
{ "parent": "root", "order": 10, "type": "container",
  "width": 480, "radius": 16, "background": "surface-elevated", "shadow": "lg",
  "position": "fixed", "zIndex": 1000,
  "layout": { "dir": "column", "gap": 16, "px": 24, "py": 24, "align": "center", "justify": "center" } }
```

Expected: centered modal overlay with backdrop, floating above all other content.
Actual: renders in normal document flow at the bottom of the page because the renderer doesn't support `position` or `zIndex` properties.

These three examples represent three generic gaps: (1) border-radius with overflow clipping, (2) explicit dimensions on catalog nodes, and (3) CSS positioning for overlay elements. Fixing them in the style builder fixes them for every future DesignSpec, not just Budgetly.

## Step 1: Audit the style builder

Before making changes, find and read the code that converts a DesignSpec node into CSS/inline styles. This is likely one of:
- A `buildStyles()` or `nodeToStyle()` function
- Inline style construction in the main render function
- A shared utility imported by both layout node renderers and catalog renderers

Map out which DesignSpec properties are currently handled and which are silently dropped. Specifically check:
- `width` (number | "fill") — is it applied consistently to ALL node types including catalog?
- `height` (number) — same question
- `radius` (number) — is it converted to `borderRadius`?
- `background` — is it resolved from tokens and applied?
- `border` — same question
- `shadow` — is it resolved and applied?
- `position` — is it handled at all?
- `zIndex` — is it handled?
- `overflow` — is it ever set?

Report what you find before proceeding.

## Step 2: Fix the core style builder

All DesignSpec node properties that map to CSS must be handled in ONE place that every renderer path uses. No property should require per-component special casing.

### 2a. Explicit dimensions must override flex behavior

When a DesignSpec node has an explicit `width` (number) or `height` (number), the rendered element must use that exact size. This applies to:
- Layout nodes (container, section, header)
- Catalog nodes (badge, button, search-input, chip, stat, etc.)

The pattern:
```
if width is a number → style.width = Npx, style.flex = 'none', style.flexShrink = 0
if width is "fill"   → style.flex = 1, style.minWidth = 0
if width is absent   → no width/flex set (component default behavior)
```

Same logic for height.

This is critical for catalog renderers. Currently some catalog renderers apply their own `flex: 1` or ignore the node's `width` entirely. The fix: catalog renderers must read the node's `width`/`height` and apply it as an outer wrapper style. The catalog component renders inside that wrapper.

**Audit every catalog renderer** to verify this. The renderers are in:
`packages/designspec-renderer/src/renderer/browser/app/src/` (or wherever catalog components are rendered)

If catalog renderers construct their own root element styles, those styles must defer to the node's explicit dimensions when present.

### 2b. border-radius must clip content

When a node has `radius` AND explicit `width` AND explicit `height`, the renderer must apply:
```css
border-radius: {radius}px;
overflow: hidden;
```

`overflow: hidden` is essential — without it, child content renders outside the rounded corners, making the border-radius invisible. This is the standard CSS behavior for circular/rounded containers.

When radius is present but dimensions are NOT explicit (the element sizes to content), apply `border-radius` without `overflow: hidden` — clipping flexible-size containers can cause content loss.

### 2c. CSS positioning support

The DesignSpec schema doesn't formally define `position`, `zIndex`, `top`, `left`, `right`, `bottom`. But the correction pipeline's vision LLM may output these properties as patches to fix layout issues (e.g., converting a popover into a centered modal).

Add support in the style builder:
```
position: "fixed" | "absolute" | "relative" → CSS position
zIndex: number → CSS z-index
```

For centering: when a positioned element (fixed/absolute) has `align: "center"` and `justify: "center"` in its layout OR directly on the node, apply:
```css
position: fixed; /* or absolute */
top: 50%;
left: 50%;
transform: translate(-50%, -50%);
z-index: {zIndex ?? 1000};
```

Ignore any `positionX`/`positionY` properties the vision LLM may hallucinate — these are not real CSS. The centering logic above is the correct implementation for the intent "center this on screen."

For non-centered positioned elements (e.g., position: absolute without centering), apply the position and z-index but don't add top/left/transform.

### 2d. Update the DesignSpec node type definition

Add the new optional properties to the TypeScript type for DesignSpec nodes:
```typescript
interface NodeSpec {
  // ... existing properties ...
  position?: "fixed" | "absolute" | "relative";
  zIndex?: number;
}
```

These are optional — the vast majority of nodes won't have them. Only nodes that need to break out of the flex flow (modals, overlays, tooltips) will use them.

## Step 3: Verify no regressions

After the style builder changes:

1. `nx run designspec-renderer:typecheck` — zero errors
2. `nx run designspec-renderer:test` — all existing tests pass

The changes must be backward compatible. Nodes that don't use the new properties must render identically to before.

## Step 4: Render verification with test cases

Create a small verification spec (or add to existing test fixtures) that exercises all three fixes:

```json
{
  "screen": "style-builder-test",
  "width": 1440,
  "nodes": {
    "root": { "parent": null, "order": 0, "type": "page", "width": 1440, "layout": { "dir": "column", "gap": 24, "px": 48, "py": 32 }, "background": "background-primary" },

    "circle-test": { "parent": "root", "order": 0, "type": "container", "width": 100, "height": 100, "radius": 50, "background": "cta-primary", "layout": { "dir": "column", "align": "center", "justify": "center" } },
    "circle-text": { "parent": "circle-test", "order": 0, "type": "text", "content": "OK", "typography": "label", "color": "text-on-cta" },

    "row": { "parent": "root", "order": 1, "type": "container", "layout": { "dir": "row", "gap": 12 } },
    "search-constrained": { "parent": "row", "order": 0, "catalog": "search-input", "width": 200, "placeholder": "Search..." },
    "badge-constrained": { "parent": "row", "order": 1, "catalog": "badge-success", "label": "Active", "width": 80 },
    "button-fill": { "parent": "row", "order": 2, "catalog": "button-primary", "label": "Submit", "width": "fill" },

    "modal-overlay": { "parent": "root", "order": 2, "type": "container", "width": 400, "radius": 16, "background": "surface-elevated", "shadow": "lg", "position": "fixed", "zIndex": 1000, "layout": { "dir": "column", "align": "center", "justify": "center", "gap": 16, "px": 24, "py": 24 } },
    "modal-title": { "parent": "modal-overlay", "order": 0, "type": "text", "content": "Confirm Action", "typography": "heading-2", "color": "text-primary" },
    "modal-btn": { "parent": "modal-overlay", "order": 1, "catalog": "button-primary", "label": "OK" }
  }
}
```

Render this with `screenshotDesignSpec()` and verify visually:
- `circle-test`: renders as a circle (not a rectangle) with "OK" text clipped inside
- `search-constrained`: renders at exactly 200px wide, not stretched
- `badge-constrained`: renders at exactly 80px wide
- `button-fill`: stretches to fill remaining row space
- `modal-overlay`: centered on screen with z-index above other content

Take a screenshot and report what renders correctly vs what doesn't.

Then render the **Budgetly dashboard DesignSpec** (`designspec-v2.json` or the spec at `fixtures/personal-expense-tracker/.agentforge/previews/dashboard/`) and verify the three real-world examples:
- `donut-placeholder` (node in the left column): renders as a circle, not a rectangle
- `filter-search` (node in the filter bar): renders at 200px wide, not stretched to ~516px
- If `popover-overlay` has `position: fixed` and `zIndex: 1000` (from a correction run), it centers on screen above other content

Take before/after screenshots of the Budgetly dashboard for comparison.

## What NOT to do

- Do NOT add one-off fixes for specific nodeIds (like "if nodeId === popover-overlay")
- Do NOT create separate style paths for different node types — use one shared builder
- Do NOT change the DesignSpec schema semantics — width, height, radius already mean what they mean. The renderer just needs to respect them.
- Do NOT change the mechanical checker, correction pipeline, or any code outside the browser renderer

## Files likely affected

- The core style builder function (wherever node properties → CSS happens)
- Each catalog renderer (to ensure width/height override works)
- The DesignSpec node TypeScript type (add position, zIndex as optional)
- The React component that renders layout nodes (for overflow: hidden logic)