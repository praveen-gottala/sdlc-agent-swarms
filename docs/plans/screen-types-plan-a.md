# Screen Types Plan A: End-to-End Implementation

## Progress

- [x] Phase A1: Core Types & Schemas
- [x] Phase A2: App Spec Generation (LLM Prompt)
- [x] Phase A3: Viewport Resolution + Design Prompt Context + LLM Chain Fixes
- [x] Phase A4: Prototype Overlay Rendering
- [x] Phase A5: Dashboard Navigation Editor
- [x] Phase A6: E2E Tests + Cleanup

## Session Boundaries (recommended)

| Session | Phases | Why |
|---------|--------|-----|
| 1 | A1 + A2 | Small, tightly coupled — types feed into LLM prompt |
| 2 | A3 | Hardest phase — viewport resolver + Stage 3 LLM chain fix + prompt context |
| 3 | A4 | Standalone React/CSS work — overlay rendering + accessibility |
| 4 | A5 + A6 | Dashboard editor + E2E tests + cleanup |

## Implementation Rules (non-negotiable, every session)

1. **No mocks in production code.** Mocks are ONLY allowed in test files (`*.test.ts`, `*.spec.ts`). Never mock APIs, services, or dependencies in production code paths. If something needs a fake, it's a test concern — not a runtime concern.
2. **No shortcuts.** Every phase must produce production-ready code. No `// TODO`, no `as any`, no hardcoded workarounds, no "we'll fix this later" comments. If it's not ready, it's not done.
3. **Best practices always.** Follow TypeScript strict mode, use proper error handling, respect the existing architecture patterns. Read `docs/lessons-learned.md` before coding.
4. **Real Playwright E2E tests.** Phase A6 must include real browser tests exercising every overlay interaction — not shallow component tests. Every user-visible behavior must have a corresponding E2E assertion.
5. **Verify in browser.** For phases that touch rendering (A4, A5), use Chrome DevTools MCP to screenshot and verify before declaring done. Type checking and test suites verify code correctness, not feature correctness.

## Implementation Gotchas (watch for these)

1. **Stage 3 is a single point of failure for both Plan A and Plan B.** If the design agent consistently flattens child nodes into overrides (losing `navigateTo`), both screen type rendering and NavBar navigation will be broken at the same root cause. Validate Stage 3 early in Phase A3 before building rendering code on top.
2. **The `analyzeNavigation()` fallback should NOT be removed until Stage 3 is proven.** It's currently the only reason prototype navigation works. Keep it as a safety net even after Stage 3 is fixed.
3. **The "mode on binding vs screenType on target" precedence rule** (user override wins) is correct but needs to be tested explicitly — it's the kind of logic that silently regresses.

## Session Handoff Notes

_Updated after each session. New sessions should read this section first._

**Last completed phase**: A1 + A2 + A3 + A4 + A5 + A6 (2026-04-22)
**Current state**: ALL PHASES COMPLETE. Plan A is done.

**Phase A4 changes:**
- `PrototypeApp.tsx`: Full rewrite with overlay state management. Uses native `<dialog>` with `showModal()` for focus trapping and Escape handling. Renders background page + overlay simultaneously. `navigateTo` checks binding `mode` and target `screenType` to decide overlay vs full-page replacement. Focus returns to trigger element on close. `inert` attribute set on background when overlay is open. ScreenSelectorBar shows `[drawer]`/`[modal]`/`[sheet]` type badges.
- `DesignSpecRenderer.tsx`: `NavigationBinding` interface now includes `mode?: 'navigate' | 'overlay'`.
- `globals.css`: Overlay CSS system — `::backdrop` with fade-in, `.overlay-modal` (centered, scale-up animation, 560px max-width, rounded corners), `.overlay-drawer` (right-aligned, slide-in-right, 320px width, full height), `.overlay-sheet` (bottom-aligned, slide-up, full width, 80vh max-height). Close button with hover/focus-visible states.
- `build-manifest.ts`: `buildPrototypeManifest()` populates `screenType` from `PageEntry.screen_type` or `DesignSpecV2.screenType`. `extractNavigationFromSpecs()` derives `mode: 'overlay'` when target has non-page screenType.
- `dashboard/api/prototype/route.ts`: Inline types updated with `screenType` and `mode`. Screen building populates `screenType` from pages.yaml. User bindings derive `mode` from target screenType.
- `build-manifest.test.ts`: Updated existing test for `mode` field, added new test for overlay mode derivation. 6/6 pass.
- All typecheck + test suites pass.

