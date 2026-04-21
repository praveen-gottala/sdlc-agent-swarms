# Critical Review: Screen Types, Shared Layouts & Overlay Navigation Plan

## Context

The existing plan at `docs/plans/screen-types-overlays-shared-layouts.md` proposes 8 phases to add screen type classification (page/overlay/modal/drawer), shared layout components, NavigationBar enhancement, and overlay rendering to the design pipeline. This review evaluates the plan against the current codebase state, UX industry standards, and AgentForge's long-term trajectory.

**Current state**: All code compiles (zero type errors), 537 unit tests pass, prototype mode works with full-page screen-to-screen navigation. No screen type, overlay, or shared layout concepts exist anywhere in the codebase.

---

## What the Plan Gets Right

1. **Correct problem identification**: Every `pages.yaml` entry is treated as a full-page screen. A slide-over panel (NotificationsPanel) gets rendered at 1440px — a real bug.
2. **Good reference points**: Figma overlay frames, Next.js parallel routes, and MD3 surface classification are the right inspirations.
3. **Phased approach**: Breaking into discrete phases manages complexity well.
4. **Builds on working infrastructure**: The plan extends existing `PrototypeApp.tsx` (hash-based routing, hotspot CSS) and `NavigationEditor` (click-to-select, persist to pages.yaml) — both are proven.
5. **Viewport resolver is the right insertion point**: `packages/core/src/config/viewport-resolver.ts` already has a priority chain (CLI flag > page viewports > design config > 1440 default). Adding screen_type as a factor in this chain is clean.

---

## Issues (ranked critical to minor)

### CRITICAL-1: `trigger_from` is redundant — navigation is already source-side

The plan adds `trigger_from` to the TARGET `PageEntry`. But navigation bindings are already fully modeled on the SOURCE side through a three-stage LLM chain:

**Three-stage LLM chain (all source-side, same direction):**

1. **App Spec LLM** (`design:generate`, `design-generate.ts:92-149`): Generates `pages.yaml`
   with `navigates_to` entries based on understanding the app description. The LLM is instructed:
   *"Think about the user journey — how do they flow between pages? Capture this in navigates_to."*
   This is the **origin** of navigation data — not user input.
   **Live LLM validation (2026-04-19):** 7/7 pages produced `navigates_to` with 26 total
   bindings. Triggers are descriptive ("Click 'View All Transactions' link"). All targets
   reference valid page IDs. Stage 1 works reliably.

2. **Planning LLM** (`ux-planning`, `ux-planning-system.md:86-104`): Reads `navigates_to` from
   `pages.yaml` via `formatPageContextPrompt()` (`page-context-prompt.ts:35-38`), and is instructed
   to bind navigation to specific component tree nodes via `ComponentTreeNode.navigateTo`.
   **Live LLM validation (2026-04-19):** `PLANNING_OUTPUT_SCHEMA` has `additionalProperties: false`
   and omits `navigateTo`, but the LLM produces `navigateTo` on 4 components anyway (the API
   does not strictly strip extra fields from structured output). The schema gap is less severe
   than originally claimed — `navigateTo` survives despite not being declared. However, adding
   `navigateTo` to the schema is still recommended for correctness and reliability.

3. **Design LLM** (design agent): Should propagate `ComponentTreeNode.navigateTo` to
   `NodeSpec.navigateTo` in `designspec-v2.json`, which `extractNavigationFromSpecs()`
   (`build-manifest.ts:85-109`) then extracts into the prototype manifest.
   **Gap:** Design agent prompt has zero mentions of `navigateTo`.

**Post-generation user correction** (not part of initial flow):
- User sees prototype, manually edits `navigates_to` in `pages.yaml` or uses
  NavigationEditor in the dashboard
- `/api/prototype` route injects user bindings into the manifest
- This is a correction/override mechanism, not an initial data source

**Current fallback** (masks the incomplete chain):
- Stages 1-2 work: `navigates_to` is generated and planning LLM binds `navigateTo` to components
- Stage 3 gap: the design agent prompt has no `navigateTo` instructions, so
  `extractNavigationFromSpecs()` returns 0 bindings from existing design JSON files
- `analyzeNavigation()` LLM fallback kicks in — analyzes screen summaries to guess navigation
- Once Stage 3 is fixed (design prompt includes `navigateTo`), the fallback becomes unnecessary

**Merge logic when both sources produce bindings (verified in code):**
- `/api/prototype` route (lines 134-156): appends user bindings to manifest, no deduplication
- `DesignSpecRenderer` (lines 71-83): builds `navMap` — user bindings loaded first, then LLM `navigateTo` overwrites (last-write-wins, LLM takes precedence)

**Why `trigger_from` on the target adds nothing for screen types:**
The rendering mode (drawer/modal/sheet) is determined by the TARGET screen's `screen_type`, not by what triggered it. When `PrototypeApp` receives a navigation event targeting a screen with `screenType: 'drawer'`, it renders a drawer overlay — regardless of which node triggered the navigation. The trigger identity is already captured on the source side at all three stages above.

