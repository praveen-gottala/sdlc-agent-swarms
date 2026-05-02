---
name: improvise-ux
description: Improve an existing CHIP UI component's polish to match a reference design. Captures baseline screenshots, deep-studies the reference in matching color scheme, audits design tokens, computes target contrast values mathematically (WCAG ratios for text, lightness deltas for surfaces), extends tokens additively (never modifies existing), and verifies every interactive state and color scheme. Use when polishing existing components against a reference like Claude.ai, Linear, or Vercel.
argument-hint: "<description of what to improve> [reference URL or screenshot]"
context: inline
agent: main
---

# improvise-ux

Improve an existing CHIP dashboard UI component to match the polish of a reference design. Encodes an 11-phase protocol that fixes specific failure modes observed in past sessions: eyeballed contrast values, untested color schemes, parallel design token systems, and verifying only the default state.

**Origin (2026-05-01):** Polishing the `/new` page input to match Claude.ai's quality took 3 revision cycles. The first attempt used `#1c1e32` for the input background — a 3% HSL lightness delta against `#0a0b10`, invisible in dark mode. Light mode was never tested. A parallel token system (`--color-bg-input`, `--color-border-input`) was created alongside the existing `--color-bg-card`/`--color-bg-elevated` hierarchy, fragmenting the design language. Each failure mode has a corresponding phase in this protocol to prevent recurrence.

## When to use this skill

**Use when:** polishing an existing component against a specific reference (Claude.ai, Linear, Vercel, Figma mockup, etc.). The component already exists and works; the goal is to close a polish gap.

**Do not use when:**
- Building a new feature → `/implement-feature`
- Verifying a feature is done → `/verify-done`
- Verifying spec-renderer fidelity → `/verify-design-render`
- Writing or updating documentation → `/backstage`, `/verify-docs`

## Reference types accepted

| Reference type | Treatment |
|----------------|-----------|
| Live URL | Navigate via Chrome DevTools MCP, inspect computed CSS via `evaluate_script`, treat values as authoritative |
| Static screenshot | Estimate values, mark every Step 5 row "estimated — verify if URL becomes available" |
| Figma file (shared with inspect access) | Extract tokens from inspect panel, treat as authoritative for documented tokens, estimate the rest |
| Figma file (no access) | Treat as screenshot |
| "Make it like X" with no specific page or asset | **STOP**. Ask for a URL or screenshot of the exact view to match before proceeding. |

## Protocol (11 phases)

Phases 1, 2, 3, 4, 5, 9 (audit + computation + state verification + color-scheme verification + comparison) are never skippable. Bail-outs for phases 7-8 are documented inline.

### Phase 1 — Capture baseline

Navigate to the component page via Chrome DevTools MCP. Capture **every state the component supports**:

- default
- placeholder (if input)
- focus
- hover
- with-content (if input or container)
- active / pressed (if interactive)
- disabled (if applicable)

Name screenshots descriptively: `before-default.png`, `before-focus.png`, etc. **Every state captured here MUST have a corresponding `after-*.png` in Phase 9.** This symmetry is the verification contract.

### Phase 2 — Deep-study the reference

1. **Gate: ensure a reference asset exists.** If the user said "make it like X" without providing a URL or screenshot, ask for one now. Do not proceed to Phase 3 without a reference asset.
2. **Match the color scheme of the target.** If CHIP component is dark mode, emulate dark on reference: `emulate colorScheme="dark"`. Studying a light reference for a dark target is one of the failure modes this skill exists to prevent.
3. Capture reference screenshots for the same state set as Phase 1.
4. For URL references, extract computed CSS via `evaluate_script`:
   - `backgroundColor`, `color`, `borderColor`, `borderWidth`, `borderRadius`
   - `padding`, `margin`, `gap`
   - `fontSize`, `fontFamily`, `fontWeight`, `lineHeight`, `letterSpacing`
   - `boxShadow`, `opacity`, `backdropFilter`
   - `transition`, `transitionProperty`, `transitionDuration`, `transitionTimingFunction`
5. Record everything in a reference table. Mark estimated values explicitly.

### Phase 3 — Audit the existing CHIP design system

Read `packages/dashboard/src/app/globals.css` completely. Inventory every token under `@theme {}` and every class under `@layer components {}`.

Produce a token inventory grouped by purpose:

```
Backgrounds:    --color-bg-page, --color-bg-input, --color-bg-card, ...
Text:           --color-text-primary, --color-text-muted, ...
Borders:        --color-border-input, --color-border-subtle, ...
Accents:        --color-accent, --color-accent-fg, ...
Shadows:        --shadow-sm, --shadow-elevated, ...
Component classes: .input-elevated, .glass, .focus-ring, .gradient-text, ...
```