**Gotchas discovered**: PrototypeApp.tsx, DesignSpecRenderer.tsx, and the dashboard API route all had stale inline copies of `PrototypeScreen` and `NavigationBinding` interfaces that lacked `screenType` and `mode`. The Vite browser app can't directly import the canonical types (different bundle entry), so the inline interfaces were updated in place. The dashboard API route also had a stale `PageEntry` interface missing `screen_type`.

**Phase A5 status (2026-04-22):** Already implemented in a prior session. `navigation-editor.tsx` has screen type badges (color-coded: purple=modal, blue=drawer, amber=sheet), auto-derived overlay mode for non-page targets, mode toggle button, and full CRUD for navigation bindings. `/api/navigation` route persists `mode` field via pages.yaml.

**Phase A6 changes (2026-04-22):**
- `DesignSpecRenderer.tsx`: Removed 2 debug `console.log` statements (navMap entries logging).
- `e2e/prototype-overlays.spec.ts`: New Playwright E2E test file with 8 test scenarios covering all plan requirements: drawer/modal badge in ScreenSelectorBar, overlay hotspot opens drawer with slide-in, Escape closes drawer, backdrop click closes drawer, modal focus trapping, page-to-page navigation regression, and binding mode=navigate override for full-page replacement of drawer targets.
- `fixtures/personal-expense-tracker/agentforge/designs/settings.json`: Drawer design spec fixture (320px, settings panel with theme/notifications toggles).
- `fixtures/personal-expense-tracker/agentforge/designs/confirm-delete.json`: Modal design spec fixture (560px, delete confirmation dialog with Cancel/Delete buttons).
- `docs/architecture/prototype-rendering-dataflow.md`: Added screen types/overlay rendering documentation (screen type table, navigation mode resolution flow, overlay CSS animations, NavigationEditor section).
- All typecheck + unit test suites pass (28 suites, 562 tests).

**Plan A is complete.** All 6 phases (A1-A6) are implemented and verified.

---

## Context

The existing plan at `docs/plans/screen-types-overlays-shared-layouts.md` proposes 8 phases to add screen type classification (page/overlay/modal/drawer), shared layout components, NavigationBar enhancement, and overlay rendering to the design pipeline. This document is the reviewed and refined version — Plan A focuses on screen types end-to-end, deferring shared layouts to Plan B.

**Goal**: Define a page as `screen_type: drawer`, have it designed at 320px with appropriate LLM instructions, see it rendered as an overlay in the prototype, and edit its navigation mode in the dashboard.

---

## Critical Decisions (from review)

### 1. Drop `trigger_from` — navigation is source-side only

Navigation bindings are modeled on the SOURCE side through a three-stage LLM chain:
1. **Stage 1** (`design:generate`): Generates `navigates_to` in pages.yaml (live-validated: 26 bindings across 7 pages)
2. **Stage 2** (planning LLM): Binds `navigateTo` to component tree nodes (works despite schema omission)
3. **Stage 3** (design agent): Should propagate to `NodeSpec.navigateTo` — **GAP: prompt has zero navigateTo instructions**

Post-generation, users can add bindings via NavigationEditor (stored as `navigates_to.source_node` on the source page).

The rendering mode is determined by the TARGET screen's `screen_type`, not by what triggered it. No `trigger_from` needed.

### 2. Enum: `page | modal | drawer | sheet` (not "overlay")

"Overlay" is the parent category across all major design systems (MD3, Apple HIG, Radix, MUI, Figma). Using it as a specific type alongside modal/drawer is ambiguous. Each value maps to a specific rendering behavior:
- `page` — full screen replacement
- `modal` — centered, backdrop, blocks interaction (default width 560px)
- `drawer` — side-anchored, slide-in (default width 320px)
- `sheet` — bottom-anchored, full width, height-constrained

### 3. NavBar stays pass-through — teach LLM to generate children