**The one valid use case** — generation hints ("this drawer is triggered from the bell icon") — belongs in the page `description` field, which the LLM already reads during design generation.

**Action**: Drop `trigger_from`. Keep the source-side LLM chain architecture. For screen types, add `screen_type` to the TARGET page — `PrototypeApp` derives overlay rendering mode from it.

**Prerequisite (softened by live validation)**: Adding `navigateTo` to `PLANNING_OUTPUT_SCHEMA`
is recommended for reliability, though the LLM already produces it despite the schema omission.
The remaining blocker is Stage 3: the design agent prompt must be updated to propagate
`navigateTo` from planning output to `NodeSpec.navigateTo` in the design JSON. This is also
required for screen types — `screen_type`-aware layout instructions need the same Stage 3 path.

### CRITICAL-2: "overlay" as a `screen_type` value is terminologically wrong

**Verified across all major design systems.** No major design system uses "overlay" as a concrete
component type — it is either a parent category (informal UX usage), a rendering mode (Figma
prototyping), or a backdrop element (MD3 "scrim"). The original plan's enum
`'page' | 'overlay' | 'modal' | 'drawer'` is ambiguous: a notifications panel could be
classified as either `overlay` or `drawer`.

| Design System | "Overlay" as component type? | Concrete types used |
|---|---|---|
| Material Design 3 | No ("scrim" for backdrop) | Dialog, Bottom Sheet, Side Sheet, Drawer |
| Apple HIG | No | Sheet, Popover, Alert, Action Sheet |
| Radix / shadcn/ui | No | Dialog, Drawer, Sheet, Popover |
| MUI | No (Modal = low-level primitive) | Dialog, Drawer, Popover |
| Figma | Prototyping rendering mode | Not a content type |

**Action**: Use `screen_type: 'page' | 'modal' | 'drawer' | 'sheet'`. These are mutually
exclusive and each maps to a specific rendering behavior in `PrototypeApp`.

**Why "modal" and not "dialog":** The research shows MD3/Radix/shadcn use "dialog" as the
component name, while "modal" is technically a behavior (blocks background interaction).
However, `screen_type` classifies **rendering mode**, not component type. The other values
are also rendering modes: `drawer` = "renders from the side", `sheet` = "renders from the
bottom", `modal` = "renders centered with backdrop, blocks interaction". Using `dialog`
would mix abstraction levels — a component name alongside rendering mode names.

**Why not add popover/alert/toast:** These are **element-level patterns** within a page's
component tree, not page-level screens in the app's information architecture. You don't
design a "popover page" in `pages.yaml` — the LLM generates popovers as nodes within a
page's `designspec-v2.json`. `screen_type` classifies screens that appear in the prototype's
screen selector bar.

**Gap: LLM classification guidance.** The `design:generate` prompt must include concrete
heuristics for when to use each type, or the LLM will default everything to `page`:
- `page` — default; any screen the user navigates to directly (dashboard, settings, profile)
- `modal` — confirmation flows, focused forms, detail views that shouldn't lose parent context
- `drawer` — auxiliary panels from persistent UI (notifications from bell icon, filters, settings)
- `sheet` — mobile-oriented content that slides up (share menu, action picker)

This is the same class of issue as CRITICAL-1's schema gap: the prompt/schema chain must
carry `screen_type` through `design:generate` → planning → design, or the LLM won't produce it.

### CRITICAL-3: Phase 5 (NavBar from overrides) conflicts with the LLM generation architecture

The plan proposes making NavigationBar auto-render bell/avatar/links from `overrides`. But:
- `NodeSpec` (`design-spec-v2.ts:48-50`) already uses **22 of 24 optional fields** in the strict mode
  budget — adding override-driven rendering semantics risks the field limit
- The renderer would need to hardcode knowledge of specific override keys (`brand_name`,
  `nav_links`, `actions`)

**Fact-check of original claims:**

1. **"22 of 24 fields" — verified** but misapplied. Phase 5 doesn't add new NodeSpec fields — it
   proposes consuming existing `overrides` data. The field budget isn't affected.

2. **"LLM already generates child nodes" — PARTIALLY CORRECT at planning stage.**
   Old design JSON files (stale sample apps) show NavigationBar with overrides and NO children.
   **Live LLM validation (2026-04-19):** The planning LLM DOES decompose NavigationHeader into
   child nodes: `["NavLogo", "NavItemHome", "NavItemExpenses", "NavItemBudgets", "NavItemReports"]`.
   `NavItemReports` has `navigateTo=reports`. However, the design agent (Stage 3) may still
   flatten these into overrides — needs further validation at that stage.

3. **"Renderer hardcodes override keys" — TRUE, but consistent** with existing patterns. The
   renderer already handles `variant` (Button), `icon` (Lucide), `tabs` (Tabs), `columns`
   (DataTable), `initials` (Avatar) from overrides. Not a new concern.

**Why child nodes are the right long-term answer despite the above:**

