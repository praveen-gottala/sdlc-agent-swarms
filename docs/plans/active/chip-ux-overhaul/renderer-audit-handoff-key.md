# Renderer Visual Audit — Answer Key

## Turn 2 — Answers

1. **`DesignSpecRenderer.tsx`** at `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx`. The **`renderCatalog()`** function (line ~708) maps catalog types to React elements via a switch statement.
   - `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx` → `renderCatalog()`

2. Any 5 of: **`input-text`**, **`input-currency`**, **`search-input`**, **`chip`**, **`section`**, **`page-header`**, **`footer`**, **`sidebar`**, **`button-primary`**, **`button-secondary`**, **`button-ghost`**, **`badge`**, **`date-picker`**, **`text-area`**, **`icon`**, **`tabs`**, **`data-table`**, **`modal`**, **`loading-spinner`**, **`skeleton`**, **`breadcrumb`**, **`alert`**, **`empty-state`**, **`form`**, **`checkbox`**, **`radio`**, **`switch`**, **`select`**, **`step-indicator`**, **`pagination`**.
   - `DesignSpecRenderer.tsx` → switch statement in `renderCatalog()`

3. Section renders **`<section>`** with **`<h2>`** for the label/title. `titleText = node.label ?? node.overrides?.title`. If titleText is truthy, it renders `<h2>{titleText}</h2>` above children. **Known issue**: `label="$"` renders "$" as a heading instead of inline currency prefix.
   - `DesignSpecRenderer.tsx` → `renderSection()` (line ~1770)

4. **`input-text`**: flex column with `<label>`, `<Input>`, helper text. **No prefix/suffix support.** **`input-currency`**: same structure but **hardcodes a "$" prefix** as an absolutely-positioned span. The `$` is not data-driven — always shows dollar sign.
   - `DesignSpecRenderer.tsx` → lines ~1151-1204

5. **`normalizeCatalogIdToKebab()`** in `catalog/catalog-id.ts` converts PascalCase/camelCase to kebab-case (e.g., `InputText` → `input-text`). **Fuzzy matching**: if exact match fails, strips trailing segments (`data-table-compact-striped` → `data-table` → `data`). Resolution via **`resolveNode()`** in `catalog/resolver.ts`.
   - `packages/designspec-renderer/src/catalog/catalog-id.ts` + `resolver.ts`

6. Five categories from **`SAFE_OVERRIDE_KEYS`** / `getOverrideStyles()`: (1) **sizing** (maxWidth, minWidth, height), (2) **spacing** (padding, margin*, gap), (3) **borders** (border, borderRadius), (4) **flexbox** (display, alignItems, justifyContent, flexDirection), (5) **typography** (fontSize, fontFamily, fontWeight).
   - `DesignSpecRenderer.tsx` → `getOverrideStyles()` (line ~171)

7. **`resolveTokenColor()`** looks up color token names (e.g., `surface-primary`) in the project's design tokens. Chain: `overrides.background` → if it looks like a token name (not raw CSS), resolve via token map → fallback to raw value. `looksLikeCssPaintValue()` filters non-CSS strings.
   - `DesignSpecRenderer.tsx` → `resolveTokenColor()`

8. When a catalog type has **no renderer**, it **falls back to container** rendering (plain div with children). The log shows `No renderer for catalog "X" — falling back to container`. The rule says: **add the renderer + catalog entry + register** before re-running. Container fallback produces a blank box with no anatomy.
   - `docs/lessons-learned-rules.md` → "Missing Catalog Renderers Must Be Added, Not Just Logged"

9. **NO.** Adding `border` to NodeSpec violates **ADR-035** (catalog-first component model). Use **`overrides: { border: '1px solid ...' }`** instead. `SAFE_OVERRIDE_KEYS` already includes `border`, `borderTop`, etc. No renderer code changes needed for border support.
   - `docs/lessons-learned-rules.md` → "DesignSpec v2: Separate WHAT from HOW" + ADR-035

10. Design specs live at **`fixtures/personal-expense-tracker/agentforge/designs/<pageId>.json`**. The PET fixture has **5 pages**: dashboard, add-expense, spending-insights, settings, confirm-delete. (Cleaned from 63 pages in Phase 4.2 session — removed dedup-probe artifacts.)
    - `fixtures/personal-expense-tracker/agentforge/spec/pages.yaml`

11. **`/verify-design-render`** — "Verify that all DesignSpec JSON properties render correctly in the browser. Property-by-property gap analysis between spec and renderer."
    - `CLAUDE.md` → Skills Library

12. Compare against **both**: the design spec JSON (to verify the renderer matches the spec) AND the browser screenshot (to verify visual quality). The spec tells you what SHOULD render; the screenshot tells you what DID render. A renderer bug = spec says X, browser shows Y. A spec quality issue = spec says X, browser shows X, but X looks wrong.
    - `docs/lessons-learned-rules.md` → "Verify Renderer Output Against Real Working Scripts"