The planning LLM already decomposes NavBar into child nodes (NavLogo, NavItemHome, etc. with `navigateTo`). Keep the renderer's pass-through behavior. The remaining gap is Stage 3 (design agent) — needs validation that it preserves child node structure.

### 4. `NavigationBinding.mode` is DERIVED from target's screenType

When manifest is built: target has `screenType !== 'page'` → set `mode: 'overlay'`. User can override in NavigationEditor. Binding `mode` takes precedence over target's `screen_type` for rendering decisions.

---

## Navigation Architecture

```
THREE-STAGE LLM CHAIN (initial generation):

  Stage 1: App Spec LLM (design:generate)
  -> pages.yaml with navigates_to entries
       | read by
  Stage 2: Planning LLM (ux-planning)
  -> ComponentTreeNode.navigateTo on specific components
  OK WORKS: navigateTo survives despite schema omission (4/19 components, live-validated)
  RECOMMENDED: add navigateTo to PLANNING_OUTPUT_SCHEMA for reliability
       | should flow to
  Stage 3: Design LLM (design agent)
  -> NodeSpec.navigateTo in designspec-v2.json
  NOT YET VALIDATED: design prompt has no navigateTo instructions
       | extracted by
  extractNavigationFromSpecs()
  -> NavigationBinding[] in prototype.json

  CURRENT FALLBACK (masks the broken chain):
  extractNavigationFromSpecs() returns 0 bindings
       |
  analyzeNavigation() LLM fallback
  -> guesses navigation from screen summaries

  POST-GENERATION USER CORRECTION:
  User edits pages.yaml navigates_to or uses NavigationEditor
       |
  /api/prototype route injects into manifest

  MERGE (when both sources produce bindings):
       |
  DesignSpecRenderer builds navMap:
    1. External bindings (manifest) loaded first
    2. Inline navigateTo overwrites (LLM wins)
                  |
  onClick -> onNavigate(targetScreenId)
                  |
  PrototypeApp checks target's screenType:
    'page'   -> full screen replacement (existing behavior)
    'modal'  -> centered overlay with backdrop
    'drawer' -> right-aligned slide-in panel
    'sheet'  -> bottom-aligned panel
```

---

## Plan A: Phase-by-Phase

### Phase A1: Core Types & Schemas

**Files:**
- `packages/core/src/types/spec-types.ts` — add `screen_type` to PageEntry
- `packages/core/src/types/spec-types.schemas.ts` — add `NavigationTargetSchema`, add `screen_type` + `navigates_to` to `PageEntrySchema`
- `packages/core/src/index.ts` — export new schema
- `packages/designspec-renderer/src/types/design-spec-v2.ts` — add `screenType` to `DesignSpecV2`
- `packages/designspec-renderer/src/types/prototype-manifest.ts` — add `screenType` to `PrototypeScreen`, add `mode` to `NavigationBinding`

**Type definitions:**
```typescript
// PageEntry addition (spec-types.ts)
readonly screen_type?: 'page' | 'modal' | 'drawer' | 'sheet';

// DesignSpecV2 addition (design-spec-v2.ts)
readonly screenType?: 'page' | 'modal' | 'drawer' | 'sheet';

// PrototypeScreen addition (prototype-manifest.ts)
readonly screenType?: 'page' | 'modal' | 'drawer' | 'sheet';

// NavigationBinding addition (prototype-manifest.ts)
readonly mode?: 'navigate' | 'overlay';
```

**Do NOT add:**
- `trigger_from` (redundant with `navigates_to.source_node`)
- `overlay_width` (derive from screen_type in viewport resolver — convention over configuration)

**Zod updates (same phase, non-negotiable):**
```typescript
export const NavigationTargetSchema = z.object({
  target: z.string(),
  trigger: z.string(),
  source_node: z.string().optional(),
});

// PageEntrySchema additions:
screen_type: z.enum(['page', 'modal', 'drawer', 'sheet']).optional(),
navigates_to: z.array(NavigationTargetSchema).optional(),
```

**Verification**: `npx nx run-many -t typecheck` passes. Existing specs parse without errors (all new fields are optional).

### Phase A2: App Spec Generation (LLM Prompt)

**Files:**
- `packages/cli/src/commands/design-generate.ts` — update `GeneratedPage`, `buildSystemPrompt()`, `parseAppSpecResponse()`, `writeSpecFiles()`