For each reference property captured in Phase 2, check if an existing token already achieves it (within the thresholds defined in Phase 9). **Reuse before extending.**

### Phase 4 — Audit the current component code

Read the component JSX and every imported style dependency. Produce a property audit table:

```
| Property      | Current value | Token used        | Reference value | Gap         |
|---------------|---------------|-------------------|-----------------|-------------|
| background    | #1a1a1a       | --color-bg-input  | #1c1c1f         | trivial     |
| border-radius | 8px           | (literal)         | 24px            | material    |
| padding       | 12px 16px     | (literal)         | 20px 24px       | material    |
| ...           | ...           | ...               | ...             | ...         |
```

Every visual property must appear. Do not skip "close enough" properties without measuring them.

**Exit ramp:** If the audit shows zero material gaps (every row "trivial" or "exact" per Phase 9 thresholds), report findings and stop. Do not modify code to justify the invocation.

### Phase 5 — Compute target values mathematically

Convert all colors to HSL for analysis. Apply these rules — they are different problems and use different math:

**Text-to-background contrast** (accessibility, not aesthetics):
- Compute WCAG contrast ratio using relative luminance formula
- AA normal text: ≥ 4.5:1
- AA large text (≥ 18pt or 14pt bold): ≥ 3:1
- AAA normal text: ≥ 7:1
- Polish target: AA minimum, AAA preferred for body text
- Do **not** approximate with lightness deltas — hue-shifted pairs (desaturated blue text on dark gray) pass deltas but fail WCAG.

**Surface-to-surface separation** (visual hierarchy, e.g., card on background):
- Dark mode: 8-15% L delta in HSL
- Light mode: 3-8% L delta in HSL
- Below these = invisible separation; above = jarring

**Border-to-background visibility**:
- WCAG contrast ratio ≥ 1.3:1 for decorative borders
- ≥ 3:1 for borders that convey meaning (focus, error, selected)

**Shadow values, transitions, opacities**: record exact target values from Phase 2. Do not eyeball.

Output of this phase: a target-values table that Phase 7 will implement against. Every number is computed or measured; none are guessed.

### Phase 6 — Plan token additions (strictly additive)

**Hard rule for this skill: existing tokens are never modified.** If a new value is needed, add a new token. Cruft is acceptable; regression is not.

For each material gap from Phase 4:

1. Check if an existing token from Phase 3's inventory matches the target value within Phase 9 thresholds. If yes, swap the component to use it. Done.
2. If no existing token matches, define a new token following the existing naming convention:
   - `--color-bg-input` exists → new variant becomes `--color-bg-input-elevated`, not `--bg-input-2`
   - `--shadow-sm`, `--shadow-md` exist → new becomes `--shadow-input`, not `--shadow-new`
3. Add values for **all color schemes the project supports**:
   - Dark in `@theme {}`
   - Light in `html[data-mantine-color-scheme="light"]`
   - Any other schemes inventoried in Phase 3
4. **Never** create `-v2`, `-new`, or `-improved` suffixes on tokens or component classes. New names describe purpose, not vintage.
5. **Never** modify an existing token's value. If you find yourself wanting to, add a new token instead and only the component being polished uses it.
6. New `@layer components` classes only when the pattern is used in 3+ components. Otherwise inline Tailwind utilities.

Output: a list of new tokens with their values for every color scheme, ready to apply.

### Phase 7 — Apply changes

Apply all changes from Phase 6 to the component. Within this phase:

- **7a. Tokens** — Add new tokens to `globals.css` first, in the existing hierarchy.
- **7b. Structural** — radius, padding, margin, gap, sizing, layout.
- **7c. Interactive states** — focus rings, hover, active, disabled, transitions. Match transition timing from Phase 2 reference exactly.
- **7d. Hierarchy** — typography scale, spacing relationships, focal points, decorative elements. Reuse existing classes (`.gradient-text`, `.glass`) before defining new ones.

**Bail-outs:**
- Component has no interactive states → skip 7c entirely.
- Component has only some interactive states (e.g., hover but no focus/active) → apply 7c only for the states that exist.

Apply in this order: tokens → structural → interactive → hierarchy. Re-applying earlier phases late causes churn.

**After Phase 7, run typecheck:**

```bash
nx run-many -t typecheck
```

If typecheck fails, fix before proceeding to Phase 8. Catching compile errors now is cheaper than debugging in the browser.

**If tokens were changed in files outside `packages/dashboard/src/`**, rebuild packages before browser verification:

```bash
nx run-many -t build
```

The dashboard uses pre-built `dist/` from monorepo packages — changes to shared packages won't be reflected until rebuilt.

### Phase 8 — Update sibling elements on the same page

Adjacent elements on the **current page only** should use the same tokens for coherent visual language. Scope is strictly the page being polished — do not modify the same component's usage on other pages without a separate invocation.

