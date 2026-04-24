# Plan: Prototype Visual Gap Audit

## Context

Side-by-side comparison of the Spending Insights design canvas (rendered from `spending-insights.json`) against the prototype (rendered via LayoutShell + shared chrome) reveals significant visual fidelity gaps. These are pre-existing renderer and pipeline issues, not caused by the active-tab fix.

This plan catalogs every visual difference found. It does not propose fixes — it is a gap inventory for prioritization.

## Reference Screenshots

- **Design**: Spending Insights rendered in design canvas (`/design?page=spending-insights`)
- **Prototype**: Spending Insights rendered in prototype mode after clicking Insights tab

---

## Critical — Missing or Broken Content

### C1. Daily Spending chart bars are completely absent
- **Design**: Orange/yellow bar chart with ~30 bars, Y-axis ($0–$80), X-axis (day 1–30), average line at $41.58, tooltip on hover
- **Prototype**: Empty gray rectangle with only "Avg $94.92/day" text at the bottom
- **Root cause**: `DesignSpecRenderer` has no catalog renderer for bar charts / data visualization nodes. The chart node's children (individual bars, axis labels, gridlines) are likely `type: "container"` with no visual content
- **Impact**: The largest visual element on the page is blank
- **Files**: `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx`, catalog resolver

### C2. "14" raw text rendered under Health & Wellness category
- **Design**: Each category row has a colored horizontal progress bar
- **Prototype**: "14" appears as raw text below Health & Wellness with a horizontal line — a `progress-bar-error` catalog node rendering its raw value instead of a visual progress bar
- **Root cause**: Missing or broken `progress-bar` catalog renderer; the node's numeric value is rendered as text instead of a visual bar
- **Files**: `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx`, catalog component registry

### C3. Per-category progress bars missing entirely
- **Design**: Each of the 6 category rows has a colored horizontal progress bar (orange, purple, blue, pink, green) proportional to its percentage
- **Prototype**: No progress bars at all — just the category name, percentage, and dollar amount
- **Root cause**: Same as C2 — the `progress-bar` catalog type is not rendering its visual element
- **Files**: catalog resolver, `DesignSpecRenderer.tsx`

### C4. Month-over-Month comparison card not visible in prototype
- **Design**: Card with two vertical bar charts (gray "Last Month" $1,389.50, orange "This Month" $1,247.50), green banner "You spent $142 less this month"
- **Prototype**: Not visible (may be below the fold, or may not be present in the prototype page spec)
- **Action**: Scroll prototype to bottom to verify; if the section exists in the spec but isn't rendering, it's a renderer gap

### C5. Export CSV button not visible in prototype
- **Design**: "Export CSV" button right-aligned at the very bottom
- **Prototype**: Not visible (same as C4 — may be below fold or missing from spec)

---

## Major — Layout and Structure Differences

### M1. Page layout: single centered column vs full-width two-column
- **Design**: All content cards stacked in a single centered 680px column with 16px gaps
- **Prototype**: Top Categories and Biggest Expenses render side-by-side in a two-column layout, each taking roughly half the viewport width
- **Root cause**: LayoutShell's content stripping changes the root container's layout context. The design spec uses a `card-stack` container with `width: 680` that constrains children. In the prototype, the content root may not preserve this constraint
- **Impact**: Fundamentally different visual structure — the prototype feels like a different page
- **Files**: `packages/designspec-renderer/src/renderer/browser/app/src/LayoutShell.tsx`, `spec-split.ts` → `stripChromeFromSpec()`

### M2. Period Summary: missing card container and dividers
- **Design**: Three stats inside a rounded card with subtle vertical dividers between each stat cell, centered text, colored trend indicators
- **Prototype**: Three stats rendered without a visible card background, no dividers, left-aligned instead of centered
- **Root cause**: The `Card` catalog wrapper may not render its border/shadow/radius in the prototype context, or the period-summary-card node may be losing its styling during chrome stripping
- **Files**: `DesignSpecRenderer.tsx` card rendering, `spec-split.ts`

### M3. Biggest Expenses: card-style items vs simple rows
- **Design**: Simple rows with orange numbered circles (#1–5), name, "Category · Date" subtitle, right-aligned dollar amount
- **Prototype**: Each item is a full-width card with a dark background, larger text, category badge chips instead of plain text, no numbered circles
- **Root cause**: Different node structure between the per-page design spec and the prototype's page spec (the prototype renders from the fixture's spec, which may have been designed differently)

### M4. Biggest Expenses: 5 items in design, 4 in prototype
- **Design**: 5 ranked items (Rent Payment, Annual Insurance, Grocery Run, New Headphones, Electric Bill)
- **Prototype**: 4 items (Whole Foods Market, Monthly Rent, Uber, Equinox Gym)
- **Root cause**: Different fixture data — the prototype page spec has different content than the design-canvas spec

