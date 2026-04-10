# Design Review Session Handoff

> **Purpose:** Capture full context for systematic browser-based design review across all projects.
> Point the next session at this document so it has all required knowledge.
>
> **Last updated:** April 1, 2026

---

## What We're Doing

Systematically reviewing every rendered design page in the dashboard to find and fix rendering issues. The process uncovered deep bugs in the renderer's override pipeline that affected ALL designs — these are now fixed. Remaining pages need visual verification.

## The Review Process (Per Page)

1. **Navigate** to `http://localhost:3000/design?page=<page-id>` via Playwright MCP
2. **Wait** 12-15s for the renderer iframe to load (Vite dev server on port 4100)
3. **Screenshot** the page at 83% and 100% zoom
4. **Inspect DOM** via `browser_evaluate` on iframe refs (cross-origin blocks `contentDocument`, must use Playwright frame locators: `page.locator('[data-testid="design-iframe"]').contentFrame()`)
5. **Check override application**: Query `[data-node]` elements for `style` attribute presence, verify key CSS properties (`border`, `padding`, `position`, `font-family`, etc.)
6. **Compare to JSON**: Read the design JSON and verify that `overrides` values appear in the rendered DOM
7. **Fix** any issues found in the renderer code, rebuild/reload, re-verify

## Dashboard Setup

```bash
# Terminal: start dashboard (Next.js dev server on port 3000)
lsof -ti:3000 | xargs kill -9 && npx nx run dashboard:start

# The dashboard auto-starts the Vite renderer on port 4100
# If renderer is stale, kill port 4100 and let dashboard restart it:
lsof -ti:4100 | xargs kill -9
```

Switch projects via the sidebar project selector (bottom-left).

---

## Bugs Found and Fixed (This Session)

### 1. SAFE_OVERRIDE_KEYS Too Restrictive (Critical)

**File:** `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx`

**Problem:** `SAFE_OVERRIDE_KEYS` whitelist only had 5 CSS properties (`maxWidth`, `minWidth`, `maxHeight`, `minHeight`, `marginInline`). LLM designs use 30+ override properties — all silently dropped.

**Fix:** Expanded to include: sizing, spacing (`padding`, `margin_top/bottom/left/right`), borders (`border`, `border_top/bottom/left/right`, `border_radius`), positioning (`position`, `top/left/right/bottom`, `z_index`), flex item (`flex_basis/shrink/grow`), overflow/visibility (`overflow`, `pointer_events`, `cursor`, `opacity`), typography (`font_size`, `font_family`), inline layout (`display`, `align_items`, `justify_content`).

Also added `getOverrideStyles(node.overrides)` to `getCommonNodeStyles()` so ALL catalog components (not just containers) get their overrides applied.

### 2. Catalog Resolver Drops Data for Unresolved Nodes (Critical)

**File:** `packages/designspec-renderer/src/catalog/resolver.ts`

**Problem:** When a catalog entry wasn't found, `resolveNode()` returned a stripped object — `overrides`, `layout`, `width`, `height`, `background`, `shadow` were ALL dropped. This combined with a PascalCase/kebab-case mismatch (`"NavigationBar"` not finding `"navigation-bar"`) caused many catalog components to lose ALL styling.

**Fix:**
- Added PascalCase → kebab-case normalization in catalog lookup
- Both unresolved branches now preserve `overrides`, `layout`, `width`, `height`, `background`, `shadow`, `radius`, `label`, `content`, `items`
- Fuzzy match also uses kebab-case for progressive segment stripping

### 3. Fallback Rendering Path Was Bare

**File:** `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx`

**Problem:** The `renderNode` unresolved-node fallback only applied `getPositionStyles()` — no layout, no overrides, no background, no size.

**Fix:** Fallback now applies `getLayoutStyles`, `getSizeStyles`, `getPositionStyles`, `getOverrideStyles`, and `resolveTokenColor` for background.

### 4. Stale Pipeline Indicator (Previous Session, Referenced)

**File:** `packages/dashboard/src/app/api/_lib/run-manager.ts`

**Fix:** Added `STALE_RUN_TIMEOUT_MS` (30 minutes). `getActiveRun()` auto-marks `pending`/`running` runs as `failed` if older than threshold.

### 5. Button Padding Missing (Previous Session, Referenced)

