# Screen Types Plan B: Shared Layouts & NavBar Generation

## Status: READY — Research Complete, Phases Revised

Plan A phases A1-A4 are complete (screen types, viewport resolution, overlay rendering all proven). Plan B is unblocked. Research (2026-04-20) resolved all open questions and revised the phases based on codebase analysis and industry pattern study.

**Dependency:** Plan A phases A5-A6 (navigation editor UI, E2E tests) can proceed in parallel with Plan B.

## Progress

- [x] Phase B0: Fix Prerequisites (duplicate pages + navigateTo propagation) — B0a + B0b implemented 2026-04-20; B0b E2E on designspec/manifest skips when `.agentforge/previews` absent (gitignored); observational log test still `fixme`
- [x] Phase B1: Chrome Pass — Design Shared Components Once (2026-04-20: `resolveSharedComponents`, `designChromeComponents`, frozen merge, `shared-chrome.json`; ADR-039)
- [x] Phase B2: LayoutShell — Persistent Chrome in Prototype (2026-04-20: `SharedChromeSpec`, `filterSpecToNodes`/`stripChromeFromSpec`, `LayoutShell`, pseudo-screen + duplicate-chrome + persistent-overlay scrubbing in `/api/prototype`; `@b2` Playwright green. Visual regressions surfaced during manual verification were fixed with unit tests only — see Phase B2.5 for the Playwright backlog that should have caught them.)
- [ ] Phase B2.5: Integration Validation & Regression Hardening — full-loop E2E, visual prototype correctness, single-screen chrome consistency
- [ ] Phase B3: Layout-Aware Code Generation (future — informs B1/B2 decisions)

---

## Agent Guardrails — READ FIRST

These rules are **non-negotiable**. They apply to every session that touches this plan. If a rule conflicts with something you'd "normally" do, the rule wins.

### 1. Source-of-truth hierarchy

1. `CLAUDE.md` + `AGENTS.md` — project-wide rules (full test suite, PRD, ADRs).
2. `.claude/rules/karpathy-guidelines.md` — think before coding, surgical changes, simplicity.
3. This plan — phase-specific decisions. If you disagree, write an ADR before diverging.
4. TypeScript types in `packages/core/src/types/` — field-level truth (ADR-038).

**Before coding:** read `docs/lessons-learned.md` and the phase's "Acceptance Criteria" section below. Do not start Phase BN until Phase BN-1's Acceptance Criteria are green.

### 2. No mocks in production code — EVER

- Mocks live **only** in files matching `*.test.ts`, `*.spec.ts`, or `__tests__/**`.
- Do **not** introduce fake LLM providers, fake filesystems, or stub responses in `src/` paths.
- Do **not** hardcode "for now" values, placeholder strings, or `// TODO` markers. If a field needs a value, derive it; if it can't be derived, fail loudly with a `Result<never>` error.
- `as any`, `@ts-ignore`, `@ts-expect-error` are banned in production code. If the types fight you, fix the types.

### 3. No shortcuts, no regressions

- After every change run both: `nx run-many -t typecheck` and `nx run-many -t test`. Zero failures before declaring done. No "pre-existing" excuses (see `CLAUDE.md`).
- When changes touch the dashboard, API routes, or renderer: also run `npx playwright test` from repo root. All E2E tests must pass.
- If you must deviate from this plan, write an ADR at `docs/adrs/ADR-NNN-plan-b-<topic>.md` before committing.
- Dead code from your changes is **your** dead code — remove it. Do not touch pre-existing dead code.

### 4. Testing integrity