### M5. Top Categories: 6 categories in design, 5 in prototype
- **Design**: Food & Dining, Shopping, Transport, Bills, Entertainment, Health
- **Prototype**: Food & Dining, Transport, Housing, Health & Wellness, Other
- **Root cause**: Different fixture data

### M6. Daily Spending chart card: no card container in prototype
- **Design**: Chart is inside a rounded card with background
- **Prototype**: "Daily Spending" title and Bar/Line toggle float without a visible card container; the empty chart area has a different background shade

---

## Moderate — Visual Polish Differences

### P1. Tab active indicator styling
- **Design**: Active "Insights" tab has orange text with underline
- **Prototype**: Active "Insights" tab has a rounded border/box highlight
- **Impact**: Both indicate active state (the fix works), but the visual treatment differs
- **Root cause**: The renderer's `applyChromeActiveForPage()` applies `active: true` which the renderer styles differently than the design spec's static active styling

### P2. Period Summary stat alignment
- **Design**: Stats are centered within their cells
- **Prototype**: Stats appear left-aligned within each third of the container

### P3. Period Summary trend indicators
- **Design**: Colored trend text: green "↓ 12% vs last month", red "↑ 5% vs last month"
- **Prototype**: Green trend text for all: "↗ +12.4% vs last month", "↗ +8.1% vs last month"
- **Root cause**: Different data values in the fixture; also design uses down-arrow for decrease (green = good) while prototype uses up-arrow

### P4. Bar/Line toggle button styling
- **Design**: Pill-shaped toggle, "Bar" filled with blue/teal, "Line" plain
- **Prototype**: "Bar" has orange filled background, "Line" is plain text
- **Root cause**: Different color token or override applied to the toggle component

### P5. Stacked category bar proportions
- **Design**: Proportions match the 6 categories with their percentages
- **Prototype**: Proportions match the 5 different categories — visually correct for the data, but different from the design

---

## Prototype Stability Issue

### S1. Prototype iframe blank on re-entry (intermittent)
- **Symptom**: After exiting and re-entering prototype mode multiple times, the iframe occasionally shows a completely blank/dark screen with no content
- **Expected**: `bridgeRef.current = null` fix in `handleExitPrototype` should prevent stale bridge data. E2E tests for re-entry pass consistently
- **Observed**: Manual testing sometimes hits a blank iframe, correlated with `renderer status: ready, pid: null` (orphan Vite process from a previous session)
- **Root cause hypothesis**: The orphan Vite renderer may become unresponsive after many iframe load/unload cycles, even though its port remains open. The health check passes (TCP responds) but the iframe's `postMessage` bridge never initializes
- **Files**: `packages/dashboard/src/app/api/_lib/renderer-manager.ts`, `packages/dashboard/src/app/(dashboard)/design/page.tsx`

---

## Summary Table

| ID | Severity | Issue | Category |
|----|----------|-------|----------|
| C1 | Critical | Daily Spending chart bars missing | Renderer gap |
| C2 | Critical | "14" raw text instead of progress bar | Catalog renderer missing |
| C3 | Critical | Per-category progress bars missing | Catalog renderer missing |
| C4 | Critical | Month-over-Month card not visible | Needs verification |
| C5 | Critical | Export CSV button not visible | Needs verification |
| M1 | Major | Single column → two-column layout | LayoutShell/stripping |
| M2 | Major | Period Summary card/dividers missing | Card rendering in prototype |
| M3 | Major | Biggest Expenses card vs row style | Spec data difference |
| M4 | Major | 5 → 4 items in Biggest Expenses | Fixture data |
| M5 | Major | 6 → 5 categories in Top Categories | Fixture data |
| M6 | Major | Daily Spending card container missing | Card rendering |
| P1 | Moderate | Tab active indicator style differs | Active state styling |
| P2 | Moderate | Stat alignment (centered → left) | Layout/styling |
| P3 | Moderate | Trend indicator direction/color | Data difference |
| P4 | Moderate | Bar/Line toggle color | Token/override |
| P5 | Moderate | Stacked bar proportions | Data difference |
| S1 | Major | Blank iframe on re-entry (intermittent) | Renderer lifecycle |

## Prioritization Recommendation

**Fix first (biggest visual impact):**
1. C1 — Chart rendering (largest empty area on the page)
2. C2/C3 — Progress bar catalog renderer (multiple broken elements)
3. M1 — Layout column constraint (structural correctness)

**Investigate next:**
4. C4/C5 — Verify if Month-over-Month and Export CSV exist in prototype spec
5. M2/M6 — Card container rendering in prototype context
6. S1 — Renderer stability on repeated entry/exit

**Lower priority (data/polish):**
7. M3–M5 — Fixture data differences (not renderer bugs)
8. P1–P5 — Visual polish differences