**File:** `packages/designspec-renderer/src/renderer/browser/app/src/components/ui/button.tsx`

**Fix:** Added `sizeClasses` (`default`, `sm`, `lg`, `icon`) with proper `h-*`, `px-*`, `py-*` utility classes. Renderer reads `node.overrides.size` and passes to Button component.

---

## Projects and Pages — Review Status

### personal-expense-tracker (COMPLETED)

| Page | File | Status | Notes |
|------|------|--------|-------|
| Dashboard | `dashboard.json` | Verified | Correct flex layout, proper button padding. No grid overrides. |
| Add Expense | `add-expense.json` | Fixed | Was overlapping. Fixed by override pipeline fix — borders, padding, font overrides now apply. |
| Spending Insights | `spending-insights.json` | Fixed | `position: sticky` on topbar, `padding: 24px` on cards, `flex-basis` on stacked bars, `overflow: hidden` on chart elements — all now working. |

### quickmarks2 (PARTIALLY REVIEWED)

| Page | File | Status | Notes |
|------|------|--------|-------|
| Home | `page-home.json` | Previously reviewed | Was the original page that triggered the grid layout investigation. Uses `layout.display: "grid"`, `layout.columns: 3`. |

### bookmarksapp (NOT REVIEWED)

| Page | File | Status | Notes |
|------|------|--------|-------|
| Home | `page-home.json` | Pending | |
| Add/Edit | `page-add-edit.json` | Pending | |

### claim-filling (NOT REVIEWED)

| Page | File | Status | Notes |
|------|------|--------|-------|
| Claims List | `claims-list.json` | Pending | |

---

## Key Files to Know

| File | Role |
|------|------|
| `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx` | **Browser renderer** — converts DesignSpec JSON → React/CSS. Contains `SAFE_OVERRIDE_KEYS`, `getOverrideStyles()`, `getLayoutStyles()`, `getCommonNodeStyles()`, `renderCatalog()`, `renderAccelerator()` |
| `packages/designspec-renderer/src/catalog/resolver.ts` | **Catalog resolver** — merges NodeSpec + catalog entry → ResolvedNode. PascalCase→kebab normalization lives here |
| `packages/designspec-renderer/src/types/design-spec-v2.ts` | **TypeScript interfaces** — `LayoutSpec`, `NodeSpec`, `DesignSpecV2` |
| `packages/designspec-renderer/src/sdk/submit-design-tool.ts` | **LLM tool schema** — JSON schema for `submit_design` tool the LLM uses to generate designs |
| `packages/agents-ux/src/ux-design/browser-correction-adapter.ts` | **Correction adapter** — sanitizes LLM correction patches. `ALIAS_MAP`, `VALID_LAYOUT_KEYS`, `sanitizePatches()` |
| `packages/agents-ux/src/prompts/ux-penpot-designspec-v2.md` | **V2 design prompt** — teaches LLM about DesignSpec format |
| `packages/dashboard/src/app/api/pages/[pageId]/design/route.ts` | **Quick generate route** — dashboard's quick design generation endpoint |
| `packages/dashboard/src/app/api/_lib/renderer-manager.ts` | **Renderer lifecycle** — starts/monitors/restarts Vite dev server on port 4100 |
| `packages/dashboard/src/app/api/_lib/run-manager.ts` | **Pipeline run tracking** — manages run status files, stale detection |
| `packages/designspec-renderer/src/renderer/browser/app/src/components/ui/button.tsx` | **Button component** — shadcn-style button with `sizeClasses` |
| `docs/lessons-learned.md` | **Session knowledge** — all technical findings, including the override resolution bug details |

## How the Override Pipeline Works (Post-Fix)

```
Design JSON node
  ↓
resolveNode() [resolver.ts]
  - PascalCase → kebab lookup in catalog
  - Merges: catalog defaults ← node overrides
  - ALWAYS preserves node.overrides (even if catalog not found)
  ↓
ResolvedNode (with overrides intact)
  ↓
renderCatalog() or renderAccelerator() [DesignSpecRenderer.tsx]
  ↓
getCommonNodeStyles(node, tokens) — applied to ALL nodes
  - getSpacingStyles(layout)       → padding from px/py/pt/pb
  - getSizeStyles(width, height)   → flex:1 for "fill", pixel sizing
  - getShadowStyle(shadow, tokens) → box-shadow
  - getPositionStyles(node)        → position/top/left/z-index from overrides
  - getOverrideStyles(overrides)   → SAFE_OVERRIDE_KEYS whitelist → CSS
  ↓
React style prop on <div>/<Button>/<Badge>/etc.
```

