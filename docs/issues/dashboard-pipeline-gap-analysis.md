# Dashboard Pipeline Gap Analysis: pg/dashboard-plugin vs main

**Created:** 2026-04-02
**Status:** Partially Resolved
**Note:** Renderer fix items (Issues 4.1-4.4, 4.7) are resolved and documented in
`docs/lessons-learned.md`. Remaining content: pipeline quality analysis, JSON comparison,
and prompt improvement recommendations.
**Goal:** Identify why the claim-filling dashboard rendered on `pg/dashboard-plugin` (Screenshot A — sparse, broken charts) looks significantly worse than the design generated from `main` branch code (Screenshot B — rich, colorful, data-complete).

---

## Executive Summary

After comparing the main-branch JSON (`apps/claim-filling/.agentforge/previews/dashboard/scripts/designspec-v2.json`, 2,464 lines) against the dashboard-plugin JSON (`apps/claim-filling/agentforge/designs/dashboard.json`, 2,105 lines), the root cause is a **two-sided convention mismatch**: the design prompt changed to produce CSS-native patterns, but the renderer was built for the older, simpler patterns.

The main branch JSON uses **renderer-friendly primitives** (semantic token names on top-level `background`, fixed pixel widths, plain `type: "container"` for cards, `label` for avatar text, `type: "divider"` for separators). The dashboard-plugin JSON uses **CSS-native idioms** (hex colors in `overrides`, `flex` shorthand, `conic-gradient()`, `overrides.initials`, CSS-hyphenated property names). The renderer only understands the former.

**Both sides need fixing:** the renderer must be hardened to handle CSS-native patterns (robustness), and the prompt should prefer renderer-native conventions when equivalent (reliability).

---

## Phase-by-Phase Analysis

### Phase 1: Research — VERDICT: No Issues

**File:** `apps/claim-filling/agentforge/designs/dashboard/research.json`
**Changes from main:** This file didn't exist on main (the entire design pipeline output is new on this branch).

**Quality Assessment:** The research brief is thorough and production-grade:
- Correct persona targeting (Claims Manager primary)
- Complete information architecture with 4-level hierarchy
- Detailed 12-column grid layout recommendation
- Full component specifications for all 5 sections (KPI cards, bar chart, donut, activity feed, workload table)
- Comprehensive accessibility requirements (WCAG AA)
- Edge cases documented (zero states, error handling)
- Microcopy and tone guidance included

**Action:** None required.

---

### Phase 2: Planning — VERDICT: No Issues

**File:** `apps/claim-filling/agentforge/designs/dashboard/planning.json`
**Changes from main:** Didn't exist on main.

**Quality Assessment:** The planning spec is equally thorough:
- Full component tree with proper nesting hierarchy
- Precise 12-column grid with column span assignments (3+3+3+3, 8+4, 5+7)
- Complete token bindings (colors, typography, spacing, elevation, motion, borders, z-index)
- Responsive breakpoints defined
- Loading/skeleton state specifications
- Accessibility semantic structure and ARIA roles
- Component state matrix (default/hover/focus/active/loading/error/empty)

**Action:** None required.

---

### Phase 3: Design (JSON Generation) — VERDICT: MAJOR Convention Mismatch (Upgraded from Minor)

**Files compared:**
- Main branch: `apps/claim-filling/.agentforge/previews/dashboard/scripts/designspec-v2.json` (2,464 lines)
- Dashboard-plugin: `apps/claim-filling/agentforge/designs/dashboard.json` (2,105 lines)
- Prompt changed: `ux-penpot-designspec-v2.md` (added grid layout docs)

Comparing the two JSONs side-by-side reveals that **the design phase is generating structurally different patterns**, not just using different naming conventions. The main branch JSON was generated with conventions the renderer understands; the dashboard-plugin JSON uses idioms the renderer silently drops.

#### Issue 3.0 (NEW — CRITICAL): Fundamentally different structural patterns

