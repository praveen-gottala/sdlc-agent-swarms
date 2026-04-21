# Plan: Fix Active Tab Bug + Comprehensive Prototype E2E Tests

## Context

The prototype has a critical active-tab bug: `applyChromeActiveForPage()` uses regex `/-tab$/i` to detect tab nodes, but chrome node IDs (`nav-tab-dashboard`, `nav-tab-insights`, `nav-tab-add`) don't end with `-tab` — they end with `-dashboard`, `-insights`, `-add`. So active state is NEVER computed, and the Dashboard tab always shows its static underline regardless of current page.

Existing E2E tests don't catch this because they test navigation (screen marker changes) but never verify active tab styling.

Additionally, the Spending Insights page shows a "14" raw value from a `progress-bar-error` catalog node — a known renderer fidelity gap documented in `docs/prototype-limitations.md`.

## Prior Work (Same Session)

The following changes were already implemented in this session and should NOT be re-done:

1. **Chrome region assignment** — Removed regex `positionFor()`, added `deriveRegionsFromPageSpec()` in `merge-frozen-chrome.ts`
2. **Spacer gap fix** — `stripChromeFromSpec()` strips empty root-level spacers, coerces mislabeled spacers (with children) to `container` type, coerces root `page` → `container`
3. **Chrome ID mismatch** — `PrototypeApp.tsx` uses `findPageChromeRootIds()` for proper ID resolution
4. **Prototype re-entry crash** — `handleExitPrototype` clears `bridgeRef.current = null`
5. **Navigation propagation** — `propagateNavigateToChromeTabs()` adds `navigateTo` to chrome tab nodes
6. **PET fixture** — `shared-chrome.json` updated with correct regions and `navigateTo`

## Part 1: Fix Active Tab Detection

### File: `packages/designspec-renderer/src/renderer/browser/spec-split.ts` (line 207-208)

**Current (broken):**
```typescript
const isTab =
  next.catalog === 'tab' || (!!next.navigateTo && /-tab$/i.test(id));
```
No chrome node ID ends with `-tab`, so `isTab` is always false → `active` never set.

**Fix — detect by `navigateTo` presence:**
```typescript
const isTab = next.catalog === 'tab' || !!next.navigateTo;
```

**Why this is safe:** `applyChromeActiveForPage` runs on the **chrome spec only** (shared-chrome.json), where the only nodes with `navigateTo` ARE the tab nodes. Page-spec nodes with `navigateTo` (like `ranked-row-1`) are never passed to this function. Setting `active` on a non-tab node is also harmless — the renderer ignores `active` on container/text nodes.

### Unit test update
`packages/designspec-renderer/src/renderer/browser/spec-split.test.ts` — update `applyChromeActiveForPage` tests (if they exist) to use node IDs that match the real chrome pattern (`nav-tab-dashboard`, not `foo-tab`).

## Part 2: Comprehensive Prototype E2E Tests

### File: `e2e/prototype-chrome-regions.spec.ts` — rewrite with robust coverage

### A. Active Tab State (catches the tab detection bug)

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | Dashboard tab is visually active on load | Tab text has bold weight (≥600) or colored bottom border |
| 2 | Insights tab becomes active after navigation | Click Insights nav → Insights tab gets bold/border, Dashboard loses it |
| 3 | Active indicator round-trips correctly | Dashboard→Insights→Dashboard: Dashboard tab re-activates |

**How to assert active state:** Check computed `fontWeight` ≥ 600 or `borderBottomColor` is not transparent on the tab container node.

### B. Every Page Renders Content (catches blank pages, mislabeled spacers)

| # | Test | What it verifies |
|---|------|-----------------|
| 4 | Dashboard has budget and expense content | Text "$2,847" and "Recent Expenses" visible |
| 5 | Spending Insights has stats and categories | Text "Total Spent" and "Top Categories" visible |
| 6 | Add Expense has form content | Form-related text visible (amount, category) |
| 7 | Generic: every page has ≥5 content nodes | Navigate to each page, count `[data-node]` inside content slot |

### C. Content Layout Integrity (catches spacer gaps, min-height issues)

| # | Test | What it verifies |
|---|------|-----------------|
| 8 | No empty spacer nodes in content | `[data-node*="spacer"]` with zero children count = 0 in content |
| 9 | No large gap between header and content | Header bottom edge within 50px of first content child |
| 10 | Content root not styled as page | Content root `min-height` is NOT `100vh` |

### D. Navigation Completeness (catches broken hotspots, ID mismatches)

| # | Test | What it verifies |
|---|------|-----------------|
| 11 | All 3 nav tabs have click hotspots | Exactly 3 `[data-nav-target]` in header |
| 12 | Full navigation cycle works | Dashboard→Insights→AddExpense→Dashboard, verify screen marker each step |
| 13 | Chrome mountId unchanged through cycle | `data-mount-id` same after 3 navigations |

### E. Design Fidelity (catches rendering gaps)

| # | Test | What it verifies |
|---|------|-----------------|
| 14 | Brand name visible in header | "Budgetly" text in header region |
| 15 | Month selector shows period | "June 2025" text in header |
| 16 | No footer when all chrome in header | `[data-persistent="footer"]` count = 0 |

### F. Prototype Lifecycle (catches re-entry crash)

| # | Test | What it verifies |
|---|------|-----------------|
| 17 | Prototype renders after exit and re-entry | Exit → re-enter → header visible within 15s |
| 18 | Content renders after re-entry | Content slot has ≥1 screen marker after re-entry |

## Part 3: Spec-Level Contract Tests (no browser needed)

| # | Test | What it verifies |
|---|------|-----------------|
| 19 | shared-chrome.json: nav-tabs in header region | Regions include nav-tabs ID in header, not footer |
| 20 | shared-chrome.json: tab nodes have navigateTo | Each tab child under nav-tabs has navigateTo set |

## Files to Modify

1. `packages/designspec-renderer/src/renderer/browser/spec-split.ts:207-208` — fix `isTab` regex
2. `packages/designspec-renderer/src/renderer/browser/spec-split.test.ts` — update unit test for active tab detection
3. `e2e/prototype-chrome-regions.spec.ts` — rewrite with 20 tests above

## Context for Implementers

- **Chrome Pass and page design LLMs produce different node IDs for the same component.** `topbar` vs `top-bar`, `nav-tab-dashboard` vs `home-tab`. Always use `findPageChromeRootIds()` for cross-spec ID resolution, never direct ID equality.
- **LLMs mislabel content containers as `type: "spacer"`.** PET Spending Insights has 162 nodes inside a "spacer". `stripChromeFromSpec()` only strips spacers with zero children; non-empty spacers are coerced to `container`.
- **`applyChromeActiveForPage()` only runs on the chrome spec** (shared-chrome.json), not page specs. All `navigateTo` nodes in the chrome spec are tabs — the broader detection is safe.
- **Bridge lifecycle on exit/re-entry:** `bridgeRef.current` must be nulled on exit. The re-entry useEffect polls for `bridgeRef.current?.isReady` — if the stale bridge reports ready, data goes to the destroyed iframe.
- **Spending Insights is the stress-test page.** It catches mislabeled spacers, blank content, and rendering issues that Dashboard doesn't surface.

## Verification

1. `nx run designspec-renderer:typecheck` + `nx run designspec-renderer:test` — all pass
2. `npx playwright test e2e/prototype-chrome-regions.spec.ts` — all 20 tests pass
3. Browser: prototype → navigate to Insights → verify "Insights" tab is underlined, not "Dashboard"
4. Browser: exit prototype → re-enter → verify content renders (not blank)