## Common Gotchas

1. **Vite HMR in iframe**: The renderer runs as a Vite dev server in an iframe. Source changes ARE picked up via HMR, but sometimes a full page reload is needed. If changes don't appear, kill port 4100 and reload the dashboard page.

2. **Cross-origin iframe**: Cannot access `iframe.contentDocument` from the main page. Use Playwright MCP's frame-aware refs (e.g., `f31e7`) to evaluate JS inside the iframe.

3. **Token references in overrides**: Some border values use token names (e.g., `"1px solid border-default"`) instead of raw hex. The `getOverrideStyles` function passes these through as-is. The CSS may not resolve the token name — this is a known limitation that doesn't affect hex-valued borders (`"1px solid #334155"`).

4. **`.issues.json` files**: Some designs have a companion `.issues.json` with correction history. These don't affect rendering but show the correction loop's evaluation results.

5. **Project switching**: Click the project selector in the dashboard sidebar (bottom-left). The page list updates automatically.

6. **Renderer vs dashboard UI**: Tabs like **Properties / AI Edits / Chat** are **dashboard chrome**, not part of the design JSON. Only elements inside the design iframe (`[data-testid="design-iframe"]`) are produced by `DesignSpecRenderer`. Do not confuse them when triaging “missing text” bugs.

---

## Catching regressions next time

Minor renderer bugs (PascalCase catalog IDs, token strings in `overrides` as invalid CSS, stale Vite bundle) are easy to miss in code review. Use this layered approach:

| Layer | What | Why |
|-------|------|-----|
| **Unit tests** | `normalizeCatalogIdToKebab()` in `packages/designspec-renderer/src/catalog/catalog-id.ts` — resolver and renderer both import it so switch cases and catalog lookup cannot drift. | Catches the “`Button` vs `button`” class of bugs without a browser. |
| **Unit tests** | Extend `render.test.ts` / token tests when adding new override behavior (e.g. `looksLikeCssColor` filtering). | Prevents token names like `cta-primary` from being passed as raw CSS again. |
| **After renderer changes** | Hard-refresh the design page (`Cmd+Shift+R`). If the iframe looks wrong, `lsof -ti:4100 \| xargs kill -9` and reload so Vite serves a fresh bundle. | HMR and browser cache can show an older bundle than Playwright’s clean session. |
| **Visual smoke** | For any change to `DesignSpecRenderer.tsx`, spot-check one page with PascalCase catalogs (e.g. Spending Insights: `Button`, `Chip`, `NavigationBar`) at **100% zoom** in the iframe and confirm labels and chip backgrounds match the JSON. | Catches empty chip text / wrong variant path before merge. |
| **Optional (later)** | Playwright screenshot baseline or DOM assertions on fixture pages (`data-node="toggle-chip-bar"` has non-empty `textContent`, `backgroundColor` not fully transparent when spec says `cta-primary`). | Automates the manual smoke step. |

**PR checklist (renderer PRs):** `nx test designspec-renderer`, `npx tsc --noEmit -p packages/designspec-renderer/tsconfig.json`, and at least one manual iframe verification step above.

---

## Test Commands

```bash
# Typecheck all packages (should pass clean)
npx nx run-many -t typecheck

# Run all tests (2 Playwright-dependent tests in designspec-renderer will fail — pre-existing env issue)
npx nx run-many -t test

# Run specific resolver tests
npx nx test designspec-renderer -- --testPathPattern="resolver"

# Run correction adapter tests
npx nx test agents-ux -- --testPathPattern="browser-correction"
```

## What's Next

Continue the systematic review for:
1. **bookmarksapp** — `page-home.json` and `page-add-edit.json`
2. **claim-filling** — `claims-list.json`
3. **quickmarks2** — re-verify `page-home.json` with the latest override fixes

The override pipeline fixes are global — they improve ALL pages. But each page may have unique rendering quirks (missing catalog entries, incorrect layout structure, etc.) that need individual attention.