| Feature | Main Branch (works) | Dashboard-Plugin (broken) |
|---|---|---|
| **Stat cards** | `type: "container"` with `background`, `shadow`, `radius` | `catalog: "Card"` (goes through `renderCard()` which drops overrides) |
| **Bar chart** | Vertical list of individual bars, each with fixed pixel `width` and `background: "info"` (token) | Single horizontal stacked bar with `overrides: { "flex": "18 0 0", "background-color": "#3B82F6" }` |
| **Donut chart** | Two concentric circles: outer `background: "surface-secondary"`, inner `background: "surface-primary"` | `overrides: { "background": "conic-gradient(...)" }` |
| **Legend dots** | `background: "error"` (top-level, semantic token) | `overrides: { "background-color": "#DC2626" }` (override, hex, hyphenated) |
| **Avatar initials** | `label: "MR"` (top-level) | `overrides: { "initials": "MT" }` |
| **Row separators** | `type: "divider"` nodes between items | `overrides: { "border-bottom": "1px solid var(--border-default)" }` |
| **Card sizing** | Fixed pixel `width: 460` or `width: "fill"` | `overrides: { "flex": "5 0 0" }` or `overrides: { "flex": "0 0 360px" }` |
| **Catalog IDs** | kebab-case: `navigation-bar`, `badge-success`, `link` | PascalCase: `NavigationBar`, `Badge`, `Link` (normalized by resolver, but triggers different paths) |
| **Colors** | Semantic tokens: `background: "info"`, `background: "warning"` | Hex in overrides: `overrides: { "background-color": "#3B82F6" }` |
| **Trend badges** | `catalog: "badge-warning"`, `label: "↑ 12 from yesterday"` | `type: "text"`, `content: "↑ +5%"`, `color: "error"` |

**Root insight:** The main branch LLM output naturally aligns with the DesignSpec v2 "vocabulary" — it uses the node-level properties (`background`, `width`, `radius`, `label`) that the renderer knows how to process. The dashboard-plugin output pushes complex CSS into `overrides`, which is treated as a pass-through escape hatch that the renderer barely supports.

The design JSON is still well-structured overall, but its use of overrides for core visual properties is the primary failure mode.

#### Issue 3.1: Hyphenated CSS property names in overrides

The LLM generates overrides with CSS-style hyphenated keys. The renderer only handles `camelCase` or `snake_case`.

| JSON override key | Renderer expects | Where used |
|---|---|---|
| `background-color` | `backgroundColor` or `background_color` | Bar segments (×6), legend dots (×12), donut swatches (×4) |
| `border-bottom` | `borderBottom` or `border_bottom` | Activity feed item separators (×10) |
| `border-radius` | `borderRadius` or `border_radius` | Donut SVG wrapper |
| `min-height` | `minHeight` or `min_height` | Activity items, workload rows |
| `max-height` | `maxHeight` or `max_height` | Activity feed list |
| `overflow-y` | `overflowY` or `overflow_y` | Activity feed list |
| `white-space` | — (not in allowlist at all) | Timestamps |
| `flex-shrink` | `flexShrink` or `flex_shrink` | Legend/donut swatches |
| `font-size` | `fontSize` or `font_size` | Link catalog overrides |

**Impact:** ALL bar chart colors, legend dots, donut swatches, activity borders, and scroll behavior are silently dropped.

#### Issue 3.2: `flex` shorthand not in renderer allowlist

Multiple card nodes use `"flex": "2 1 0"`, `"flex": "5 0 0"`, `"flex": "0 0 360px"` but the renderer's `SAFE_OVERRIDE_KEYS` only has `flex_basis`, `flex_shrink`, `flex_grow` — not the shorthand `flex`.

**Impact:** Cards that should have proportional sizing (bar chart 2:1 vs donut, activity 5:7 vs workload) all default to equal flex, breaking the intended layout proportions.

#### Issue 3.3: `conic-gradient()` blocked by color filter

The donut chart uses:
```json
"background": "conic-gradient(#94A3B8 0% 30%, #F59E0B 30% 70%, #F97316 70% 90%, #DC2626 90% 100%)"
```
The renderer's `looksLikeCssColor()` only recognizes `#`, `rgb`, `hsl`, `transparent`, `inherit`, and `currentColor`. Gradient functions are blocked.