Overrides can't express **per-element interactivity**. A flat `nav_links: ["Dashboard", "Claims"]`
can't carry `navigateTo` per link. With child nodes, each element is a first-class NodeSpec:

```
"nav-dashboard": { "parent": "navbar", "catalog": "nav-link", "label": "Dashboard", "navigateTo": "dashboard" }
"bell-button":   { "parent": "navbar", "catalog": "icon-button", "navigateTo": "notifications-panel" }
```

This gives three advantages over overrides:
- **Navigation for free**: `extractNavigationFromSpecs()` picks up `navigateTo` from any node —
  no NavBar-specific renderer code needed
- **Code generation**: Each child maps to a real React/Flutter/SwiftUI component with real props
  and event handlers. Overrides require the code generator to reverse-engineer NavBar conventions.
- **No hardcoded keys**: The renderer's existing pass-through NavBar + child node rendering handles
  everything. No `brand_name`/`nav_links`/`actions` key parsing.

**Prerequisite**: Fixing the LLM chain (CRITICAL-1) is required first. The planning prompt must be
able to output `navigateTo` on component tree nodes, and the design agent must propagate it to
NodeSpec. Once that works, teaching the LLM to generate NavBar child nodes (using the catalog's
`anatomy: [brand, nav_links, actions]` as guidance) is straightforward.

**Action**: Keep NavigationBar as pass-through (no Phase 5 renderer changes). The planning LLM
already decomposes NavBar into child nodes with `navigateTo` (confirmed by live LLM test
2026-04-19). The remaining gap is at the design agent (Stage 3) — need to verify it preserves
child node structure rather than collapsing to flat overrides. The existing
`extractNavigationFromSpecs()` handles navigation binding automatically.

**Note on trigger format:** `navigates_to[].source_node` in `pages.yaml` must reference a
rendered **node ID** (e.g., `workload-section-action`, `claims-table`), not a component name.
This is the ID that appears as `data-node` in the rendered HTML and gets matched by
`extractNavigationFromSpecs()`. See `fixtures/claim-filling-sample/agentforge/spec/pages.yaml`
for examples.

### CRITICAL-4: Zod schemas are never updated (VERIFIED — severity corrected)

**Confirmed:** `PageEntrySchema` (`spec-types.schemas.ts:96-105`) is missing `navigates_to`
despite the field existing in the `PageEntry` interface (`spec-types.ts:147`). No
`NavigationTargetSchema` exists for the `NavigationTarget` interface (`spec-types.ts:126-133`).

**Severity corrected — schemas are dead code.** The Zod schemas are exported from
`core/src/index.ts` (lines 294-295) but **never imported or called anywhere in the codebase**.
No `.parse()` or `.safeParse()` call exists on `PageEntrySchema` or `PagesSpecSchema`. YAML
loading uses raw `yaml.parse()` with unsafe `as T` cast (`yaml-utils.ts:25`):
```typescript
const parsed = parseYaml(result.value) as T;
```
Fields cannot be "silently stripped" today because the schemas are never executed. The risk is
**latent**: if Zod validation is added later without `.passthrough()`, unschema'd fields would
be dropped (default Zod v3 behavior is `.strip()`).

**Connections to CRITICAL-1, 2, 3:**

- **From CRITICAL-1** (drop `trigger_from`): The missing `NavigationTargetSchema` must match
  the existing `NavigationTarget` interface — `{ target, trigger, source_node? }`. It must NOT
  include `trigger_from`, which CRITICAL-1 established as redundant with source-side navigation.

- **From CRITICAL-2** (correct enum): When `screen_type` is added to the schema, it must use
  `z.enum(['page', 'modal', 'drawer', 'sheet'])` — not the original `overlay` value that
  CRITICAL-2 proved is terminologically wrong across all major design systems.

- **From CRITICAL-3** (NavBar as pass-through): No NavBar-specific override schemas are needed.
  Child nodes use existing `NodeSpec` structure, so CRITICAL-4's scope is limited to
  `screen_type` and `navigates_to` only.

**Action (two-part):**

1. **Fix existing gap now**: Add `NavigationTargetSchema` and `navigates_to` to `PageEntrySchema`.
2. **Keep schemas in sync during Plan A**: Every Phase A1 type addition (`screen_type`) must
   include the corresponding Zod schema update in the same phase — not deferred to cleanup.
3. **Broader concern**: The `as T` cast in `yaml-utils.ts:25` defeats the purpose of having
   schemas. Consider wiring Zod validation into the parse path, or adding `.passthrough()` to
   prevent future stripping if schemas remain documentation-only.

### HIGH-1: Phase 3 (shared layouts) is orthogonal and premature (VERIFIED — blast radius overstated)

**Confirmed:** `PagesSpec` is `{ version, pages }` (spec-types.ts:151-154). Adding `layout`
would change the schema shape.

**Blast radius claim OVERSTATED.** The claim that "every consumer needs updating" is only true
if `layout` is a REQUIRED field. If `layout?` is OPTIONAL, blast radius is near zero:

- **25+ files** consume `PagesSpec` or `pages.yaml`. All fall into 4 patterns:
  1. **Access `.pages` only** (e.g., `/pages/route.ts`, `design-page-all.ts`) — ignores other fields
  2. **Destructure then spread** (e.g., `/navigation/route.ts:83`: `{ ...spec, pages: updated }`) — preserves unknown fields automatically
  3. **Reconstruct from scratch** (e.g., `design-generate.ts:427`: `{ version, pages }`) — just omits optional field
  4. **Via `readSpecs()` abstraction** (e.g., `ux-planning.ts:280`) — `SpecFiles.pages` already typed as `PagesSpec | undefined`

- **"dashboard page registry"** (`page-registry.tsx`) is a UI component taking `pages: Page[]` prop — NOT a spec consumer. Does not read PagesSpec.

- **Zero consumers would break** from adding `layout?: LayoutDefinition[]` to `PagesSpec`.

**However, the "orthogonal and premature" assessment is CORRECT for different reasons:**

- Shared layouts introduce a **conceptual dependency on screen types** — layout regions
  (persistent header, sidebar) interact with how overlays render. A drawer opened over a
  page-with-sidebar has different layout constraints than a drawer over a full-width page.
  Screen types (Plan A) must be proven first to inform layout design.

- **From CRITICAL-3** (NavBar as pass-through): Plan B Phase B2 proposes teaching the LLM to
  generate NavBar children — but CRITICAL-3 confirmed the planning LLM already decomposes
  NavBar into child nodes (`NavLogo`, `NavItemHome`, etc. with `navigateTo`). The remaining
  gap is Stage 3 (design agent), which is the same gap blocking screen types (CRITICAL-1).
  Shared layouts depend on fixing the LLM chain first.

- **From CRITICAL-1** (LLM chain): Shared components in a layout would need `navigateTo`
  propagated through all 3 LLM stages. Stage 3 is currently broken for navigation. Fixing
  Stage 3 is Plan A prerequisite work — layout work should not start until that's proven.

- **From CRITICAL-4** (Zod schemas): Adding `layout` to `PagesSpec` would require updating
  `PagesSpecSchema` — but since schemas are dead code (never called at runtime), this is a
  consistency concern, not a blocker. When the schema gap is fixed (CRITICAL-4 action), the
  layout schema should be included.

**Action**: Separate into Plan B (correct). Reason: not blast radius, but conceptual dependency
on screen types and LLM chain fixes from Plan A. Implement after Plan A proves screen types
end-to-end and Stage 3 of the LLM chain is fixed.

### HIGH-2: Phase 6 has no accessibility implementation (VERIFIED — accurate, partial precedent exists)

**Confirmed:** Phase 6 plan omits all major WCAG 2.1 modal requirements except backdrop and
close button.

**WCAG commitment verified:** `design-generate.ts:176` sets `wcag_level` (default `'AA'` per
`archetypes.ts:221`), but it is **captured, not enforced** — the value flows into the LLM prompt
context but no code validates generated designs against WCAG requirements.

**Partial precedent exists in the dashboard:** `packages/dashboard/src/components/ui/modal.tsx`
(lines 18-95) already implements:
- `role="dialog"` + `aria-modal="true"` (line 54-55)
- Escape key handling via `document.addEventListener('keydown')` (line 26)
- `aria-label="Close"` on close button
- Backdrop click-to-close with `aria-hidden="true"` on backdrop

**Still missing from dashboard Modal (and omitted from Phase 6 plan):**
- Focus trapping (Tab key not intercepted — focus escapes to background)
- Focus restoration (no tracking of trigger element)
- `inert` attribute on background content
- Native `<dialog>` not used (custom div-based implementation)

**Connections to previous issues:**

- **From CRITICAL-2** (corrected enum `page | modal | drawer | sheet`): Each screen type needs
  type-specific a11y. Modals need `aria-modal` + focus trapping. Drawers need `aria-label`
  describing the panel. Sheets need swipe-to-dismiss with `aria-expanded`. The a11y
  implementation must branch on CRITICAL-2's enum values.

- **From CRITICAL-1** (source-side navigation): Focus restoration after overlay close must
  return to the source node that triggered navigation. This node ID is already available via
  `NavigationTarget.source_node` from the source-side chain — no `trigger_from` needed.

**Action**: Use native `<dialog>` with `showModal()` — provides focus trapping and Escape
handling for free. Reuse pattern from dashboard's `modal.tsx` for `role="dialog"` and
`aria-modal`. Add `inert` on background container and focus restoration using the source
node from the navigation binding. Make a11y deliverables explicit per screen type in Phase A4.

### HIGH-3: No data flow diagram for screen_type propagation (VERIFIED — accurate but incomplete)

**All 9 claimed touchpoints verified against code:**

