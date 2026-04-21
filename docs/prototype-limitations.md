# Prototype Limitations

Known gaps between the design canvas (Penpot) and the interactive prototype
rendered by DesignSpecRenderer + LayoutShell.

## Visual Fidelity

### Illustrations, Charts, and Graphs

**What happens:** The design canvas shows actual shapes the LLM drew in Penpot
(e.g., a donut chart with colored segments). The prototype shows a placeholder
box with alt text.

**Why:** The DesignSpec JSON uses `catalog: "illustration"` with a text
description in `overrides.alt`. The renderer has no way to reconstruct an SVG
chart from a prose description — it only knows the node is an illustration and
renders a placeholder.

**Example (PET dashboard):**

```json
"category-donut-chart": {
  "catalog": "illustration",
  "width": 180,
  "height": 180,
  "overrides": {
    "alt": "Donut chart showing spending by category: Housing 34%, Food 22%..."
  }
}
```

**What would fix it:** Add data-driven chart node types to the spec (e.g.,
`type: "donut-chart"` with structured `items` data) and a renderer component
that draws SVG from that data. This is not currently planned.

### Icons and Emoji Fallbacks

Icon nodes often render as Unicode emoji or text symbols (e.g., a gear icon
renders as `⚙`). The design canvas may show a proper icon from the design
system. The prototype uses the `content` field value directly.

### Shadows and Elevation

Shadow tokens (`sm`, `md`, `lg`) are mapped to CSS `box-shadow` values by the
renderer's token system. If the design tokens don't define shadow values, or
the mapping differs from Penpot's shadow rendering, elevation may look
different.

## Layout

### Root-Level Spacers

When the LLM designs a full page, it may insert spacer nodes (`type: "spacer"`)
between chrome and content to control vertical rhythm. In prototype mode,
LayoutShell renders chrome separately, so these spacers create empty gaps.

**Current behavior:** `stripChromeFromSpec()` automatically strips root-level
spacer nodes when building the content spec for LayoutShell. If a spacer
appears inside a content container (not at root level), it is preserved.

### Min-Height on Stripped Content

The page spec's root node has `type: "page"`, which the renderer styles with
`min-height: 100vh`. In LayoutShell mode, the content is a fragment (not a full
page), so `stripChromeFromSpec()` coerces root type to `"container"` to avoid
the content slot expanding to full viewport height.

## Navigation

### Chrome Tab Node ID Mismatch

The Chrome Pass and per-page design are separate LLM calls that may produce
different node IDs for the same conceptual component (e.g., chrome uses
`nav-tab-dashboard`, page uses `home-tab`). This affects:

- **Navigation bindings:** Extracted from page specs using page node IDs. Chrome
  renders its own node IDs. The renderer resolves this via
  `findPageChromeRootIds()` (compact/pattern matching) and inline `navigateTo`
  properties on chrome nodes.

- **Active tab state:** `applyChromeActiveForPage()` sets `active: true` on
  chrome tab nodes based on their `navigateTo` value matching the current page
  ID. If `navigateTo` is missing, active state won't update.

**Current behavior:** `propagateNavigateToChromeTabs()` matches chrome tab text
content to page names and sets `navigateTo` deterministically after Stage 3.
This ensures navigation and active-tab state work even when the Chrome Pass LLM
omits `navigateTo`.

## Interactivity

### No Form State

Form inputs (text fields, dropdowns, checkboxes) render visually but have no
state management. Typing into a text field or selecting a dropdown option does
not persist or trigger validation.

### No Transitions or Animations

Page navigation is instant (swap content). There are no slide, fade, or
transition animations between screens, even if the design spec implies them
through screen types (drawer, sheet).

### Overlay Screens

Modal, drawer, and sheet screen types render as HTML `<dialog>` overlays.
Escape closes them. There is no backdrop click-to-close or swipe-to-dismiss
for drawers/sheets.