**Bail-out:** If the component has no siblings on the page (e.g., a full-page modal), skip this phase.

### Phase 9 — Verify every interactive state in browser

Ensure the dev server is running. If not: `cd packages/dashboard && npm run dev`.

Re-capture every state from Phase 1 as `after-*.png` via Chrome DevTools MCP. The set of `after-*.png` files MUST exactly match the set of `before-*.png` files. Missing an after-shot is a protocol violation — the verification contract from Phase 1.

For each state, compare against baseline. If any state looks unchanged when it should have changed, or wrong when it should look right, return to Phase 7 before continuing.

**Match thresholds** (used here and in Phase 11 comparison table):

| Match level | Numeric (px, %, ms) | Color (perceptual) |
|-------------|--------------------|--------------------|
| exact       | within 2%          | ΔE ≤ 2             |
| close       | within 5%          | ΔE ≤ 5             |
| no          | beyond close       | ΔE > 5             |

Trivial gaps (within "exact") do not require token additions in Phase 6. Material gaps ("close" or worse) do.

**Accessibility checks** (always run, regardless of reference match):
- Tab to component. Verify focus ring is visible against background (WCAG ≥ 3:1 contrast against adjacent pixels).
- If transitions added in Phase 7c, test with `prefers-reduced-motion: reduce` emulated. Component must remain functional and not jarring.
- If text was changed, verify WCAG contrast ratio meets target from Phase 5.

### Phase 10 — Test all color schemes

Toggle scheme via `evaluate_script` (set `data-mantine-color-scheme` attribute on `html`). Capture default, focus, and with-content states in the alternate scheme.

Check for:
- Missing color-scheme overrides (token defined for dark, undefined for light → fallback wrong)
- Transparency issues (semi-transparent overlay reads correctly on dark, washes out on light)
- Shadow weight differences (dark-mode shadows often need higher opacity)
- Text contrast violations specific to one scheme

Toggle back. Verify original scheme still renders identically to Phase 9 captures (catches CSS that leaked across schemes).

### Phase 11 — Side-by-side comparison table (primary output)

This table is the deliverable. Without it, the skill did not run.

```
## improvise-ux report: <component name>

| Property      | Before        | After           | Reference     | Match? |
|---------------|---------------|-----------------|---------------|--------|
| background    | #1a1a1a       | #1c1c1f         | #1c1c1f       | exact  |
| border-radius | 8px           | 24px            | 24px          | exact  |
| padding       | 12px 16px     | 20px 24px       | 20px 24px     | exact  |
| focus ring    | 2px solid #06f | 0 0 0 3px hsla(...) | 0 0 0 3px hsla(...) | close |
| ...           | ...           | ...             | ...           | ...    |

States verified: [x] default, [x] focus, [x] hover, [x] with-content, [x] disabled
Color schemes verified: [x] dark, [x] light
Accessibility: text contrast 7.2:1 (AAA), focus ring contrast 3.4:1 (AA)
Tokens reused: --color-bg-elevated (background), --color-accent-indigo (send button)
Tokens added: --shadow-input, --color-border-input-focus
Tokens modified: NONE (additive-only protocol)
Files changed: app/globals.css, components/Input/Input.tsx
```

If reference was a screenshot only, the Reference column is marked `(estimated)` for every row.

## Anti-patterns (encoded — do not do these)

- **Parallel token systems** — creating `--bg-input-new`, `--bg-input-v2`, or a separate `@theme` block instead of extending the existing hierarchy
- **Modifying existing tokens** — explicitly forbidden by Phase 6's strictly-additive rule
- **Eyeballing contrast** — every contrast value must be a computed WCAG ratio (text) or measured L delta (surfaces)
- **Lightness delta as proxy for text contrast** — fails on hue-shifted color pairs; use WCAG ratios for text
- **Testing only the default state** — Phase 1/Phase 9 symmetry exists to prevent this
- **Not testing alternate color scheme** — Phase 10 is non-skippable
- **No baseline screenshots** — Phase 1 is non-skippable
- **Studying the wrong color scheme on reference** — emulate the target's scheme on the reference (Phase 2 step 1)
- **Adding CSS classes for one-off styles in a Tailwind-first project** — Tailwind utilities for one-offs, component classes only when used in 3+ places
- **Changing component code without reading globals.css first** — Phase 3 must complete before Phase 7
- **Modifying the component on other pages while polishing this one** — Phase 8 is scoped to the current page only

## Ownership boundary

**Owns:** Improving the polish of an existing UI component to match a reference design.

**Does not own:**
- New features → `/implement-feature`
- Completion verification → `/verify-done`
- Spec-renderer fidelity → `/verify-design-render`
- Documentation → `/backstage`, `/verify-docs`