**Impact:** The donut chart renders as a blank circle instead of a colored conic gradient.

#### Issue 3.4: Avatar initials in `overrides` instead of `label`

Avatars use `overrides.initials` (e.g., `"initials": "MT"`) but the renderer reads `node.label` for avatar text.

**Impact:** All avatars show "?" instead of proper initials.

#### Recommendation for Phase 3

Now that we see the full picture, **both sides need work**:

- **Option A (fix renderer):** Harden the renderer to handle CSS-hyphenated keys, `flex` shorthand, gradients, and `overrides.initials`. This is essential for robustness — future LLM outputs will vary.
- **Option B (fix prompt):** Update the DesignSpec v2 prompt to prefer renderer-native conventions: use top-level `background` with semantic tokens, use `label` for avatar text, use fixed pixel widths or `width: "fill"` instead of flex overrides, use `type: "divider"` for separators. This aligns with what works today and produces cleaner JSON.
- **Option C (recommended): Both.** Fix the renderer for robustness (handles any valid CSS). Also update the prompt to prefer the simpler patterns that the main branch naturally produces, reducing reliance on overrides for core visual properties.

The prompt update is especially important because the main branch patterns are genuinely **better DesignSpec v2** — they use the schema's native vocabulary instead of tunneling CSS through overrides.

---

### Phase 4: Browser Rendering — VERDICT: Primary Source of Quality Gap

**File:** `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx` (1,188 lines)

This is where the bulk of the issues manifest. Even if the JSON were perfect, several renderer bugs would still cause visual regressions.

#### Issue 4.1: Override key normalization only handles snake_case, not hyphenated CSS

**Location:** `getOverrideStyles()` (~line 173-193)

```typescript
const normalized = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
```

This regex converts `background_color` → `backgroundColor`, but does NOT convert `background-color` → `backgroundColor`. The hyphen `-` is never matched.

**Fix:** Add hyphen normalization:
```typescript
const normalized = key
  .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
  .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
```

Also add hyphenated variants to `SAFE_OVERRIDE_KEYS`, or normalize before the lookup.

#### Issue 4.2: `flex` shorthand missing from SAFE_OVERRIDE_KEYS

**Location:** `SAFE_OVERRIDE_KEYS` set (~line 128-160)

The set contains `flex_basis`, `flex_shrink`, `flex_grow` but not `flex`. Many design nodes use the shorthand `flex: "2 1 0"` or `flex: "0 0 360px"`.

**Fix:** Add `'flex'` to `SAFE_OVERRIDE_KEYS`.

#### Issue 4.3: `looksLikeCssColor()` doesn't handle gradients

**Location:** ~line 166-171

CSS gradients (`conic-gradient()`, `linear-gradient()`, `radial-gradient()`) are valid CSS background values but are rejected by the color filter.

**Fix:** Add gradient detection:
```typescript
|| s.startsWith('conic-gradient') || s.startsWith('linear-gradient') || s.startsWith('radial-gradient')
```

#### Issue 4.4: `renderCard()` doesn't apply overrides

**Location:** ~line 779-800

`renderCard()` computes styles from spacing, size, shadow, and position but **never calls `getOverrideStyles(node.overrides)`**. Card-level overrides like `flex: "2 1 0"` are lost.

**Fix:** Add override styles to the card style computation:
```typescript
const style = {
  ...getSpacingStyles(node.layout),
  ...getSizeStyles(node.width, node.height),
  ...getShadowStyle(node.shadow, tokens),
  ...getPositionStyles(node),
  ...getOverrideStyles(node.overrides),  // ADD THIS
  backgroundColor: bg,
  borderRadius: node.radius ?? 20,
  padding: node.padding ?? node.catalogEntry?.padding ?? 24,
};
```

#### Issue 4.5: `renderAvatar()` doesn't read `overrides.initials`

**Location:** ~line 764-777

The avatar renderer extracts initials from `node.label`:
```typescript
const label = node.label ?? '';
const initials = label.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
```

But the JSON puts initials in `overrides.initials` (e.g., `"initials": "MT"`). When `label` is empty, the fallback `'?'` is shown.