**Changes:**
- Add `screen_type` to `GeneratedPage` interface
- Update JSON schema example in `buildSystemPrompt()` to show `screen_type` field with allowed values
- Add instruction: "Most screens are pages. Use 'modal' for dialogs and confirmation flows. Use 'drawer' for side panels (settings, filters, notifications). Use 'sheet' for bottom-anchored panels."
- `parseAppSpecResponse()` validates screen_type, defaults to `'page'` if missing
- `writeSpecFiles()` includes screen_type in pages.yaml output

**Verification**: `agentforge design:generate` produces pages.yaml with `screen_type` fields.

### Phase A3: Viewport Resolution + Design Prompt Context + LLM Chain Fixes

**Files:**
- `packages/core/src/config/viewport-resolver.ts` — add screenType parameter
- `packages/core/src/config/viewport-resolver.test.ts` — unit tests
- `packages/cli/src/commands/design-page-all.ts` — pass screen_type to resolver
- `packages/agents-ux/src/page-context-prompt.ts` — include screen_type in context
- `packages/agents-ux/src/ux-planning/ux-planning.ts` — overlay-specific planning instructions + add `navigateTo` to `PLANNING_OUTPUT_SCHEMA`
- `packages/agents-ux/src/ux-design/ux-penpot-design.ts` (or V2 design agent prompt) — **Stage 3 LLM chain fix**: propagate `navigateTo` and set `screenType`

**Viewport defaults:**
```
page:   existing chain (1440 default)
modal:  560
drawer: 320
sheet:  full width (use page default)
```

**Priority chain becomes:** CLI --width > screen_type default > page viewports > design config > 1440

**Design prompt context** (when screen_type is modal/drawer/sheet):
- "This is a [drawer/modal/sheet], not a full page."
- "Do NOT include page-level navigation (NavigationBar, sidebar, footer)."
- "Design only the panel content within [N]px width."
- "Include a close/dismiss affordance (X button for modal/drawer, drag handle for sheet)."

**Stage 3 LLM chain fix** (critical — validate EARLY in this phase):
- Update design agent prompt to propagate `ComponentTreeNode.navigateTo` to `NodeSpec.navigateTo`
- Update design agent prompt to set `DesignSpecV2.screenType` from page context
- Validate by running design pipeline on a test page and checking output JSON
- Do NOT remove `analyzeNavigation()` fallback until Stage 3 is proven

**Verification**: Unit tests for all viewport priority combinations. `resolveViewports({ screenType: 'drawer' })` returns `[320]`. Design agent output includes `screenType` and `navigateTo` on nodes.

### Phase A4: Prototype Overlay Rendering

**Files:**
- `packages/designspec-renderer/src/renderer/browser/app/src/PrototypeApp.tsx` — overlay rendering path
- `packages/designspec-renderer/src/renderer/browser/app/src/globals.css` — overlay/modal styles
- Build manifest utility (`build-manifest.ts`) — pass screenType to PrototypeScreen

**Rendering behavior by screen_type:**
- `page` (or absent): Full replacement, as today
- `modal`: Keep current page rendered + dimmed backdrop + centered dialog (max-width 560px, rounded corners)
- `drawer`: Keep current page + backdrop + right-aligned panel (width 320px, full height, slide-in animation)
- `sheet`: Keep current page + backdrop + bottom-aligned panel (full width, max-height 80vh)

**NavigationBinding mode derivation:** When `targetScreenId` references a screen with `screenType !== 'page'`, set `mode: 'overlay'` automatically.

**Accessibility (non-negotiable, included in this phase):**
- Use native `<dialog>` with `showModal()` for focus trapping + Escape handling
- `aria-modal="true"`, `role="dialog"`
- `inert` attribute on background page container
- Return focus to source node on close
- Close button with `aria-label="Close"`

**CSS additions (globals.css):**
```css
:root {
  --z-overlay-backdrop: 1040;
  --z-overlay: 1050;
}
```
- Overlay backdrop styles
- `@keyframes slide-in-right` for drawers
- `@keyframes scale-up` for modals

**Verification**: Click nav-hotspot bound to drawer -> drawer slides in. Press Escape -> closes. Tab cycles within drawer only. Focus returns to trigger.

### Phase A5: Dashboard Navigation Editor