| # | Touchpoint | File | Current State |
|---|------------|------|---------------|
| 1 | `PageEntry.screen_type` | `spec-types.ts:136-148` | MISSING (needs adding) |
| 2 | `design-generate.ts` | `design-generate.ts:34-43` | EXISTS — `GeneratedPage` has no `screen_type` |
| 3 | `viewport-resolver.ts` | `viewport-resolver.ts:26-33` | EXISTS — `ResolveViewportsInput` has no `screenType` param |
| 4 | UX planning prompt | `ux-planning.ts:60-69` | EXISTS — receives `pageContext` which includes `PageEntry` |
| 5 | `DesignSpecV2.screenType` | `design-spec-v2.ts:121-128` | MISSING (needs adding) |
| 6 | `PrototypeScreen.screenType` | `prototype-manifest.ts:10-16` | MISSING (needs adding) |
| 7 | `PrototypeApp.tsx` overlay | `PrototypeApp.tsx:56-104` | Page-only nav (full replacement), no overlay logic |
| 8 | `NavigationEditor.tsx` mode | `navigation-editor.tsx:1-205` | EXISTS but no mode selector UI |
| 9 | `/api/navigation` route | `navigation/route.ts:26-86` | EXISTS — GET/PUT work, no `mode` field |

**Flow is accurate but missing steps:**

- **Step 3.5 (missing)**: A loader function is needed to copy `screen_type` from `pages.yaml`
  → `PrototypeScreen.screenType` in the prototype manifest. Currently no code bridges this.

- **Step 4.5 (missing)**: `NavigationTarget` in `pages.yaml` needs an optional `mode` field to
  persist overlay vs page-replace decisions from the dashboard.

**Connections to previous issues:**

- **From CRITICAL-1** (3-stage LLM chain): The data flow must integrate with the LLM chain.
  `screen_type` originates at Stage 1 (`design:generate`), must influence Stage 2 (planning —
  to exclude NavBar for overlays per HIGH-4), and Stage 3 (design agent — to set
  `DesignSpecV2.screenType`). Stage 3 is currently broken for `navigateTo` propagation. The
  same Stage 3 fix needed for navigation is also needed for `screenType`.

- **From CRITICAL-4** (Zod schemas): Step 1 (`PageEntry.screen_type`) requires a Zod schema
  update to `PageEntrySchema`. Since schemas are dead code, this is consistency work — but
  must be done in the same phase per CRITICAL-4's action.

- **From CRITICAL-2** (corrected enum): All 9 steps must use the corrected
  `'page' | 'modal' | 'drawer' | 'sheet'` enum — not `'overlay'`.

**Action**: The data flow diagram provided in the plan's "Data Flow Diagram" section (lines
498-517) addresses this gap. Verify during implementation that each step is wired by running
screen_type end-to-end: set `screen_type: 'drawer'` in pages.yaml → confirm viewport resolves
to 320 → confirm PrototypeApp renders overlay. Add the missing step 3.5 (manifest loader).

### HIGH-4: Missing LLM design prompt context for overlay screens (VERIFIED — 100% valid, real example found)

**Confirmed with live codebase evidence.** The vulnerability is real and demonstrated by an
existing fixture.

**Real example:** `notifications-panel` in claim-filling sample (`pages.yaml:180-209`) is
described as "Slide-over panel triggered by the bell icon" but:
- Has `viewports: [1440]` (full desktop width)
- Includes `NavigationHeader` in its component list
- Would render as a full-page design, not a panel

**Prompt analysis — zero overlay awareness across all LLM prompts:**

| Prompt | File:Lines | Overlay Awareness |
|--------|-----------|-------------------|
| Page context | `page-context-prompt.ts:16-92` | None — same format for all pages |
| Planning system | `ux-planning-system.md:1-193` | None — assumes page-level design |
| Design system | `ux-penpot-design-system.md:1-350` | Mentions "overlay" only for elevation tokens |
| Design agent | `ux-penpot-design.ts:437-456` | Injects `Viewport Width: Npx` with no semantic context |

**The core problem:** Setting viewport to 320px is indistinguishable from a mobile breakpoint.
The LLM will generate a 320px mobile-responsive full page (with NavigationHeader, sidebar
stacked, etc.) instead of a drawer panel with only content + close button.

**Connections to previous issues:**

- **From CRITICAL-1** (3-stage LLM chain): Screen type context must be injected at all 3 stages:
  - Stage 1 (`design:generate`): LLM decides screen_type and writes to pages.yaml
  - Stage 2 (planning): Must exclude NavigationBar/sidebar components for non-page types
  - Stage 3 (design agent): Must set `DesignSpecV2.screenType` and design within panel constraints
  Stage 3 is the same blocker as for `navigateTo` — the design agent prompt needs updating.

- **From CRITICAL-2** (corrected enum + heuristics): The `design:generate` prompt must include
  classification heuristics per CRITICAL-2:
  - `page` — default; direct navigation targets (dashboard, settings)
  - `modal` — confirmation flows, focused forms, detail views
  - `drawer` — auxiliary panels from persistent UI (notifications, filters)
  - `sheet` — mobile-oriented bottom content (share menu, action picker)
  Without these heuristics, the LLM will default everything to `page`.