- Every behavioural change ships with a test that would have caught the bug.
- Unit tests live next to code (`foo.ts` → `foo.test.ts`) or in `__tests__/`. E2E lives in `e2e/`.
- Playwright tests must exercise the real server / real renderer / real iframe bridge. No `page.evaluate` shortcuts that bypass the production code path.
- **Bugs found via manual browser inspection require a Playwright regression test, not just a unit test.** A passing helper test proves the helper works; only a Playwright test proves the user-visible bug is fixed. If the bug does not map to an existing `@bX` tag, add it to Phase B2.5 under the appropriate `@b2.5-*` tag (see that section's backlog).
- The acceptance-criteria E2E file is `e2e/screen-types-plan-b.spec.ts`. Each phase turns one or more `test.fixme()` entries into a passing `test()`. Do not delete a fixme — flip it.
- Acceptance criteria at the **invariant** level (mountId persists, chrome spec exists) are necessary but not sufficient. When a phase renders anything the user sees, add at least one **visual** assertion (element count, visible/hidden, computed style on a specific selector) alongside the invariant check.

### 5. Browser-first debugging (dashboard / renderer work)

- Phase B2 and anything touching `PrototypeApp.tsx` / `main.tsx` / `iframe-bridge.ts`: verify with Chrome DevTools MCP before declaring done. Screenshot a hard refresh (Vite port 4100, Next port 3000) to confirm the fix.
- Do **not** guess at renderer behaviour. Open the prototype iframe in the dashboard, click, observe.

### 6. Surgical scope

- Every changed line must trace to a phase requirement in this document.
- Do not "improve" adjacent code. Do not refactor `page-context-prompt.ts` when you're touching `penpot-v2-pipeline.ts`. If you notice a wart, file a one-line note in `docs/lessons-learned.md` and move on.
- If the diff grows past ~400 lines for a phase, stop and ask — it likely means the plan is wrong or scope is leaking.

### 7. Data-driven configuration

- Screen-type widths, catalog positions, region heuristics: all data-driven (YAML / catalog / resolver functions). No `if (name === 'TopBar') return 'header'` chains anywhere except inside `resolveSharedComponents()` regex fallback (which is explicitly documented as a heuristic of last resort).

### 8. ADR on every real decision

Any time you pick one of two approaches that are both defensible — ADR. Any time you deviate from this plan — ADR. Format: `docs/adrs/ADR-NNN-short-title.md`. Reference the ADR from the code comment that enacts the decision.

## Goal

Design shared chrome components (TopBar, NavigationTabs, Sidebar) **once** and inject them as immutable constraints into each page's design pass. Render them persistently in the prototype via a LayoutShell wrapper. Fix the navigateTo data loss in Stage 4 with prompt improvements + programmatic validation.

## Session Boundaries (recommended)

| Session | Phases | Why |
|---------|--------|-----|
| 1 | B0 (both parts) | Small, tightly coupled prerequisites — unblocks everything |
| 2 | B1 | Core orchestration change — Chrome Pass + resolveSharedComponents |
| 3 | B2 | Standalone renderer work — LayoutShell + spec splitting |
| 4 | B2.5 | Playwright regression backlog — no product change; turns manual/unit-only fixes into real E2E guards. Small route addition (`POST /api/design/generate-all`) MAY be needed for `@b2.5-full-loop`; scope separately if so. |

---

## Evaluation & Findings (2026-04-20)

This section documents a deep evaluation of Plan B against the current codebase state. All open questions have been resolved — see "Research Conclusions" below. Every decision made during implementation should be documented as an ADR in `docs/adrs/`.

---

### The Three Core Problems Plan B Addresses

#### Problem 1: Every page designs its own chrome independently

The `design-page-all` orchestrator (`packages/cli/src/commands/design-page-all.ts`) runs a 3-stage parallel pipeline:

```
Research (parallel, up to 3)  ->  Planning (parallel, up to 3)  ->  Design (parallel, up to 2)
```

Each page goes through all 3 stages independently. The fixture `pages.yaml` shows TopBar and NavigationTabs listed on all 3 approved pages (dashboard, add-expense, spending-insights). Each page's planning agent generates its own component tree with its own TopBar and NavigationTabs — same components, potentially different dimensions, colors, and typography.

**Why this happens:** The Research and Planning stages receive NO cross-page context. Only the Design stage gets `pageContext` via `buildPageContext()` (`page-context-prompt.ts:111-141`), which includes all sibling pages. But even there, the context is informational ("here are the other pages") — not prescriptive ("use this exact TopBar spec from the dashboard design").

**Existing shared component detection:** `page-context-prompt.ts:60-69` counts how many pages each component appears on:
```typescript
const componentCounts = new Map<string, number>();
for (const page of ctx.allPages) {
  for (const comp of (page.components ?? [])) {
    componentCounts.set(comp, (componentCounts.get(comp) ?? 0) + 1);
  }
}
const sharedComponents = [...componentCounts.entries()]
  .filter(([, count]) => count > 1)
  .map(([name, count]) => `${name} (appears on ${count} pages)`);
```
This tells the LLM "TopBar appears on 3 pages" but doesn't give it the TopBar's actual spec from a previous page's design.

#### Problem 2: NavigationBar children flatten to overrides (Stage 3 gap)

The Planning LLM (Stage 3) correctly decomposes NavigationBar into child nodes:
```json
{
  "name": "NavigationBar",
  "children": [
    { "name": "NavLogo", "props": ["src"] },
    { "name": "NavItemHome", "navigateTo": "dashboard" },
    { "name": "NavItemExpenses", "navigateTo": "add-expense" },
    { "name": "NavItemInsights", "navigateTo": "spending-insights" }
  ]
}
```

The Design LLM (Stage 4) must convert this hierarchical tree to a flat adjacency list (DesignSpecV2). The design prompt (`ux-penpot-designspec-v2.md`) describes the flat format but provides:
- No algorithm for flattening hierarchical trees
- No worked example mapping planning nodes to flat DesignSpec nodes
- No explicit rule for preserving `navigateTo` during flattening

The instruction at `penpot-v2-pipeline.ts:550-553` says:
```typescript
userMessageParts.push(`When the planning output contains componentTree nodes with "navigateTo" fields, 
  you MUST copy those "navigateTo" values to the corresponding DesignSpec nodes.`);
```

But "find the matching node" is ambiguous when node IDs change between planning (component names) and design (kebab-case IDs). The LLM frequently drops `navigateTo` during this conversion. The design evaluator (`design-evaluator.ts:14-256`) uses vision-based screenshot analysis and cannot detect missing behavioral metadata. The correction loop only fixes visual issues — lost `navigateTo` fields are never recovered.

See "Stage 3 Gap: Full Technical Analysis" below for the complete data flow trace.

#### Problem 3: No persistent chrome in the prototype

The renderer has two modes:
1. **Single-screen** (`main.tsx:76`): Renders one `DesignSpecRenderer` with one spec
2. **Prototype** (`main.tsx:46-60`): Renders `PrototypeApp` which manages screen state

`PrototypeApp` (`PrototypeApp.tsx:198-256`) swaps the ENTIRE screen on navigation — including TopBar and NavigationTabs. There's a visible flash as the new page's TopBar replaces the old one. In a real app, chrome persists and only the content area transitions.

---

### Research Conclusions (2026-04-20)

Research resolved the open questions from the original evaluation. Each decision below replaces a "needs further research" item.

#### Decision 1: Auto-derive layout, do NOT add a declarative schema (replaces B1)

**Research found:** The original B1 proposed adding `layout?: { regions?, shared_components? }` to `PagesSpec`. Research identified five problems with this:
- Zero consumers exist — no pipeline stage reads `layout`
- Duplicates existing detection at `page-context-prompt.ts:60-69`
- Position is already encoded in the component catalog (`category: 'layout'` on NavigationBar, Sidebar, Footer)
- Responsive behavior belongs in the planning agent's responsive rules, not in a static schema
- The 16 duplicate draft pages make any "all pages" intersection produce empty results

**Decision:** Build `resolveSharedComponents()` that derives layout from existing data:
1. Count component appearances across `status: 'approved'` pages (reuse logic from `page-context-prompt.ts:60-69`)
2. Filter to components appearing on ALL page-type screens
3. Derive position from catalog `category: 'layout'` + name heuristics (nav/header/top → header, sidebar → sidebar, footer/tab/bottom → footer)
4. Return a `SharedChrome` object consumed by the Chrome Pass and LayoutShell

If Stage 7 (code generation) later needs explicit layout data, serialize the derived output into the prototype manifest at that point. Do not create schema ahead of consumer.

#### Decision 2: Design chrome once via Chrome Pass (replaces B3 coherence checker)

**Research found:** Industry tools universally use "design once, compose everywhere":
- **Figma:** Inherited prototype connections from main components — design NavBar once, instances inherit interactions
- **Next.js:** Persistent `layout.tsx` wrapping `{children}` — layout renders once, only page content swaps
- **Storybook:** Global decorators wrap all stories with shared layout
- **Locofy/FigmaForge:** Convert Figma component to code once, reuse through import

No major tool re-generates chrome per page then checks consistency afterward. Plan B's coherence checker (B3) detects drift but can't fix it — the only correction is re-running the full design pipeline. Prevention beats detection.

**Decision:** Add a Chrome Pass step to `design-page-all.ts` orchestration:
```
Stage 1: Research all pages (parallel)
Stage 2: Plan all pages (parallel)
Stage 2.5: Chrome Pass (NEW)
  - resolveSharedComponents() identifies shared chrome
  - Pick first approved page as reference
  - Design ONLY the shared chrome components for reference page
  - Save as shared-chrome.json
Stage 3: Design all pages (parallel)
  - Each page receives shared-chrome.json as immutable constraint
  - AI designs only the content area; chrome is pre-filled
```

**Active tab state:** The shared chrome spec defines the NavBar structure. Each page's design pass sets the active tab state as an override. This mirrors Figma's main component + instance override model.

#### Decision 3: Fix navigateTo at Stage 4 with prompt + validation (replaces B2)

**Research found:** The original B2 targeted the planning prompt (Stage 3), but Stage 3 already works — the planning LLM correctly produces NavBar children with `navigateTo`. The break is at Stage 4:
- `penpot-v2-pipeline.ts:551-553` tells the AI "you MUST copy navigateTo values" but gives no ID mapping guidance
- Planning nodes are `NavItemHome`, design nodes become `tab-0` or `nav-item-home`
- No post-LLM check verifies navigateTo survived
- The evaluator is vision-only — missing navigateTo is invisible
- `analyzeNavigation()` LLM fallback silently masks the failure

**Decision:** Apply both prompt fix AND programmatic validation:

1. **Prompt fix:** Add a worked NavBar flattening example to `penpot-v2-pipeline.ts` (see Phase B0b below for exact content)
2. **Programmatic validation:** After extracting DesignSpec (line 626), compare navigateTo counts between planning output and DesignSpec output. Programmatically inject any missing ones by finding the best-matching node (by name similarity or catalog type)

The prompt fix teaches the AI to do it right. The validation catches cases where it doesn't. The `analyzeNavigation()` fallback remains as a tertiary safety net but should no longer be the primary mechanism.

#### Decision 4: LayoutShell wrapping PrototypeApp (new — not in original Plan B)

**Research found:** The PrototypeApp architecture supports a LayoutShell:
- DesignSpec uses a flat adjacency list — shared chrome nodes are direct children of root with self-contained subtrees
- Stripping shared nodes means removing them from `nodes` and updating root's children order — no orphan risk
- The overlay system (native `<dialog>`) is independent of the main content area
- No iframe bridge protocol change needed — spec splitting happens client-side at render time

**Decision:** Build `LayoutShell.tsx` wrapping PrototypeApp:
```
LayoutShell
  ├── Shared header (rendered from shared-chrome.json TopBar spec)
  ├── Content area (only this swaps on navigation)
  │   └── DesignSpecRenderer (page content without chrome nodes)
  ├── Shared footer (rendered from shared-chrome.json NavigationTabs spec)
  └── Overlay layer (overlays render on top of everything)
```

---

### Stage 3 Gap: Full Technical Analysis

This is the single most important technical issue blocking both Plan A and Plan B.

#### The Happy Path (intended flow)

```
Stage 3: Planning Agent (ux-planning.ts)
  Input:  PageContext with navigates_to from pages.yaml
  Prompt: "Add navigateTo to leaf-level interactive components"
  Output: ComponentTreeNode[] with navigateTo on buttons, tabs, nav items
  
  Example output:
  {
    name: "NavigationBar",
    children: [
      { name: "HomeTab", navigateTo: "dashboard", children: [] },
      { name: "ExpensesTab", navigateTo: "add-expense", children: [] }
    ]
  }
                    |
                    v
Stage 4: Design Agent (penpot-v2-pipeline.ts)
  Input:  Planning output (hierarchical tree with navigateTo)
  Task:   Convert to flat DesignSpecV2 nodes
  Output: Flat nodes with navigateTo preserved
  
  Expected output:
  {
    "nav-bar": { parent: "root", order: 0, catalog: "navigation-bar" },
    "home-tab": { parent: "nav-bar", order: 0, catalog: "tab", navigateTo: "dashboard" },
    "expenses-tab": { parent: "nav-bar", order: 1, catalog: "tab", navigateTo: "add-expense" }
  }
                    |
                    v
extractNavigationFromSpecs() (build-manifest.ts:87-116)
  Scans all nodes for navigateTo -> Creates NavigationBinding[] deterministically
                    |
                    v
PrototypeApp renders navigation hotspots on those nodes
```

#### Where It Actually Breaks

**Failure Point 1: No flattening algorithm in the design prompt.** The prompt (`ux-penpot-designspec-v2.md`) explains the flat format but never shows HOW to convert hierarchical trees to flat adjacency lists. The LLM must invent its own conversion strategy. Common failure modes:
- Flattens NavigationBar to a single node with `overrides: { nav_links: [...] }` — loses child structure entirely
- Creates flat nodes but forgets to copy `navigateTo` from the planning tree
- Maps component names to different node IDs, breaking the correspondence

**Failure Point 2: navigateTo instruction is aspirational, not enforced.** `penpot-v2-pipeline.ts:550-553` says "you MUST copy navigateTo values" but provides no ID mapping guidance. The planning tree has `HomeTab`, the design spec might have `home-tab`, `tab-0`, `nav-item-home`, or just `navigation-bar` (if flattened).

**Failure Point 3: Evaluator is vision-only.** `design-evaluator.ts:76-123` checks visual hierarchy, text presence, color, spacing. No mention of `navigateTo`. The correction loop takes screenshots and fixes visual issues. Missing `navigateTo` is invisible to screenshots.

**Failure Point 4: No post-generation validation.** After extracting the DesignSpec from the LLM's tool call (`penpot-v2-pipeline.ts:625-630`), there's no check comparing planning navigateTo count vs DesignSpec navigateTo count. Silent data loss.

#### Fix (decided — see Phase B0b)

Apply ALL of the following in Phase B0b:
1. **Prompt fix:** Add a worked NavBar flattening example to `penpot-v2-pipeline.ts` showing planning tree → flat spec with navigateTo preserved
2. **Post-LLM validation:** In `penpot-v2-pipeline.ts` after extracting DesignSpec, compare navigateTo counts between planning output and design output, programmatically inject missing ones
3. **Evaluator structural check:** Add navigateTo count check to `design-evaluator.ts` (non-vision)
4. Correction loop: navigateTo injection in fix 2 handles this — no separate correction needed

**Tradeoff resolved:** Use BOTH prompt fix (preserves LLM agency) AND programmatic validation (deterministic safety net). The prompt teaches the AI to do it right. The validation catches cases where it doesn't. This hybrid preserves LLM decision-making while guaranteeing correctness.

**Files involved:** `packages/agents-ux/src/ux-design/penpot-v2-pipeline.ts`, `packages/agents-ux/src/ux-design/design-evaluator.ts`

---

### Duplicate Pages Problem — Root Cause Confirmed

#### What the fixture looks like

`fixtures/personal-expense-tracker/agentforge/spec/pages.yaml`:
- 3 approved pages: `dashboard`, `add-expense`, `spending-insights` (fully specified)
- 16 draft pages: All named "A user settings page for profile and preferences" with random suffixes
- All 16 have identical name, description, route, and `navigates_to`
- None have `components` or `data_sources` — they're empty shells

#### Root cause (confirmed)

**`POST /api/pages`** (`packages/dashboard/src/app/api/pages/route.ts:42-84`) is the source. It generates unique IDs via `page-${slug}-${Date.now().toString(36)}` and **always appends** to pages.yaml without checking for duplicates by name, route, or description. Each time a user clicks "add page" in the dashboard for the same description, a new duplicate is created.

The `POST /api/spec/approve` endpoint **replaces** the entire pages.yaml (line 78: `writeYamlFile(..., { version: '1.0', pages: pagesWithDefaults })`), so it does NOT create duplicates. The `design-generate` CLI command also replaces, not appends.

#### Fix (Phase B0a)

1. Add deduplication by `route` in `POST /api/pages` before appending
2. Filter by `status: 'approved'` or `designStatus: 'rendered'` in `resolveSharedComponents()`
3. Clean up the fixture (remove 16 duplicate drafts)

---

### Component Catalog Interaction (resolved)

**The catalog already defines layout components.** `base-component-catalog.yaml` has:
- `NavigationBar` (category: layout): brand, nav_links, actions anatomy
- `Sidebar` (category: layout): menu items, sections, collapse behavior
- `Footer` (category: layout): links, copyright, social icons

**Resolution (Decision 1):** `resolveSharedComponents()` derives position from catalog `category: 'layout'` + name heuristics. No `LayoutRegion.position` field needed — the catalog IS the position source. This eliminates the duplication concern.

---

### Code Generation Gap (resolved — Phase B3)

**Resolution (Decision 1 + Phase B3):** The Chrome Pass (B1) produces `shared-chrome.json`. The `resolveSharedComponents()` output provides layout structure. Together these give the implementation agent everything it needs to generate `Layout.tsx` without a separate schema.

Path from design to code:
1. Chrome Pass → `shared-chrome.json` (shared chrome DesignSpecV2)
2. `resolveSharedComponents()` → regions with positions
3. Implementation agent → `app/layout.tsx` with `{children}` slot, rendering chrome from spec
4. Implementation agent → per-page `app/[route]/page.tsx` components

Framework target: React + Next.js (the codebase already uses this). Multi-framework support deferred.

---

### Renderer Architecture for Persistent Chrome (resolved — Phase B2)

The existing dashboard has a shell pattern (`dashboard-shell.tsx:1-102`) that serves as a proven reference:
```tsx
<div className="flex h-screen">
  <SidebarNav />
  <div className="flex-1 flex flex-col">
    <HeaderBar title={pageTitle} />
    <main className="flex-1 overflow-y-auto">{children}</main>
  </div>
</div>
```

**Resolution (Decision 4 + Phase B2):** Build `LayoutShell.tsx` wrapping PrototypeApp. Full implementation details in Phase B2 above.

**Resolved questions:**
- **Stripping shared nodes:** DesignSpecV2 is a flat adjacency list — shared chrome nodes are direct children of root with self-contained subtrees. Removing them from `nodes` and updating root's `children` order cannot orphan descendants. `filterSpecToNodes()` and `stripChromeFromSpec()` handle this.
- **Iframe bridge:** No protocol changes needed — spec splitting happens client-side at render time after specs are received through the bridge.
- **Overlay z-indexes:** Overlays use native `<dialog>` which creates its own stacking context — LayoutShell does not interfere.

---

## Implementation Phases

### Phase B0: Fix Prerequisites

Both parts can be done in parallel. Both are required before B1 or B2.

#### Phase B0a: Fix Duplicate Pages

**Files:**
- `packages/dashboard/src/app/api/pages/route.ts` — add deduplication in `POST` handler
- `fixtures/personal-expense-tracker/agentforge/spec/pages.yaml` — remove 16 duplicate drafts
- `packages/dashboard/src/app/api/pages/__tests__/route.test.ts` (new) — unit test for dedup
- `e2e/screen-types-plan-b.spec.ts` — flip `@b0a` fixme tests to passing

**Status-field contract (important):** The canonical `PageEntry` type (`packages/core/src/types/spec-types.ts:139`) has `status: string` but **no** `designStatus` field. The dashboard route defines its own inline `PageEntry` that adds `designStatus?: string`. For Plan B, treat `status === 'approved'` as the authoritative filter. `designStatus` is an optional UI concern owned by the dashboard — do not thread it through `resolveSharedComponents()`. If you need both, extend `PageEntry` in `spec-types.ts` and write an ADR.

**Changes:**

1. **Deduplicate in `POST /api/pages`** (`route.ts:42-84`). Before `pages.push(newPage)`:
   ```typescript
   const targetRoute = `/${slug}`;
   const existing = pages.find((p) => p.route === targetRoute);
   if (existing) {
     return NextResponse.json({ pageId: existing.id, description: existing.description }, { status: 200 });
   }
   ```
   Return **200 (not 201)** for idempotent dedup hits so callers can distinguish "created new" from "found existing". Do not mutate the existing page's description — it's user-authored.

2. **Clean the fixture.** Delete all 16 entries whose `id` starts with `page-a-user-settings-page-for-profile-and-pre-`. Keep the 3 approved pages (`dashboard`, `add-expense`, `spending-insights`) untouched. Update any `navigates_to.target` that points at a deleted id (today `dashboard` navigates to one of the drafts via SettingsDialog — rewrite to a placeholder `settings` page entry OR remove the `navigates_to` entry entirely and let the LLM regenerate; the safe choice is remove).

3. **Status filter in `resolveSharedComponents()`** (Phase B1 file, referenced here for coordination): filter pages to `status === 'approved'` before computing shared-component intersection. This guarantees the 16 draft duplicates can never pollute the result.

**Acceptance Criteria (all must be green before B0a is done):**
- `POST /api/pages` with `{ description: "X" }` twice returns status 201 then 200, with identical `pageId` in both responses.
- `pages.yaml` in the expense-tracker fixture contains exactly 3 entries (or the count you choose, as long as no `page-a-user-settings-...` drafts remain).
- `nx test dashboard` passes including the new `route.test.ts`.
- `npx playwright test e2e/screen-types-plan-b.spec.ts -g "@b0a"` passes.

**Verification commands:**
```bash
nx run-many -t typecheck
nx run-many -t test
npx playwright test e2e/screen-types-plan-b.spec.ts
```

#### Phase B0b: Fix navigateTo Propagation (Stage 4)

**Files:**
- `packages/agents-ux/src/ux-design/penpot-v2-pipeline.ts` — prompt improvement + post-LLM validation
- `packages/agents-ux/src/ux-design/design-evaluator.ts` — add navigateTo structural check

**Prompt fix — add worked example to `penpot-v2-pipeline.ts` (after line 553):**

```typescript
userMessageParts.push(`\n## NavigationBar Flattening Example

Planning output:
{
  "name": "NavigationBar",
  "children": [
    { "name": "HomeTab", "navigateTo": "dashboard" },
    { "name": "ExpensesTab", "navigateTo": "add-expense" },
    { "name": "InsightsTab", "navigateTo": "spending-insights" }
  ]
}

Required DesignSpec output:
{
  "navigation-bar": { "parent": "root", "order": 0, "catalog": "navigation-bar" },
  "home-tab": { "parent": "navigation-bar", "order": 0, "catalog": "tab", "label": "Home", "navigateTo": "dashboard" },
  "expenses-tab": { "parent": "navigation-bar", "order": 1, "catalog": "tab", "label": "Expenses", "navigateTo": "add-expense" },
  "insights-tab": { "parent": "navigation-bar", "order": 2, "catalog": "tab", "label": "Insights", "navigateTo": "spending-insights" }
}

CRITICAL: Each child becomes its own node with navigateTo copied exactly.
DO NOT flatten NavigationBar into a single node with overrides.`);
```

**Programmatic validation — add after line 631 (after `designSpec = extractResult.value`):**

```typescript
function validateNavigateTo(
  planningOutput: UXPlanningOutput,
  designSpec: DesignSpecV2,
): { missing: Array<{ componentName: string; target: string }> } {
  // Extract all navigateTo from planning component trees
  const planningNavTargets = new Map<string, string>();
  function walkTree(nodes: ComponentTreeNode[]) {
    for (const node of nodes) {
      if (node.navigateTo) planningNavTargets.set(node.name, node.navigateTo);
      if (node.children) walkTree(node.children);
    }
  }
  walkTree(planningOutput.componentTree);

  // Check which appear in DesignSpec
  const specNavTargets = new Set<string>();
  for (const node of Object.values(designSpec.nodes)) {
    if (node.navigateTo) specNavTargets.add(node.navigateTo);
  }

  const missing = [...planningNavTargets.entries()]
    .filter(([, target]) => !specNavTargets.has(target))
    .map(([name, target]) => ({ componentName: name, target }));

  return { missing };
}

// After extracting DesignSpec, inject missing navigateTo
const navValidation = validateNavigateTo(planningOutput, designSpec);
if (navValidation.missing.length > 0) {
  // Find best-matching nodes by name similarity and inject navigateTo
  for (const { componentName, target } of navValidation.missing) {
    const kebab = componentName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const match = Object.entries(designSpec.nodes).find(([id]) =>
      id.includes(kebab) || id.includes(target)
    );
    if (match) {
      (match[1] as Record<string, unknown>).navigateTo = target;
    }
  }
}
```

**Evaluator structural check — add to `design-evaluator.ts`:**
- After vision-based checks, add a non-vision check: count `navigateTo` fields in the DesignSpec vs expected from planning output. Deduct score points for missing navigation bindings. The check runs off the planning output stashed in the evaluator input — if planning output is not available, skip the check silently (do not error).

**Placement (exact):** In `penpot-v2-pipeline.ts`, `validateNavigateTo()` lives at module scope above `executePenpotDesignV2()`. The call site is immediately after `designSpec = extractResult.value;` (currently line 631). Mutating `designSpec.nodes[id]` is safe here because the spec has not yet been persisted or validated.

**Injection strategy (deterministic):** Match planning `componentName` → DesignSpec nodeId using this ordered rule set. Stop at the first match.
1. Exact kebab-case match: `NavItemHome` → `nav-item-home`.
2. Kebab-case match **within** a nodeId: any nodeId containing the kebab form.
3. Target-based match: any nodeId whose id contains the `target` screen id (e.g. id `tab-dashboard` for target `dashboard`).
4. Catalog-based match: if catalog is `tab` / `nav-item` / `link` / `button`, pick the first unmatched node of that catalog whose parent chain contains a `navigation-bar` catalog.

If nothing matches, log a `console.warn` **and** push the miss into the returned `missing` array so the evaluator can dock score. Do not silently drop.

**Acceptance Criteria:**
- New unit test `packages/agents-ux/src/ux-design/__tests__/validate-navigate-to.test.ts` covers all 4 match strategies + the "nothing matches" case.
- Running the design pipeline on the `personal-expense-tracker` fixture produces `designspec-v2.json` with `navigateTo` on at least the 3 NavigationTabs children (`dashboard`, `add-expense`, `spending-insights`). Verify by reading `.agentforge/previews/bookshelf-dashboard/scripts/designspec-v2.json`.
- `extractNavigationFromSpecs()` returns **≥ 3 bindings** from the fixture (was 0). The `analyzeNavigation()` LLM fallback is no longer triggered for this fixture — confirm by log output.
- `nx test agents-ux` passes.
- `npx playwright test e2e/screen-types-plan-b.spec.ts -g "@b0b"` passes.

**Verification commands:**
```bash
nx run-many -t typecheck
nx test agents-ux
# End-to-end sanity (requires API keys):
agentforge design:page:all --project personal-expense-tracker
cat apps/personal-expense-tracker/.agentforge/previews/prototype.json | jq '.navigation | length'  # expect ≥ 3
```

---

### Phase B1: Chrome Pass — Design Shared Components Once

**Files:**
- New: `packages/agents-ux/src/prototype/resolve-shared-components.ts`
- `packages/cli/src/commands/design-page-all.ts` — add Chrome Pass between planning and design stages

**New function: `resolveSharedComponents()`**

```typescript
interface SharedChrome {
  readonly components: readonly string[];
  readonly regions: readonly { position: 'header' | 'sidebar' | 'footer'; components: readonly string[] }[];
  readonly referencePageId: string;
}

function resolveSharedComponents(
  pages: readonly PageEntry[],
  catalog?: Record<string, { category?: string }>,
): SharedChrome | null {
  // Filter to approved/rendered page-type screens
  const pageScreens = pages.filter(p =>
    (p.status === 'approved' || p.designStatus === 'rendered') &&
    (p.screen_type ?? 'page') === 'page'
  );
  if (pageScreens.length < 2) return null;

  // Find components appearing on ALL page-type screens
  const componentCounts = new Map<string, number>();
  for (const page of pageScreens) {
    for (const comp of (page.components ?? [])) {
      componentCounts.set(comp, (componentCounts.get(comp) ?? 0) + 1);
    }
  }
  const shared = [...componentCounts.entries()]
    .filter(([, count]) => count === pageScreens.length)
    .map(([name]) => name);

  if (shared.length === 0) return null;

  // Derive regions from catalog categories + name heuristics
  const regions: { position: 'header' | 'sidebar' | 'footer'; components: string[] }[] = [];
  const headerComps = shared.filter(c => /nav|header|top|bar/i.test(c));
  const sidebarComps = shared.filter(c => /sidebar|sidenav/i.test(c));
  const footerComps = shared.filter(c => /footer|tab|bottom/i.test(c));

  if (headerComps.length > 0) regions.push({ position: 'header', components: headerComps });
  if (sidebarComps.length > 0) regions.push({ position: 'sidebar', components: sidebarComps });
  if (footerComps.length > 0) regions.push({ position: 'footer', components: footerComps });

  return {
    components: shared,
    regions,
    referencePageId: pageScreens[0].id,
  };
}
```

**Orchestration change in `design-page-all.ts`:**

Between the Planning stage (line 320) and Design stage (line 353), insert:

```typescript
// ── Stage 2.5: Chrome Pass — design shared components once ──
const sharedChrome = resolveSharedComponents(pages, componentCatalog);
let chromeSpec: DesignSpecV2 | undefined;

if (sharedChrome) {
  output.write(infoMsg(`\n  Chrome Pass: ${sharedChrome.components.join(', ')}\n`));
  output.write(infoMsg(`    Reference page: ${sharedChrome.referencePageId}\n`));

  const refPage = pages.find(p => p.id === sharedChrome.referencePageId)!;
  const refPlanning = planningMap.get(refPage.id)!;

  // Design only the chrome components from the reference page
  // (reuse existing penpotDesignWork with a chrome-only page context)
  const chromeResult = await designChromeComponents(
    refPage, refPlanning, sharedChrome, rendererTokens, catalogMapV2, providerConfig,
  );

  if (chromeResult.ok) {
    chromeSpec = chromeResult.value;
    // Save for LayoutShell consumption
    const chromePath = join(projectRoot, PREVIEW_DIR_REL, 'shared-chrome.json');
    writeFileSync(chromePath, JSON.stringify(chromeSpec, null, 2));
    output.write(successMsg(`    Chrome spec saved: ${Object.keys(chromeSpec.nodes).length} nodes\n`));
  }
}
```

Each page's design call then receives `chromeSpec` as an immutable constraint — the design prompt tells the AI "these chrome nodes are already designed, do not redesign them, only design the content area."

**`designChromeComponents()` contract (new helper in `packages/agents-ux/src/prototype/design-chrome.ts`):**

```typescript
export interface DesignChromeInput {
  readonly refPage: PageEntry;
  readonly refPlanning: UXPlanningOutput;
  readonly sharedChrome: SharedChrome;
  readonly rendererTokens: RendererTokens;
  readonly catalogMap: CatalogMap;
  readonly providerConfig: ProviderConfig;
}

export async function designChromeComponents(
  input: DesignChromeInput,
): Promise<Result<DesignSpecV2>>;
```

Implementation rules:
- **Reuse** `penpotDesignWork` — do not fork it. Pass a `chromeOnly: true` flag into `PenpotDesignInput` that the pipeline honours by (a) filtering `planningOutput.componentTree` down to only the shared-chrome component subtrees and (b) injecting a system-prompt addendum: "Design ONLY these chrome components. Do not include any page content. The root node must be transparent and 0-height padding."
- The returned spec has `screen: '__chrome__'` and only the nodes for the shared chrome subtrees + a synthetic `root`.
- Persist to `.agentforge/previews/shared-chrome.json` (NOT inside any `bookshelf-*` directory). This is an app-level artifact like `prototype.json`.
- On failure, return `Err(...)`; the orchestrator logs a warning and falls through to the old per-page chrome design path. Chrome Pass is a strict improvement, never a hard dependency.

**Active-tab overrides (per-page):** After the Chrome Pass, each page's design call receives `chromeSpec` AND its `page.id`. The per-page design prompt instruction: "The shared chrome is pre-designed and frozen. In your output, include the chrome nodes verbatim with exactly one override: set the NavigationTabs node whose `navigateTo` equals this page's id to `active: true` and all siblings to `active: false`." This mirrors Figma's main-component + instance-override model. Document this decision in `docs/adrs/ADR-NNN-chrome-pass.md`.

**Acceptance Criteria:**
- `shared-chrome.json` exists at `.agentforge/previews/shared-chrome.json` after `agentforge design:page:all`.
- Every page spec's TopBar node has byte-identical geometry/styling to `shared-chrome.json`'s TopBar (diff only on `order` and `active`). Verify with a deterministic diff test in `packages/agents-ux/src/prototype/__tests__/chrome-consistency.test.ts` that loads two page specs and the shared-chrome.json and asserts deep-equality of chrome subtrees modulo allow-listed fields.
- `resolveSharedComponents()` on the cleaned fixture returns `{ components: ['TopBar', 'NavigationTabs', ...], regions: [{ position: 'header', components: ['TopBar'] }, { position: 'footer', components: ['NavigationTabs'] }], referencePageId: 'dashboard' }`. Unit test in `resolve-shared-components.test.ts`.
- `npx playwright test e2e/screen-types-plan-b.spec.ts -g "@b1"` passes.

**Verification commands:**
```bash
nx test agents-ux
ls -la apps/personal-expense-tracker/.agentforge/previews/shared-chrome.json
jq '.nodes | keys' apps/personal-expense-tracker/.agentforge/previews/shared-chrome.json
```

---

### Phase B2: LayoutShell — Persistent Chrome in Prototype

**Files:**
- New: `packages/designspec-renderer/src/renderer/browser/app/src/LayoutShell.tsx`
- `packages/designspec-renderer/src/renderer/browser/app/src/PrototypeApp.tsx` — wrap with LayoutShell
- `packages/designspec-renderer/src/renderer/browser/app/src/main.tsx` — load shared-chrome.json

**LayoutShell component:**

```tsx
interface LayoutShellProps {
  chromeSpec: DesignSpecV2 | null;
  regions: Array<{ position: 'header' | 'sidebar' | 'footer'; nodeIds: string[] }>;
  tokens: RendererTokens;
  catalog: CatalogMap;
  onNavigate: (screenId: string) => void;
  navigationBindings: NavigationBinding[];
  children: React.ReactNode;
}

function LayoutShell({ chromeSpec, regions, tokens, catalog, onNavigate, navigationBindings, children }: LayoutShellProps) {
  if (!chromeSpec) return <>{children}</>;

  const headerRegion = regions.find(r => r.position === 'header');
  const sidebarRegion = regions.find(r => r.position === 'sidebar');
  const footerRegion = regions.find(r => r.position === 'footer');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {headerRegion && (
        <DesignSpecRenderer
          spec={filterSpecToNodes(chromeSpec, headerRegion.nodeIds)}
          tokens={tokens} catalog={catalog}
          onNavigate={onNavigate} navigationBindings={navigationBindings}
        />
      )}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {sidebarRegion && (
          <DesignSpecRenderer
            spec={filterSpecToNodes(chromeSpec, sidebarRegion.nodeIds)}
            tokens={tokens} catalog={catalog}
            onNavigate={onNavigate} navigationBindings={navigationBindings}
          />
        )}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </div>
      </div>
      {footerRegion && (
        <DesignSpecRenderer
          spec={filterSpecToNodes(chromeSpec, footerRegion.nodeIds)}
          tokens={tokens} catalog={catalog}
          onNavigate={onNavigate} navigationBindings={navigationBindings}
        />
      )}
    </div>
  );
}
```

**Spec splitting (exact algorithms):**

Both utilities live in `packages/designspec-renderer/src/renderer/browser/app/src/spec-split.ts` so they can be unit-tested without React.

```typescript
// Returns a new spec containing the listed root-level node IDs + ALL transitive descendants.
// A synthetic "root" node is preserved; its children are reordered to match `nodeIds`.
export function filterSpecToNodes(
  spec: DesignSpecV2,
  keepRootChildren: readonly string[],
): DesignSpecV2 {
  const keep = new Set<string>(['root', ...keepRootChildren]);

  // BFS from each kept root-level node to collect descendants.
  const queue: string[] = [...keepRootChildren];
  while (queue.length) {
    const id = queue.shift()!;
    for (const [childId, node] of Object.entries(spec.nodes)) {
      if (node.parent === id && !keep.has(childId)) {
        keep.add(childId);
        queue.push(childId);
      }
    }
  }

  const nodes: Record<string, NodeSpec> = {};
  for (const [id, node] of Object.entries(spec.nodes)) {
    if (!keep.has(id)) continue;
    nodes[id] = node;
  }
  return { ...spec, nodes };
}

// Returns a new spec with the given root-level node IDs (and their descendants) removed.
export function stripChromeFromSpec(
  spec: DesignSpecV2,
  dropRootChildren: readonly string[],
): DesignSpecV2 {
  const drop = new Set<string>();
  const queue: string[] = [...dropRootChildren];
  while (queue.length) {
    const id = queue.shift()!;
    drop.add(id);
    for (const [childId, node] of Object.entries(spec.nodes)) {
      if (node.parent === id) queue.push(childId);
    }
  }

  const nodes: Record<string, NodeSpec> = {};
  for (const [id, node] of Object.entries(spec.nodes)) {
    if (drop.has(id)) continue;
    nodes[id] = node;
  }
  return { ...spec, nodes };
}
```

Both are pure, deterministic, and covered by unit tests in `spec-split.test.ts`. Edge cases:
- Passing an empty `keepRootChildren` or `dropRootChildren` returns a spec equivalent to the input (only `root` survives in the filter case).
- Dropping a non-existent id is a no-op (do not throw).
- `order` fields on `root`'s children remain as-is; the renderer sorts by `order` anyway.

**Shared-chrome node identification:** The LayoutShell needs to know which nodes in `shared-chrome.json` belong to which region. Store this mapping in `shared-chrome.json` itself:

```json
{
  "screen": "__chrome__",
  "width": 1440,
  "regions": {
    "header": ["top-bar"],
    "footer": ["navigation-tabs"]
  },
  "nodes": { ... }
}
```

Add `regions?: Record<'header' | 'sidebar' | 'footer', readonly string[]>` to a new `SharedChromeSpec extends DesignSpecV2` type in `packages/designspec-renderer/src/types/shared-chrome.ts`. Do not add `regions` to `DesignSpecV2` itself — it is chrome-specific.

**PrototypeApp integration:**

PrototypeApp receives `chromeSpec?: SharedChromeSpec` and wraps the content DesignSpecRenderer in LayoutShell. Per-page specs are passed through `stripChromeFromSpec(spec, allChromeRootIds)` before rendering. On navigation, only the content-area DesignSpecRenderer re-renders — the LayoutShell's DesignSpecRenderer instances (header/sidebar/footer) keep their React tree mounted. Verify with `data-persistent-node-id` attribute and `expect(locator).toBe(sameHandle)` in the E2E test.

**iframe-bridge + main.tsx loader:** The renderer must load `shared-chrome.json` alongside per-page specs.
- In `main.tsx` (`fetchJson` block at line 36): add a parallel fetch for `./data/shared-chrome.json`. If absent, pass `chromeSpec={null}` (graceful fallback — PrototypeApp still works exactly as today).
- In `iframe-bridge.ts` `onLoadPrototype`: accept `chromeSpec` as an optional field on the payload JSON. Update the dashboard's `/api/prototype` route to include it.
- Copy `shared-chrome.json` into `packages/designspec-renderer/src/renderer/browser/public/data/` during the dashboard's prototype-manifest build, alongside existing per-page specs.

**Overlay interaction:** Overlays (modal/drawer/sheet) render via `<dialog>` which uses native stacking context — LayoutShell does not interfere. Overlays portal above the entire LayoutShell.

**Acceptance Criteria:**
- `spec-split.test.ts` covers: empty drop, empty keep, nested descendants, non-existent id, multiple root children.
- Clicking between Dashboard and Add Expense in the prototype: the TopBar DOM node is **the same element** before and after navigation. Assert via `page.locator('[data-persistent="header"]').evaluate(el => el.dataset.mountId)` — the `mountId` must be identical across navigations. Implement `mountId` as a `useRef` initialized with `crypto.randomUUID()` in LayoutShell.
- Overlay flow (drawer open, Escape, backdrop click) still works after LayoutShell wraps PrototypeApp — exercised by `@b2-overlays` test.
- `chromeSpec={null}` path renders exactly as today — regression test in `@b2-fallback`.
- `npx playwright test e2e/screen-types-plan-b.spec.ts -g "@b2"` passes.

**Verification commands:**
```bash
nx run-many -t typecheck
nx test designspec-renderer
npx playwright test e2e/screen-types-plan-b.spec.ts -g "@b2"
# Manual: open dashboard prototype, DevTools → Elements → watch TopBar node,
# click between pages, confirm the DOM element is not replaced.
```

---

### Phase B2.5: Integration Validation & Regression Hardening

**Why this phase exists.** B0–B2 acceptance criteria are invariant‑level (did the helper behave, did DOM nodes persist, did `shared-chrome.json` get written). They do not assert the **full loop works for a freshly onboarded app**, and they did not catch three visual regressions found during B2 manual verification:

1. Chrome Pass emits `topbar`, page specs use `top-bar` → duplicate headers rendered.
2. LLM page specs sometimes emit a root-level `position: absolute; background: overlay` node with no open/close state → persistent modal blocking the content area on every render.
3. The prototype manifest listed `__shared-chrome__` with `isDefault: true` → pseudo-screen showed up in the ScreenSelectorBar and occasionally became the default screen.

All three were fixed in-session (`findPageChromeRootIds`, `stripPersistentOverlays`, pseudo-screen filter in `/api/prototype/route.ts`) with unit tests only. **No Playwright test currently proves the prototype renders correctly end-to-end.** Phase B2.5 closes that gap.

**Scope boundary.** No new product behaviour. Every test in this phase must either (a) exercise a flow the user performs by hand today, or (b) guard a regression that is already fixed. If a test forces a production change, split that change into its own commit + ADR.

**Files:**
- `e2e/screen-types-plan-b.spec.ts` — add `@b2.5-*` tests. Use `test.fixme()` for scenarios that reveal a real gap (e.g. D below) — do not delete them, they are tripwires.
- New `POST /api/design/generate-all` dashboard route **may** be needed for `@b2.5-full-loop`. If so, file it as a scoped dashboard task, not inside Plan B.
- No changes expected in `packages/designspec-renderer/` or `packages/agents-ux/`.

**Context for B2.5 Implementers (read before writing tests):**

These are session-carried gotchas from B2 that are not obvious from reading the code. Skipping this section will cost hours.

1. **E2E server setup is load-bearing and manual.** `playwright.config.ts` has **no** `webServer` block by design (Playwright's `webServer` made headed runs OOM-crash against Next + Vite + Chromium). Instead:
   - `e2e/global-setup.ts` checks **only** Next.js on `http://localhost:3000` and aborts with a clear message if it's down. You must start `nx serve dashboard` yourself in a separate terminal.
   - Vite (port 4100) is started on-demand by the dashboard when `/design` loads — do not start it manually and do not check for it in `global-setup.ts`.
   - Tests must call the `waitForRendererReady()` helper (defined in `e2e/screen-types-plan-b.spec.ts`) after `page.goto('/design')` before asserting anything inside the iframe. It polls `/api/renderer/status` until HTTP 200 + renderer reports ready.
   - `packages/dashboard/src/app/api/_lib/renderer-manager.ts#getRendererStatus()` deliberately returns `'ready'` whenever the HTTP health check passes, **even if source files changed or the process is an orphan from a previous session**. This was a deliberate removal of earlier source-mtime staleness logic that caused Vite↔Chromium OOM death spirals. Do NOT reintroduce mtime-based staleness — see `docs/lessons-learned.md` "Renderer Staleness (SUPERSEDED 2026-04-20)" and `docs/adrs/ADR-040-prototype-runtime-scrubbing.md`.
   - Use `page.goto('/design', { waitUntil: 'domcontentloaded' })` — `'networkidle'` is unreliable because the prototype iframe keeps connections warm.

2. **PET fixture has two "Add Expense" buttons.** The chrome header has a `+ Add Expense` button that is NOT wired for navigation. The `ScreenSelectorBar` (prototype's built-in screen switcher) also has an `Add Expense` button that IS wired. A naive `iframe.locator('text=Add Expense')` will click the wrong one and the navigation assertion will time out. Always use `iframe.getByRole('button', { name: 'Add Expense', exact: true })` and, when disambiguation matters, scope to the selector bar container. Apply the same discipline to any text appearing in both chrome and content (likely: app title, settings icon).

3. **`shared-chrome.e2e.json` is a committed static fallback.** Lives at `fixtures/personal-expense-tracker/shared-chrome.e2e.json`. `GET /api/prototype` (`packages/dashboard/src/app/api/prototype/route.ts`) reads `.agentforge/previews/shared-chrome.json` first and falls back to `shared-chrome.e2e.json` when absent. This lets `@b2.5-visual-pet` and `@b2.5-chrome-consistency` run without first invoking `design:page:all`. If you regenerate the PET fixture, keep `shared-chrome.e2e.json` in sync (diff against the new `shared-chrome.json` and copy over).

4. **Active project is set via `.agentforge-dashboard-prefs.json`.** `project-reader.ts#discoverProjects()` scans only `MONOREPO_ROOT/apps/`, not `fixtures/`. For fixture-backed tests, either write the prefs file in `globalSetup` (preferred — see how existing `e2e/full-onboarding-llm.spec.ts` handles its scratch project) or `PUT /api/projects/active` with `{ "path": "<absolute fixture path>" }` (the route file is `packages/dashboard/src/app/api/projects/active/route.ts` — note `active`, not `activate`, and it exposes `GET` + `PUT`, not `POST`). The freshly-onboarded flow (`@b2.5-full-loop`) does NOT need a manual prefs edit — onboarding writes to `apps/<slug>/` and discovery picks it up automatically.

5. **Pseudo-screens (`__shared-chrome__`, `__chrome__`) are filtered at the API layer.** `GET /api/prototype` strips any screen whose `screenId` starts with `__` and any navigation binding referencing such a screen. If you ever see a screen id starting with `__` in a test, the filter has regressed. Test B.3 (`@b2.5-no-pseudo-screen`) guards this.

6. **Test file naming.** Use descriptive, phase-anchored names: `screen-types-plan-b.spec.ts` (good), NOT `plan-b-shared-layout.spec.ts` (rejected in a prior session). New E2E files should follow the `<topic>.spec.ts` convention.

7. **Production-code changes inside B2.5 are a smell.** B2.5 is a test-only phase. The one expected exception is adding `POST /api/design/generate-all` if `@b2.5-full-loop` can't shell out to the CLI cleanly — and that route is small and mechanical. If you find yourself editing `packages/designspec-renderer/` or `packages/agents-ux/` to make a B2.5 test pass, stop and ask: is this a regression the scrubbing code missed (log a lessons-learned entry and extend the scrub), or a new feature (out of B2.5 scope, open a new phase).

**Manual Test Scenarios (to be automated as `@b2.5-*` Playwright tests):**

#### A. Fresh-onboard full loop — `@b2.5-full-loop`

The Option B loop: onboard a new app, generate spec, run design:page:all, see a working prototype.

1. `page.goto('/onboarding')`; complete the wizard with a 3-page description (TaskPilot-style: dashboard + list + detail).
2. Poll `GET /api/navigation` until it returns ≥ 3 pages with `status: 'approved'` (mirror existing `full-onboarding-llm.spec.ts` waits).
3. Trigger `design:page:all` for the new project. Preferred: a new `POST /api/design/generate-all` route (scoped separately). Acceptable fallback: shell out to `npx agentforge design:page:all --project <path>` from the test.
4. Assert `.agentforge/previews/shared-chrome.json` exists after generation.
5. Navigate to `/design`; click **Prototype**; wait for `waitForRendererReady` helper.
6. Inside the iframe, assert:
   - `[data-persistent="header"]` is present and visible.
   - `[data-persistent="content"]` is present and visible.
   - `ScreenSelectorBar` shows exactly the approved page ids (no entry starts with `__`).
7. Click through each screen → header's `data-mount-id` is constant, content's `data-mount-id` changes.
8. Screenshot the default screen as a visual baseline (optional; use `toHaveScreenshot` with a permissive threshold so minor LLM variance doesn't flake).

#### B. Visual prototype correctness against PET fixture — `@b2.5-visual-pet`

Regression guard for today's three bugs. Runs against the committed PET fixture — no LLM calls, deterministic.

1. **No duplicate chrome — `@b2.5-no-duplicate-chrome`**
   Launch prototype on PET dashboard. Inside iframe:
   - Count elements with `[data-node*="top-bar"], [data-node*="topbar"], [role="banner"]` at depth ≤ 3 inside `[data-persistent="header"], [data-persistent="content"]`. Expect header count = 1, content count = 0.
   - Repeat for footer / nav-tabs. Expect footer count = 1, content count = 0.
   - This test would have caught the `topbar` vs `top-bar` mismatch on first run.

2. **No persistent overlay backdrop — `@b2.5-no-persistent-overlay`**
   On the PET dashboard, assert that `[data-persistent="content"] >>> *[data-node*="overlay"], *[data-node*="dialog"], *[data-node*="modal"]` is not visible on initial load of a `screen_type: page`. Equivalently, assert no visible element inside `[data-persistent="content"]` has computed style `position: absolute|fixed` AND a background that covers > 50% of the content area.

3. **No pseudo-screen in selector — `@b2.5-no-pseudo-screen`**
   On the PET prototype, assert every `ScreenSelectorBar` button's id/text does NOT start with `__`. Assert the first `[data-screen-marker]` mounted inside `[data-persistent="content"]` is a real page id (matches a page from `pages.yaml`).

#### C. Spec-generation visual invariants — `@b2.5-spec-invariants`

Catch LLM regressions at the spec layer so we don't rely on runtime stripping forever. These are structural tests — they can run on any project's `.agentforge/previews/` output without a browser.

1. **No root-level overlay nodes in `screen_type: page` specs** — `@b2.5-spec-no-root-overlay`
   For every `designspec-v2.json` under the active project's `.agentforge/previews/*/scripts/`, assert no root-level child has `overrides.position === 'absolute'|'fixed'` AND `background` matching `overlay|scrim|modal-(bg|backdrop)|backdrop`. If any exist, fail the test AND log: "design prompt for `screen_type: page` should forbid root-level overlay backdrops — tighten `ux-penpot-designspec-v2.md`."

2. **Chrome ID alignment — `@b2.5-spec-chrome-alignment`**
   For every page spec + `shared-chrome.json` pair, every id listed in `shared-chrome.json.regions[*]` must either (a) appear as a root-level child in the page spec, OR (b) be resolvable via `findPageChromeRootIds` tier-1 (exact) or tier-2 (compact) match. Tier-3 (region pattern) triggers a WARNING log but not failure. If more than N fixtures fall to tier-3, the Chrome Pass is drifting — open a ticket to feed chosen chrome ids back into the per-page design prompt.

#### D. Single-screen design consistency with frozen chrome — `@b2.5-single-screen-chrome` *(fixme until wired)*

`design-generate` (single page) currently does not read `shared-chrome.json` — confirmed via grep in post-B2 review. Regenerating one page after `design:page:all` will drift the page's chrome from the frozen spec.

1. Precondition: `design:page:all` has run on PET fixture; `shared-chrome.json` exists.
2. Run `design-generate --page dashboard --project <pet>` (or equivalent API call).
3. Assert the regenerated `dashboard` designspec still satisfies the Chrome ID alignment check from (C.2).
4. **Expected failure today.** Mark `test.fixme('@b2.5-single-screen-chrome — wire design-generate to load shared-chrome.json')`. The fixme is the tripwire; flip to `test()` when `design-generate.ts` learns `frozenChromeSpec` the same way `design-page-all.ts` already does.

#### E. Project discovery wiring — `@b2.5-project-discovery`

The manual `.agentforge-dashboard-prefs.json` edit we performed this session should never be required for a freshly onboarded app.

1. After `/onboarding` writes `apps/<slug>/`, `GET /api/projects` lists that slug without any manual intervention.
2. The dashboard project picker can activate the new project; `.agentforge-dashboard-prefs.json` is rewritten and survives a hard reload.
3. **Scope note:** `discoverProjects()` intentionally only scans `apps/`. Do not test `fixtures/` discovery — that's documented behaviour and the fixture access in E2E is via explicit prefs writes in `global-setup.ts`.

#### F. Overlay navigation through LayoutShell — `@b2.5-overlay-navigation`

Plan A `@a4` tests exercise the overlay system but predate LayoutShell wrapping PrototypeApp. Duplicate one scenario against the new architecture.

1. On PET prototype, click a source node bound to a `screen_type: modal|drawer|sheet` target.
2. Assert `dialog[open]` exists and is painted above `[data-persistent="content"]`.
3. Press Escape; assert `dialog[open]` is gone AND `[data-persistent="header"]` `data-mount-id` is unchanged (overlay teardown must not remount chrome).

#### G. Chrome consistency invariant at E2E layer — `@b2.5-chrome-consistency`

`packages/agents-ux/src/prototype/__tests__/chrome-consistency.test.ts` asserts byte-equality of chrome subtrees across page specs. Mirror it at render time:

1. For each PET page, render it in the prototype and compute a style fingerprint of the chrome subtree (serialize `getComputedStyle()` for a fixed property set: `width, height, background-color, padding, margin, display, flex-direction, justify-content, align-items`).
2. Assert all three pages produce the same fingerprint (modulo active-tab `background-color` on the active nav tab).

---

**Acceptance Criteria for Phase B2.5:**
- Every scenario A–G has a corresponding test (or `test.fixme()` tripwire) in `e2e/screen-types-plan-b.spec.ts` tagged with the matching `@b2.5-*` tag.
- `@b2.5-visual-pet` (B.1, B.2, B.3), `@b2.5-spec-invariants` (C.1, C.2), `@b2.5-overlay-navigation` (F), `@b2.5-chrome-consistency` (G) all pass on the committed PET fixture in both headed and headless runs.
- `@b2.5-project-discovery` (E) passes against the existing onboarding flow.
- `@b2.5-full-loop` (A) passes end-to-end OR is explicitly `test.fixme()` with a one-line comment pointing at the missing `POST /api/design/generate-all` route. Prefer passing — the route is small.
- `@b2.5-single-screen-chrome` (D) remains `test.fixme()` until `design-generate` is wired to `shared-chrome.json`. That wiring is out of scope for B2.5 — a future phase, a future ADR.
- `nx run-many -t typecheck` and `nx run-many -t test` stay green. No production code changes unless a specific test forces one, in which case split the change out.

**Verification commands:**
```bash
npx playwright test e2e/screen-types-plan-b.spec.ts -g "@b2.5"
npx playwright test e2e/screen-types-plan-b.spec.ts -g "@b2.5" --headed
nx run-many -t typecheck
nx run-many -t test
```

---

### Phase B3: Layout-Aware Code Generation (future)

This is future work but informs decisions in B1/B2 — the layout representation must be consumable by the implementation agent.

**Direction:** `screen_type` maps to Next.js patterns:
- Shared chrome → `app/layout.tsx` with `{children}` slot
- `page` → `app/[route]/page.tsx` rendering inside layout
- `modal` → parallel route or portal
- `drawer` → state-controlled side panel

The `resolveSharedComponents()` output + `shared-chrome.json` provides the implementation agent with concrete layout structure. No additional schema needed — the derived data is sufficient.

---

## Effort Estimates

| Phase | Effort | Impact | Dependencies |
|-------|--------|--------|-------------|
| B0a: Fix duplicate pages | ~1-2 hrs | Unblocks all shared component logic | None |
| B0b: Fix navigateTo propagation | ~4-6 hrs | Highest-impact single fix — unblocks navigation for Plan A + B | None |
| B1: Chrome Pass orchestration | ~6-8 hrs | Eliminates cross-page chrome drift | B0a |
| B2: LayoutShell renderer | ~6-8 hrs | Persistent chrome in prototype | B1 |
| B2.5: Integration validation + regression E2E | ~4-6 hrs | Converts manual/unit-only fixes into Playwright guards; proves the full onboard → prototype loop | B2 |
| B3: Code generation (future) | TBD | Layout.tsx generation | B1, B2 |

**Total for B0-B2.5:** ~22-30 hours across 4 sessions.

---

## Original Plan B Phases (superseded — preserved for historical reference)

The phases below were the original proposal before research. They are superseded by Phases B0-B2 above. Kept for context on what was considered and why the approach changed.

**Why the approach changed:** Research (2026-04-20) found that:
- B1 (schema) adds metadata with zero consumers — derived layout is better
- B2 (planning prompt) targets the wrong stage — Stage 3 already works, Stage 4 is the gap
- B3 (coherence checker) detects drift but can't fix it — prevention via Chrome Pass is better
- Industry tools (Figma, Next.js, Storybook) universally use "design once, compose everywhere"

### Original Phase B1: Shared Layout Schema

Add `layout?: { regions?, shared_components? }` to `PagesSpec`. **Superseded by:** `resolveSharedComponents()` in Phase B1 (auto-derived, no schema change).

### Original Phase B2: LLM-Generated NavBar Children

Update planning prompt to generate NavBar children. **Superseded by:** Phase B0b (fix at Stage 4 design agent, not Stage 3 planning agent).

### Original Phase B3: Cross-Screen Layout Consistency

Build `layout-coherence-checker.ts`. **Superseded by:** Phase B1 Chrome Pass (prevent drift upstream instead of detecting downstream).

---

## Implementation Rules

Superseded by the **Agent Guardrails** section at the top of this document. Those rules are stricter and more specific.

---

## Test Plan (authoritative)

Every phase has one or more tests. The acceptance-criteria Playwright file is `e2e/screen-types-plan-b.spec.ts`. Phases ship when their tagged tests are green.

| Phase | Test type | File | Tag |
|-------|-----------|------|-----|
| B0a   | Unit      | `packages/dashboard/src/app/api/pages/__tests__/route.test.ts` | — |
| B0a   | E2E       | `e2e/screen-types-plan-b.spec.ts` | `@b0a` |
| B0b   | Unit      | `packages/agents-ux/src/ux-design/__tests__/validate-navigate-to.test.ts` | — |
| B0b   | E2E       | `e2e/screen-types-plan-b.spec.ts` | `@b0b` |
| B1    | Unit      | `packages/agents-ux/src/prototype/resolve-shared-components.test.ts` | — |
| B1    | Unit      | `packages/agents-ux/src/prototype/__tests__/chrome-consistency.test.ts` | — |
| B1    | E2E       | `e2e/screen-types-plan-b.spec.ts` | `@b1` |
| B2    | Unit      | `packages/designspec-renderer/src/renderer/browser/app/src/spec-split.test.ts` | — |
| B2    | E2E       | `e2e/screen-types-plan-b.spec.ts` | `@b2` |
| B2.5  | E2E       | `e2e/screen-types-plan-b.spec.ts` | `@b2.5-full-loop` |
| B2.5  | E2E       | `e2e/screen-types-plan-b.spec.ts` | `@b2.5-no-duplicate-chrome` |
| B2.5  | E2E       | `e2e/screen-types-plan-b.spec.ts` | `@b2.5-no-persistent-overlay` |
| B2.5  | E2E       | `e2e/screen-types-plan-b.spec.ts` | `@b2.5-no-pseudo-screen` |
| B2.5  | E2E       | `e2e/screen-types-plan-b.spec.ts` | `@b2.5-spec-no-root-overlay` |
| B2.5  | E2E       | `e2e/screen-types-plan-b.spec.ts` | `@b2.5-spec-chrome-alignment` |
| B2.5  | E2E       | `e2e/screen-types-plan-b.spec.ts` | `@b2.5-single-screen-chrome` (fixme) |
| B2.5  | E2E       | `e2e/screen-types-plan-b.spec.ts` | `@b2.5-project-discovery` |
| B2.5  | E2E       | `e2e/screen-types-plan-b.spec.ts` | `@b2.5-overlay-navigation` |
| B2.5  | E2E       | `e2e/screen-types-plan-b.spec.ts` | `@b2.5-chrome-consistency` |

**Running the acceptance file:**
```bash
# All Plan B tests (most will start as test.fixme — flip to test as you implement):
npx playwright test e2e/screen-types-plan-b.spec.ts

# One phase:
npx playwright test e2e/screen-types-plan-b.spec.ts -g "@b1"
```

**Rule:** Do not delete `test.fixme()` entries — flip them to `test()` as each phase lands. A deleted fixme is a missing acceptance check.

---

## Relationship to Other Plans

- **Plan A** (`screen-types-plan-a.md`): Phases A1-A4 complete. A5-A6 can proceed in parallel with Plan B. Plan B builds on Plan A's screen types, viewport resolution, and overlay rendering.
- **Original plan** (`screen-types-overlays-shared-layouts.md`): Plan B covers the original plan's Phase 3 (Layout & Shared Components) and Phase 5 (NavigationBar Enhancement), with a Chrome Pass approach instead of override rendering or coherence checking.
- **Critical review**: Full analysis with live LLM validation data is in `screen-types-critical-review.md`.
- **Understanding doc**: `understanding-plan-b-shared-layouts.md` provides a newcomer-friendly walkthrough of the problems, research, and recommendations.