**Files:**
- `packages/dashboard/src/components/design/navigation-editor.tsx` — show screen type badge, auto-set mode
- `packages/dashboard/src/app/api/navigation/route.ts` — persist mode field

**Changes:**
- Show screen type badge next to each target: `[drawer]`, `[modal]`, `[sheet]`
- Auto-set `mode: 'overlay'` when target has `screen_type !== 'page'`
- Allow manual override (user can force a modal to navigate as full-page)
- Display mode in binding row: "[trigger] -> [target] (overlay)" or "(navigate)"

**Verification**: Dashboard shows mode for each binding. Changing mode persists and is reflected in prototype.

### Phase A6: E2E Tests + Cleanup

**Files:**
- `e2e/prototype-overlays.spec.ts` — Playwright E2E tests
- Remove debug `console.log` from DesignSpecRenderer.tsx and PrototypeApp.tsx
- Update `docs/architecture/design-pipeline-dataflow.md` per mandatory checklist

**E2E test scenarios (real browser, no mocks):**
1. Load prototype with a drawer screen -> drawer renders at correct width
2. Click nav-hotspot bound to drawer -> drawer slides in
3. Press Escape -> drawer closes, previous page visible
4. Click backdrop -> drawer closes
5. Tab within modal -> focus trapped
6. Screen-to-screen page navigation still works (no regression)
7. Mode override: force drawer to navigate as full-page -> verify full replacement
8. Precedence test: binding mode=navigate overrides target screenType=drawer

**Verification**: `npx nx run-many -t typecheck` zero errors. `npx nx run-many -t test` all pass. `npx playwright test` all pass.

---

## Plan B: Shared Layouts & NavBar Generation (separate, after Plan A)

Full plan: `docs/plans/screen-types-plan-b.md`

---

## Data Flow Diagram

```
pages.yaml (PageEntry.screen_type)
    | read by
design-generate.ts (LLM decides screen_type per page)
    | written to
pages.yaml (persisted)
    | read by
viewport-resolver.ts (derives width: drawer->320, modal->560)
    | width passed to
ux-planning.ts (adds overlay-specific prompt instructions)
    | output includes
designspec-v2.json (DesignSpecV2.screenType field)
    | read by
build-manifest.ts (copies to PrototypeScreen.screenType)
    | manifest loaded by
PrototypeApp.tsx (decides: page-replace vs. overlay render)
    | also read by
NavigationEditor.tsx (shows mode badge, auto-sets overlay mode)
    | persists via
/api/navigation (mode field in NavigationBinding)
```

---

## Long-Term Vision

### Code Generation (future)
`screen_type` maps directly to React/Next.js patterns:
- `page` -> route page component
- `modal` -> parallel route or portal-rendered dialog
- `drawer` -> state-controlled side panel with AnimatePresence
- `sheet` -> mobile-optimized bottom sheet component

### Responsive Adaptation
- Modals -> full-screen covers below 640px
- Drawers -> bottom sheets on mobile
- Sheets -> remain bottom-anchored but expand to full height

### Design System Compliance
- Modal on MD3: "dialog" with 24dp rounded corners and scrim
- Drawer on MD3: "side sheet" with specific elevation

### Cross-Platform Renderer (future)
- React Native: `Modal`, `BottomSheet`
- Flutter: `showModalBottomSheet`, `Drawer`
- SwiftUI: `.sheet`, `.fullScreenCover`

---

## Reference: Full Issue Analysis

For the complete critical review with live LLM validation data, cross-references between issues, and fact-checked severity assessments, see `docs/plans/screen-types-critical-review.md`. Key issues were:

- **CRITICAL-1**: `trigger_from` redundant (drop it)
- **CRITICAL-2**: "overlay" wrong terminology (use page/modal/drawer/sheet)
- **CRITICAL-3**: NavBar override rendering conflicts with LLM architecture (keep pass-through)
- **CRITICAL-4**: Zod schemas are dead code but must stay in sync
- **HIGH-1**: Shared layouts orthogonal (defer to Plan B)
- **HIGH-2**: Accessibility missing (use native `<dialog>`)
- **HIGH-3**: Data flow diagram needed (included above)
- **HIGH-4**: LLM prompt needs overlay context (included in Phase A3)