**Fix:** Check `overrides.initials` first:
```typescript
const initials = (node.overrides?.initials as string)
  ?? label.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
```

#### Issue 4.6: Missing `Link` catalog handler

Activity feed items use `catalog: "Link"` for claim number links, but there's no `case 'link':` in the catalog renderer switch. These nodes likely fall through to the unresolved wrapper (a plain `<div>`) instead of rendering as `<a>` tags.

**Fix:** Add a `renderLink()` handler in the catalog switch:
```typescript
case 'link':
  return renderLink(node, tokens, tokenMap, common);
```

#### Issue 4.7: `white-space` not in SAFE_OVERRIDE_KEYS

Several timestamp nodes use `"white-space": "nowrap"` to prevent wrapping. This property is not in the allowlist.

**Fix:** Add `'white-space'`, `'whiteSpace'`, `'white_space'` to `SAFE_OVERRIDE_KEYS`.

---

## Workstream Prioritization

Ordered by visual impact (fixing fewer items yields more improvement):

### Track A: Renderer Fixes (make current JSON renderable)

| Priority | Issue | Impact | Effort |
|---|---|---|---|
| **P0** | 4.1 — Hyphen normalization in overrides | Fixes bar chart colors, legend dots, borders, scroll | Small (3 lines) |
| **P0** | 4.2 — Add `flex` to SAFE_OVERRIDE_KEYS | Fixes card proportions across entire page | Trivial (1 line) |
| **P0** | 4.4 — Add overrides to renderCard() | Fixes card flex sizing | Trivial (1 line) |
| **P1** | 4.3 — Gradient support in color filter | Fixes donut chart visualization | Small (1 line) |
| **P1** | 4.5 — Avatar reads overrides.initials | Fixes all "?" avatars to show real initials | Small (2 lines) |
| **P2** | 4.6 — Add Link catalog handler | Fixes claim links in activity feed | Medium (15 lines) |
| **P2** | 4.7 — Add white-space to SAFE_OVERRIDE_KEYS | Fixes timestamp wrapping | Trivial (1 line) |

### Track B: Prompt Fixes (prevent future mismatch)

| Priority | Issue | Impact | Effort |
|---|---|---|---|
| **P1** | 3.0 — Add "prefer top-level properties over overrides" rules to prompt | Prevents all override-based rendering failures for future pages | Medium (prompt editing) |
| **P2** | 3.0 — Document `overrides` as last-resort escape hatch | Reduces LLM reliance on overrides | Small (prompt editing) |
| **P3** | B2 — Regenerate dashboard JSON with fixed prompt | Validates prompt fixes; produces cleaner JSON | Medium (pipeline re-run) |

---

## Execution Plan

### Track A: Renderer Hardening (makes current JSON work)

#### Step A1: Fix P0 Renderer Issues (estimated: 30 min)

1. Update `getOverrideStyles()` to normalize hyphens → camelCase (Issue 4.1)
2. Add `'flex'` to `SAFE_OVERRIDE_KEYS` (Issue 4.2)
3. Add `...getOverrideStyles(node.overrides)` in `renderCard()` (Issue 4.4)
4. Rebuild and visually verify — bar chart, card proportions, and legend should immediately improve

#### Step A2: Fix P1 Renderer Issues (estimated: 20 min)

5. Extend `looksLikeCssColor()` for gradients (Issue 4.3)
6. Update `renderAvatar()` to read `overrides.initials` as fallback (Issue 4.5)
7. Rebuild and verify — donut chart and avatars should now render correctly

#### Step A3: Fix P2 Renderer Issues (estimated: 30 min)

8. Add `renderLink()` catalog handler (Issue 4.6)
9. Add `white-space` and related keys to SAFE_OVERRIDE_KEYS (Issue 4.7)
10. Rebuild and verify — activity feed links and timestamp layout should be correct

### Track B: Prompt Alignment (prevents future mismatch)

#### Step B1: Add override conventions to DesignSpec v2 prompt (estimated: 30 min)

Update `packages/agents-ux/src/prompts/ux-penpot-designspec-v2.md` with explicit rules learned from the main-branch output:

11. **Prefer top-level `background` over `overrides`** — use `background: "info"` not `overrides: { "background-color": "#3B82F6" }`. Add: *"Use the node-level `background` field with semantic color tokens for backgrounds. Do NOT put background-color in overrides."*
12. **Use `label` for avatar/link text** — not `overrides.initials`. Add: *"For avatar and link catalog nodes, put display text in `label`, not in overrides."*
13. **Prefer fixed pixel widths or `width: "fill"`** — not `flex` overrides. Add: *"Use `width: N` (pixels) or `width: "fill"` for sizing. Do not use CSS flex shorthand in overrides."*
14. **Use `type: "divider"` for separators** — not border overrides. Add: *"Use `type: "divider"` nodes between list items. Do not simulate borders via overrides."*
15. **Document that `overrides` is a last-resort escape hatch** — Add: *"`overrides` is for ARIA attributes, cursor, roles, and rare CSS that has no DesignSpec equivalent. Never use overrides for backgrounds, sizing, or borders that can be expressed with standard node properties."*

#### Step B2: Validate with regeneration test (estimated: 20 min)

16. Re-run the design pipeline on the claim-filling dashboard page with the updated prompt
17. Compare the new JSON against the main-branch JSON structurally
18. Verify it renders correctly with both old and new renderer

### Step C: Final Verification

19. `nx run-many -t typecheck`
20. `nx run-many -t test`
21. Visual side-by-side comparison of rendered output vs Screenshot B (main branch)
22. Document findings in `docs/lessons-learned.md`

### Recommended Execution Order

**Do Track A first** (renderer fixes) — this unblocks the current JSON immediately without regeneration. Then do **Track B** (prompt fixes) — this prevents the problem from recurring on future pages. Track A and B are independent and could be parallelized.

---

## Appendix A: File Reference

| File | Role |
|---|---|
| `apps/claim-filling/agentforge/designs/dashboard.json` | Design spec JSON (2,105 lines) |
| `apps/claim-filling/agentforge/designs/dashboard/research.json` | Research brief output |
| `apps/claim-filling/agentforge/designs/dashboard/planning.json` | Planning spec output |
| `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx` | Browser renderer (1,188 lines) |
| `packages/agents-ux/src/prompts/ux-penpot-designspec-v2.md` | LLM prompt for design generation |
| `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx:128-160` | `SAFE_OVERRIDE_KEYS` |
| `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx:173-193` | `getOverrideStyles()` |
| `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx:764-777` | `renderAvatar()` |
| `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx:779-800` | `renderCard()` |

## Appendix B: Side-by-Side JSON Comparison (Main vs Dashboard-Plugin)