- **From CRITICAL-3** (NavBar as pass-through): The planning LLM already decomposes NavBar into
  child nodes. When `screen_type` is not `page`, the planning prompt must instruct: "Do NOT
  include NavigationBar or its children in the component tree for this screen."

**Action**: When `screen_type` is modal/drawer/sheet, inject into both planning and design prompts:
- "This is a [drawer/modal/sheet], not a full page."
- "Do NOT include page-level navigation (NavigationBar, sidebar, footer)."
- "Design only the panel content within [N]px width."
- "Include a close/dismiss affordance (X button for modal/drawer, drag handle for sheet)."
Add this to Phase A3 (not Phase A4) since the prompt context must be ready before design runs.

### MEDIUM-1: Phase ordering is suboptimal (VERIFIED — already resolved by Plan A/B split)

**Original concern was valid:** The original plan interleaved complex orthogonal work (Phase 3
Layout, Phase 5 NavBar) between the basic screen type flow (Phases 1→2→4→6).

**Already resolved.** The Plan A/B split (proposed earlier in this review) reorders to:
`A1 (Types) → A2 (Generate) → A3 (Viewport+Prompt) → A4 (Overlay Render) → A5 (Dashboard) → A6 (E2E Tests)`

This is a linear dependency chain with no rework risk:
- A2 depends on A1 (`GeneratedPage` uses types from A1)
- A3 depends on A2 (`viewport-resolver.ts` reads `screen_type` from A2's output)
- A4 depends on A3 (rendering needs viewport + manifest with screenType)
- A5 is independent of A4 (dashboard editor consumes types from A1, not rendering)
- A6 depends on all (E2E tests verify complete flow)

Complex features (shared layouts, NavBar generation) are deferred to Plan B, which only starts
after Plan A proves screen types end-to-end.

**Action**: No further reordering needed. Plan A's phase sequence is correct.

### MEDIUM-2: Default widths don't match industry standards (VERIFIED — already resolved by CRITICAL-2)

**Original concern was valid:** `overlay=400` didn't map to any standard design system type.

**Already resolved.** CRITICAL-2 eliminated `overlay` from the enum and its 400px default.
The revised Plan A Phase A3 uses:

| Screen Type | Default Width | Industry Validation |
|-------------|--------------|---------------------|
| `page` | 1440 (existing) | Standard desktop |
| `modal` | 560 | MD3 Dialog, Bootstrap Modal md (600) |
| `drawer` | 320 | MD3 Side Sheet (280-320dp range) |
| `sheet` | full width | MD3 Bottom Sheet (100% width, height-constrained) |

No non-standard values remain. The `overlay_width` configuration field was also dropped in
favor of convention-over-configuration (width derived from `screen_type` in viewport resolver).

**Action**: No further changes needed. Values are industry-standard.

### MINOR-1: Shadow fields in YAML not addressed (VERIFIED — accurate, scope larger than claimed)

**Confirmed.** All three claimed shadow fields exist in ALL pages.yaml files and are **written
by runtime code**, not manually added:

| Shadow Field | Written By | Values Found |
|-------------|-----------|--------------|
| `designStatus` | Dashboard API routes (`pages/route.ts:77`, `design/route.ts:178,235,340`) | `"draft"`, `"rendering"`, `"rendered"`, `"approved"` |
| `correctionIteration` | Design pipeline (`design/route.ts:179,645`) | `0` (integer) |
| `designScore` | Design evaluator (`design/route.ts:341,893`) | `null` |

**Additional shadow field discovered:** `dataSources` (camelCase) in
`fixtures/claim-filling-sample/` contains arrays of objects (`{ endpoint, description }`)
— a different shape than the interface's `data_sources?: readonly string[]`. This is both
a naming AND schema mismatch.

**Why shadow fields persist:** YAML read path uses raw `parse(content) as T` (both in
`yaml-utils.ts:25` and `project-reader.ts:87`). No Zod validation strips unknown fields.
Dashboard API routes write these fields via spread operator (`{ ...page, designStatus: ... }`)
which preserves them through read-modify-write cycles.

**Connections to previous issues:**

- **From CRITICAL-4** (Zod schemas are dead code): The shadow fields exist BECAUSE there's no
  runtime validation. If `PageEntrySchema` were wired into the read path, these fields would
  be stripped (no `.passthrough()`). This is the same root cause — the `as T` cast in
  `yaml-utils.ts:25` lets any field through.

- **From CRITICAL-2** (correct enum): Adding `screen_type` via the dashboard API routes will
  use the same spread pattern (`{ ...page, screen_type: 'drawer' }`). Unlike the shadow fields,
  `screen_type` WILL be in the TypeScript interface — but the pattern shows that interface
  compliance is not enforced at runtime.

**Action**: Adding `screen_type` to the interface (Plan A Phase A1) does not compound the drift
because it IS typed, unlike the shadow fields. However, the shadow fields should be addressed
separately:
1. Add `designStatus`, `correctionIteration`, `designScore` to the `PageEntry` interface as
   optional fields — they are actively written by runtime code and must be typed.
2. Resolve `dataSources` vs `data_sources` naming inconsistency.
3. This is a prerequisite cleanup, not a blocker for Plan A — but should be tracked.

---

## Navigation Architecture: How Screen Types Interact with the LLM Chain

Understanding this is critical for correct Phase A4/A5 implementation.

```
THREE-STAGE LLM CHAIN (initial generation):

  Stage 1: App Spec LLM (design:generate)
  → pages.yaml with navigates_to entries
       ↓ read by
  Stage 2: Planning LLM (ux-planning)
  → ComponentTreeNode.navigateTo on specific components
  ✅ WORKS: navigateTo survives despite schema omission (4/19 components, live-validated)
  ⚠ RECOMMENDED: add navigateTo to PLANNING_OUTPUT_SCHEMA for reliability
       ↓ should flow to
  Stage 3: Design LLM (design agent)
  → NodeSpec.navigateTo in designspec-v2.json
  ⚠ NOT YET VALIDATED: design prompt has no navigateTo instructions
       ↓ extracted by
  extractNavigationFromSpecs()
  → NavigationBinding[] in prototype.json

  CURRENT FALLBACK (masks the broken chain):
  extractNavigationFromSpecs() returns 0 bindings
       ↓
  analyzeNavigation() LLM fallback
  → guesses navigation from screen summaries

  POST-GENERATION USER CORRECTION:
  User edits pages.yaml navigates_to or uses NavigationEditor
       ↓
  /api/prototype route injects into manifest

  MERGE (when both sources produce bindings):
       ↓
  DesignSpecRenderer builds navMap:
    1. External bindings (manifest) loaded first
    2. Inline navigateTo overwrites (LLM wins)
                  ↓
  onClick → onNavigate(targetScreenId)
                  ↓
  PrototypeApp checks target's screenType:
    'page'   → full screen replacement (existing behavior)
    'modal'  → centered overlay with backdrop
    'drawer' → right-aligned slide-in panel
    'sheet'  → bottom-aligned panel
```

**Key insight**: The `mode` field on `NavigationBinding` is DERIVED, not user-set. When the manifest is built, if the target screen has `screenType !== 'page'`, set `mode: 'overlay'`. The NavigationEditor can display this and allow override (user forces a drawer to open as full-page), but the default comes from the target's screen_type.

**Conflict resolution for screen types**: If the user navigates to a target that has `screen_type: 'drawer'` in pages.yaml but the NavigationBinding has `mode: 'navigate'` (user override), respect the user override. The `mode` on the binding takes precedence over the target's screen_type for rendering decisions.

---

## Recommended Plan: Split into A and B

### Plan A: Screen Types End-to-End (ship first)

Goal: Define a page as `screen_type: drawer`, have it designed at 320px with appropriate LLM instructions, see it rendered as an overlay in the prototype, and edit its navigation mode in the dashboard.

### Plan B: Shared Layouts & NavBar Generation (ship after A)

Goal: Define shared layout regions (persistent header, sidebar) reused across pages. Teach the LLM to generate NavBar children with proper navigation bindings.

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
- `packages/agents-ux/src/ux-planning/ux-planning.ts` — overlay-specific planning instructions + add `navigateTo` to `PLANNING_OUTPUT_SCHEMA` (currently survives despite schema omission, but must be declared for reliability)
- `packages/agents-ux/src/ux-design/ux-penpot-design.ts` (or the V2 design agent prompt) — **Stage 3 LLM chain fix**: update design agent prompt to propagate `ComponentTreeNode.navigateTo` to `NodeSpec.navigateTo` and set `DesignSpecV2.screenType` from page context. This is the same Stage 3 gap blocking both navigation and screen types (see CRITICAL-1).

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

**Verification**: Unit tests for all viewport priority combinations. `resolveViewports({ screenType: 'drawer' })` returns `[320]`.

### Phase A4: Prototype Overlay Rendering

**Files:**
- `packages/designspec-renderer/src/renderer/browser/app/src/PrototypeApp.tsx` — overlay rendering path
- `packages/designspec-renderer/src/renderer/browser/app/src/globals.css` — overlay/modal styles
- Build manifest utility (wherever `PrototypeManifest` is constructed) — pass screenType to PrototypeScreen

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
/* Z-index scale */
:root {
  --z-overlay-backdrop: 1040;
  --z-overlay: 1050;
}

/* Overlay backdrop */
.overlay-backdrop { ... }

/* Slide-in animation for drawers */
@keyframes slide-in-right { ... }

/* Scale-up animation for modals */
@keyframes scale-up { ... }
```

**Verification**: Click a nav-hotspot bound to a drawer → drawer slides in from right. Press Escape → closes. Tab cycles within drawer only. Focus returns to trigger.

### Phase A5: Dashboard Navigation Editor

**Files:**
- `packages/dashboard/src/components/design/navigation-editor.tsx` — show screen type badge, auto-set mode
- `packages/dashboard/src/app/api/navigation/route.ts` — persist mode field

**Changes:**
- Show screen type badge next to each target: `[drawer]`, `[modal]`, `[sheet]`
- Auto-set `mode: 'overlay'` when target has `screen_type !== 'page'`
- Allow manual override (user can force a modal to navigate as full-page)
- Display mode in binding row: "[trigger] → [target] (overlay)" or "(navigate)"

**Verification**: Dashboard shows mode for each binding. Changing mode persists and is reflected in prototype.

### Phase A6: E2E Tests + Cleanup

**Files:**
- `e2e/prototype-overlays.spec.ts` — Playwright E2E tests
- Remove debug `console.log` from DesignSpecRenderer.tsx and PrototypeApp.tsx
- Update `docs/architecture/design-pipeline-dataflow.md` per mandatory checklist

**E2E test scenarios:**
1. Load prototype with a drawer screen → drawer renders at correct width
2. Click nav-hotspot bound to drawer → drawer slides in
3. Press Escape → drawer closes, previous page visible
4. Click backdrop → drawer closes
5. Tab within modal → focus trapped
6. Screen-to-screen page navigation still works (no regression)

**Verification**: `npx nx run-many -t typecheck` zero errors. `npx nx run-many -t test` all pass. `npx playwright test` all pass.

---

## Plan B: Shared Layouts & NavBar Generation (separate, after Plan A)

Deferred because of conceptual dependency on screen types and LLM chain fixes from Plan A. Shared layout regions interact with how overlays render (drawer over page-with-sidebar vs full-width page), and the LLM chain Stage 3 fix needed for `navigateTo` propagation is the same fix needed for shared components. Blast radius is near-zero (optional field per HIGH-1 analysis), but Plan A must prove screen types end-to-end first.

### Phase B1: Shared Layout Schema
- Add `layout` section to `PagesSpec` with `shared_components: string[]` and optional `regions`
- Update all consumers of `PagesSpecSchema`
- Update Zod schema

### Phase B2: LLM-Generated NavBar Children
- Update UX planning prompt: "For NavigationBar, generate explicit child nodes (logo, nav-links, bell icon-button, avatar) as separate NodeSpec entries with `parent` pointing to the navbar node. Set `navigateTo` on interactive children."
- No renderer changes — pass-through NavBar already renders children

### Phase B3: Cross-Screen Layout Consistency
- Design coherence checker to validate shared components have consistent dimensions/styles across pages

---

## Data Flow Diagram (screen_type propagation)

```
pages.yaml (PageEntry.screen_type)
    ↓ read by
design-generate.ts (LLM decides screen_type per page)
    ↓ written to
pages.yaml (persisted)
    ↓ read by
viewport-resolver.ts (derives width: drawer→320, modal→560)
    ↓ width passed to
ux-planning.ts (adds overlay-specific prompt instructions)
    ↓ output includes
designspec-v2.json (DesignSpecV2.screenType field)
    ↓ read by
build-manifest.ts (copies to PrototypeScreen.screenType)
    ↓ manifest loaded by
PrototypeApp.tsx (decides: page-replace vs. overlay render)
    ↓ also read by
NavigationEditor.tsx (shows mode badge, auto-sets overlay mode)
    ↓ persists via
/api/navigation (mode field in NavigationBinding)
```

---

## Long-Term Vision: How This Evolves

### Code Generation (future)
`screen_type` maps directly to React/Next.js patterns:
- `page` → route page component (`app/dashboard/page.tsx`)
- `modal` → parallel route or portal-rendered dialog component
- `drawer` → state-controlled side panel with AnimatePresence
- `sheet` → mobile-optimized bottom sheet component

### Responsive Adaptation
Different screen types behave differently at breakpoints:
- Modals → full-screen covers below 640px
- Drawers → bottom sheets on mobile
- Sheets → remain bottom-anchored but expand to full height
- These rules can be encoded in design tokens and the code generator emits appropriate media queries

### Design System Compliance
Screen_type enables the LLM to apply MD3/iOS HIG patterns automatically:
- Modal on MD3: "dialog" with 24dp rounded corners and scrim
- Drawer on MD3: "side sheet" with specific elevation
- This mapping lives in the component catalog, keyed by screen_type

### Interactive Prototyping Fidelity
With overlays, prototypes become realistic enough for user testing:
- Bell icon → notifications drawer slides in from right
- "Delete" button → confirmation modal appears centered
- Settings gear → settings drawer opens
- These are fundamentally different from page-to-page navigation

### Cross-Platform Renderer (future)
`screenType` maps to platform-native navigation:
- React Native: `Modal` component, `BottomSheet`
- Flutter: `showModalBottomSheet`, `Drawer`
- SwiftUI: `.sheet`, `.fullScreenCover`
- The renderer adapts per platform; the spec stays the same
