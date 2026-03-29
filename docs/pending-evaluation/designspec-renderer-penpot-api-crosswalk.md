> **EVALUATION STATUS: Pending Review**
> - **What it contains:** Mapping between DesignSpec v2 node types and Penpot plugin API calls. Component audit table.
> - **Why flagged:** Very technical/reference-oriented, could be inline docs instead.
> - **Counter-argument:** Actively referenced by CLAUDE.md ("After changing emitters, update this crosswalk"). Valuable Rosetta Stone between renderer and Penpot API.
> - **Recommendation:** KEEP in docs/ — it's actively maintained and referenced. Move back after evaluation.

# DesignSpec renderer — Penpot plugin API crosswalk

**Purpose:** Map generated-script APIs to [Penpot plugins documentation](https://doc.plugins.penpot.app/) and record component audit status. Update this file when emitters or Penpot APIs change.

**Last verified against doc.plugins.penpot.app:** 2026-03-26 (interface names and property lists; Penpot version not pinned in docs).

## Official references

| Topic | Documentation URL |
|--------|-------------------|
| Layout child (sizing, margins) | [LayoutChildProperties](https://doc.plugins.penpot.app/interfaces/LayoutChildProperties.html) |
| Flex container | [FlexLayout](https://doc.plugins.penpot.app/interfaces/FlexLayout.html) |
| Module overview | [Plugins API](https://doc.plugins.penpot.app/modules.html) |

## Emitted API inventory (repo → Penpot)

| Source module | Generated pattern | Penpot doc alignment |
|---------------|-------------------|----------------------|
| `shared.ts` `emitBoard` | `penpot.createBoard()`, `.name`, `.resize()`, `.fills[]` | Board shapes; fills use `fillColor` / `fillOpacity` |
| `shared.ts` `emitFlex` | `.addFlexLayout()`, `.flex.dir`, `.alignItems`, `.justifyContent`, `.rowGap` / `.columnGap`, `.*Padding` | Matches FlexLayout-style properties on board.flex |
| `shared.ts` `emitAppendChild` | `parent.appendChild(child)` then `child.layoutChild.horizontalSizing` / `verticalSizing` | Matches LayoutChildProperties; order per repo rule: append before layoutChild |
| `shared.ts` `emitLayoutChildMargins` | `verticalMargin`, `topMargin`, `bottomMargin`, `horizontalMargin`, `leftMargin`, `rightMargin` | Names match LayoutChildProperties |
| `shared.ts` `emitRadius` | `.borderRadius` | Standard shape property |
| `shared.ts` `emitStroke` | `.strokes[]` with `strokeColor`, `strokeOpacity`, `strokeWidth`, `strokeAlignment: 'inner'` | Verify `strokeAlignment` enum against current Penpot typings if visual glitches appear |
| `shared.ts` `emitShadow` | `.shadows[]` drop-shadow, `color: { r,g,b,opacity }` with **r/g/b 0–1** | Doc color ranges; we convert CSS 0–255 → ÷255 |
| `script-preamble.ts` | `penpot.createText()`, `.fontSize`, `.fontWeight` as string, `.fills`, `.resize`, `.growType = 'auto-height'` | Text API; empty string guard via space |
| `plugin-data.ts` | `.setPluginData(key, value)` | Plugin-specific; not core geometry API |
| `page.ts` | `.x = 0`, `.y = 0` on root board | Positioning |
| `stepper.ts` | `.flex.mainAxisSizing = 'auto'` on nested controls board | Confirm against FlexLayout / parent flex docs if behavior drifts |

**Not emitted (by design):** `penpot.createRectangle`, `penpot.createEllipse` — boards only per [CLAUDE.md](../CLAUDE.md) / lessons learned.

## Gaps / follow-ups (doc-supported, not yet in spec)

| Item | Notes |
|------|--------|
| `flex.wrap` | FlexLayout documents wrap; no `LayoutSpec` field yet |
| `layoutChild.alignSelf` | LayoutChildProperties; occasional substitute for missing textAlign on text |
| TextRange `align` | For multi-line centered text in Penpot; not used in renderer |

## Component renderer status (registry)

| Registry key | File | Status | Notes |
|--------------|------|--------|--------|
| `page` | `page.ts` | OK | Root x/y |
| `container` | `container.ts` | OK | effectiveWidth |
| `section` | `section.ts` | OK | No stroke; textAlign ignored (flex) |
| `header` | `header.ts` | OK | screenWidth |
| `divider` | `divider.ts` | Fixed | `fillOpacity: 0.3`; optional `layout.my` → margins |
| `spacer` | `spacer.ts` | OK | |
| `text` | `text.ts` | OK | |
| `input-text` | `input-text.ts` | OK | Nested boards |
| `input-currency` | `input-currency.ts` | OK | Delegates to input-text |
| `button-primary` | `button-primary.ts` | OK | Delegates to button-shared |
| `button-secondary` | `button-secondary.ts` | OK | Delegates |
| `button-ghost` | `button-ghost.ts` | OK | Delegates |
| `segmented-control` | `segmented-control.ts` | OK | Pills use `fill` to split row |
| `stepper` | `stepper.ts` | Fixed | Minus/plus `layoutChild` fix/fix |
| `display-readonly` | `display-readonly.ts` | OK | |
| `badge` | `badge.ts` | OK | |
| `stat` | `stat.ts` | OK | |
| `card` | `card.ts` | OK | |
| `avatar` | `avatar.ts` | OK | |
| `tooltip` | `tooltip.ts` | OK | |
| `checkbox` | `checkbox.ts` | Fixed | Box `fix`/`fix` |
| `select` | `select.ts` | OK | Delegates to input-text |

**Status legend:** OK = matches checklist; Fixed = audit-related code change applied.

## Related repo rules

- [docs/lessons-learned.md](lessons-learned.md) — Penpot Plugin API Rules, textAlign, effectiveWidth
- [CLAUDE.md](../CLAUDE.md) — DesignSpec Renderer checklist (grep rules)