| Section | Main Branch Pattern | Dashboard-Plugin Pattern | Renderer Impact |
|---|---|---|---|
| **Stat cards** | `type: "container"`, `background: "surface-primary"`, `shadow: "sm"`, `radius: 12`, `layout: { dir: "column", gap: 8, px: 24, py: 20 }` | `catalog: "Card"`, `shadow: "sm"`, `radius: 10`, `background: "surface-primary"` | Main → `renderAccelerator(container)` which applies all styles. Plugin → `renderCard()` which DROPS overrides. |
| **Stat card trends** | `catalog: "badge-warning"`, `label: "↑ 12 from yesterday"` — rendered as colored badge | `type: "text"`, `content: "↑ +5%"`, `color: "error"` — rendered as plain text | Main shows colored badge pill. Plugin shows plain colored text (which actually works since `color` is top-level). |
| **Bar chart layout** | **Vertical list**: each status is a row → label (120px) + track (fill, surface-secondary bg) → fill bar (fixed px width, semantic token bg: "info"/"warning"/etc) | **Horizontal stacked bar**: one row container → segments with `overrides: { "flex": "18 0 0", "background-color": "#3B82F6" }` | Main uses top-level `background` + fixed `width` — renderer handles both. Plugin uses overrides for both color AND sizing — renderer handles neither. |
| **Bar fill colors** | `background: "info"` / `"warning"` / `"cta-primary"` / `"success"` / `"error"` (top-level, semantic tokens) | `overrides: { "background-color": "#3B82F6" }` (in overrides, hex, CSS-hyphenated key) | Main → `resolveTokenColor()` resolves semantic tokens. Plugin → override dropped silently (hyphenated key + not in SAFE_OVERRIDE_KEYS). |
| **Legend** | `catalog: "badge-info"`, `catalog: "badge-warning"`, etc. (badges as legend items) | Container with 12x12 dot (`overrides: { "background-color": "#3B82F6" }`) + text label | Main uses catalog badges (rendered correctly). Plugin dots invisible (override dropped). |
| **Donut chart** | Outer circle (`background: "surface-secondary"`, radius 90, 180x180) + inner circle (`background: "surface-primary"`, radius 55, 110x110) — simple gray ring | `overrides: { "background": "conic-gradient(#94A3B8 0% 30%, #F59E0B 30% 70%, ...)" }` — actual colored donut | Main renders as gray ring with center number (simple but works). Plugin conic-gradient blocked by `looksLikeCssColor()`. |
| **Donut legend dots** | `background: "error"` / `"warning"` / `"cta-primary"` / `"surface-secondary"` (top-level tokens) | `overrides: { "background-color": "#DC2626" }` (override, hex, hyphenated) | Main → token resolved by renderer. Plugin → override dropped. |
| **Avatars** | `catalog: "avatar"`, `label: "MR"` | `catalog: "Avatar"`, `overrides: { "initials": "MT" }` | Main → `renderAvatar()` reads `label` → shows "MR". Plugin → `label` is empty → shows "?". |
| **Activity items** | Separated by `type: "divider"` nodes (explicit divider between each item) | `overrides: { "border-bottom": "1px solid var(--border-default)" }` on each item | Main → `renderAccelerator(divider)` renders `<hr>`. Plugin → override dropped (hyphenated + CSS var). |
| **Activity layout** | Each item is a column: author name + description + timestamp (vertical stack) | Each item is a row: avatar + inline text flow with badges + timestamp | Both valid designs; main is simpler, plugin is closer to research spec. |
| **Card proportions** | `activity-feed-card: width: 460` (fixed), `workload-card: width: "fill"` | `activity-feed-card: overrides: { "flex": "5 0 0" }`, `workload-card: overrides: { "flex": "7 0 0" }` | Main → fixed width works. Plugin → `flex` not in SAFE_OVERRIDE_KEYS + `renderCard()` drops overrides. |
| **Workload table** | Header row with `background: "surface-secondary"` + text cells with `width: N` (pixels) + alternating row backgrounds | Header row with badges (`catalog: "Badge"`) + text nodes, similar structure but using `catalog: "Card"` as wrapper | Main uses plain containers throughout. Plugin uses catalog Card (overrides dropped). |
| **Header actions** | `catalog: "button-secondary"` (Export Report) + `catalog: "button-primary"` (New Claim) | No action buttons — just title + live indicator | Main has more features; design choice difference, not a bug. |
| **Page title** | "Claims Dashboard" + subtitle "Pipeline overview as of today, June 2 2025" | "Pipeline Overview" + live indicator badge | Different labels per research vs design choices. |

### Key Takeaway

The main branch JSON is **"renderable by construction"** — it sticks to the DesignSpec v2 vocabulary (top-level `background`, `width`, `label`, `type: "divider"`) and avoids the `overrides` escape hatch for core visual properties. The dashboard-plugin JSON is **"CSS by construction"** — it expresses visual properties the way a CSS developer would, which the renderer's `overrides` pipeline wasn't built to handle.

## Appendix C: What Did NOT Change Between Branches

These areas are confirmed identical or irrelevant to the quality gap:

- **Research prompts** (`ux-research-system.md`): Not in diff
- **Planning prompts** (`ux-planning-system.md`): Not in diff
- **Core types** (`design-spec-v2.ts`): Only added `display`, `columns`, `wrap` to LayoutSpec — beneficial, not harmful
- **Catalog resolver** (`resolver.ts`): Added kebab normalization — beneficial
- **Tree builder** (`tree-builder.ts`): Added empty-nodes guard — unrelated
