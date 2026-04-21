# Understanding Plan B: Shared Layouts & NavBar Generation

**Audience:** Someone new to this repo who wants to understand what Plan B proposes, why it matters, and how it should be implemented — without needing to read every file in the codebase.

**Prerequisite reading:** None. This document is self-contained.

---

## What Is AgentForge?

AgentForge is a framework that uses AI agents to automate the software development lifecycle. You describe an app idea, and a pipeline of AI agents produces designs, specs, and eventually code — with human review at each stage.

The part of AgentForge relevant to Plan B is the **design pipeline**: a series of AI-powered stages that turn an app description into visual screen designs you can preview in a browser.

```
You describe your app
        |
        v
Stage 1: AI generates a list of pages (dashboard, settings, etc.)
        |
        v
Stage 2: AI researches UX patterns for each page
        |
        v
Stage 3: AI plans each page's component layout (which buttons, where)
        |
        v
Stage 4: AI produces a visual design (JSON describing every UI element)
        |
        v
Prototype: You see it rendered in a browser and can click between screens
```

Each page goes through Stages 2-4 independently — in parallel for speed.

---

## What Is a "Shared Layout"?

In almost every real app, some UI elements stay the same across all pages:

- A **navigation bar** at the top (logo, menu links, notification bell)
- A **sidebar** on the left (in dashboard-style apps)
- A **footer** at the bottom

These persistent elements are called **chrome** or **shared layout**. When you click from "Dashboard" to "Settings," the nav bar stays put and only the main content area changes.

---

## The Three Problems

Plan B addresses three problems that arise because AgentForge designs each page independently.

### Problem 1: Every page designs its own chrome from scratch

Because each page goes through the design pipeline separately, the AI generates a TopBar and NavigationTabs for *each page individually*. There's no guarantee they'll look the same.

**What happens today:**
- Dashboard gets a TopBar that's 64px tall, navy blue, with 16px text
- Settings page gets a TopBar that's 80px tall, dark gray, with 14px text
- Both are "TopBar" — but they look different because two separate AI calls designed them

The pipeline does detect "TopBar appears on 3 pages" (in `page-context-prompt.ts:60-69`), but it only tells the AI that fact — it doesn't give the AI the actual TopBar design from a previous page to copy.

### Problem 2: Navigation links inside the NavBar get lost

The pipeline has a concept called `navigateTo` — metadata on a UI element that says "clicking this takes you to the Settings page." The AI planning stage (Stage 3) correctly produces this:

```
NavigationBar
  ├── HomeTab      → navigates to: dashboard
  ├── ExpensesTab  → navigates to: add-expense
  └── InsightsTab  → navigates to: spending-insights
```

But the AI design stage (Stage 4) must convert this tree into a flat list of elements. During that conversion, the `navigateTo` metadata frequently gets dropped. The HomeTab still renders visually, but clicking it does nothing because the navigation link was lost.

The system that checks design quality uses screenshots (vision-based), so it can see if a button *looks* wrong — but it can't see that a missing `navigateTo` field means clicking does nothing.

### Problem 3: No persistent chrome in the prototype

When you click from Dashboard to Settings in the prototype, the *entire screen* swaps out — including the nav bar. You see a visible flash as the old nav bar disappears and the new one appears. In a real app, the nav bar would stay in place and only the content below it would change.

---

## What Plan B Originally Proposes (Three Phases)

### Phase B1: Define which components are shared

Add an optional `layout` section to the page specification that declares which components appear on all pages and where they sit.

### Phase B2: Teach the AI to generate proper NavBar children

Update the AI prompts so the planning stage explicitly creates individual child elements inside NavigationBar with navigation links.

### Phase B3: Check consistency across pages

Build a checker that compares shared components across all pages and flags differences.

---

## Research Findings

Extensive research was conducted across the codebase, industry tools (Figma, Storybook, Next.js, Locofy), and the actual data flow through the pipeline. Below are the concrete findings.

### Finding 1: The orchestrator has no "shared component pass"

The `design-page-all.ts` orchestrator runs three stages in parallel:

```
Stage 1: Research all pages (parallel, up to 3 concurrent)
Stage 2: Plan all pages (parallel, up to 3 concurrent)
Stage 3: Design all pages (parallel, up to 2 concurrent)
```

There is **no step between stages** that collects shared component designs and distributes them. Each page receives `pageContext` containing sibling page names and a list like "TopBar appears on 3 pages" — but never the actual TopBar design spec from another page.

The design system prompt is shared (`sharedDesignSystemPrompt` built once at line 342-349), which means all pages use the same color/typography tokens. But component-level design decisions (TopBar height, padding, font weight) are made independently per page.

### Finding 2: The navigateTo loss is a prompt gap, not a code gap

The exact data flow for `navigateTo`:

1. **Planning output (Stage 3):** Produces `ComponentTreeNode[]` with `navigateTo` on leaf nodes. This works — confirmed by live validation.

2. **Design input (Stage 4):** `penpot-v2-pipeline.ts:551-553` injects this instruction:
   ```
   When the planning output contains componentTree nodes with "navigateTo" fields,
   you MUST copy those "navigateTo" values to the corresponding DesignSpec nodes.
   ```
   The planning output is passed as raw JSON at line 555.

3. **The gap:** The instruction says "find the matching node" but provides no mapping guidance. Planning nodes are named `NavItemHome` while design nodes become `nav-item-home` or `tab-0` or just `navigation-bar`. The AI has no algorithm for this conversion and frequently collapses NavBar children into a single node with overrides.

4. **No validation exists:** After the AI produces the DesignSpec (line 626-631), the code validates structural integrity (`validateDesignSpec`) but **never checks whether navigateTo values from planning survived**. The evaluator (`design-evaluator.ts`) uses vision-based screenshot analysis — invisible metadata like `navigateTo` is never checked.

5. **The fallback masks the problem:** `extractNavigationFromSpecs()` returns 0 bindings when navigateTo is lost. Then `analyzeNavigation()` kicks in as an LLM fallback that guesses navigation from screen summaries. This works well enough that the broken chain is never noticed.

### Finding 3: The PrototypeApp architecture supports a LayoutShell

The current `PrototypeApp.tsx` renders the full screen including chrome on every navigation:

```tsx
<div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
  <div ref={pageContainerRef} style={{ flex: 1, overflow: 'auto' }}>
    <DesignSpecRenderer spec={activeSpec} ... />  {/* Full screen including TopBar */}
  </div>
  <dialog>...</dialog>  {/* Overlays */}
  <ScreenSelectorBar ... />
</div>
```

A LayoutShell is feasible because:
- The DesignSpec uses a **flat adjacency list** (not nested tree). Each node has a `parent` field. Shared chrome nodes (TopBar, NavigationTabs) are direct children of the root node.
- Stripping shared nodes from a spec means removing them from the `nodes` object and updating the root's children order. Orphaned children is not a risk because chrome nodes are leaf-level or have their own self-contained subtrees.
- The overlay system (modal/drawer/sheet via native `<dialog>`) already renders independently of the main page content — a LayoutShell would not interfere.

**Key risk:** The iframe bridge (`iframe-bridge.ts`) communicates specs from the dashboard to the renderer. A LayoutShell would need the shared chrome spec delivered separately from per-page specs. This requires a protocol change.

### Finding 4: Duplicate pages bug is in `POST /api/pages`

The fixture has **19 pages total**: 3 approved (dashboard, add-expense, spending-insights) and **16 identical drafts** all named "A user settings page for profile and preferences."

**Root cause:** `POST /api/pages` (route at `packages/dashboard/src/app/api/pages/route.ts:42-84`) generates IDs using `page-${slug}-${Date.now().toString(36)}`. Each call creates a unique ID, so repeated calls for the same description create duplicates. There is no deduplication by name, route, or description.

The `POST /api/spec/approve` endpoint (line 78) **replaces** the entire pages.yaml, but `POST /api/pages` **appends**. If a user clicks "add page" multiple times in the dashboard, duplicates accumulate. The `design-generate` CLI command also has no deduplication in `writeSpecFiles()`.

**Fix:** Add deduplication by `route` in `POST /api/pages` before appending. Filter by `status: 'approved'` or `designStatus: 'rendered'` when computing shared components.

### Finding 5: Industry patterns converge on "design once, compose everywhere"

| System | Pattern | How it works |
|--------|---------|-------------|
| **Figma** | Inherited prototype connections from main components | Design the NavBar once as a main component. All instances across frames inherit the same interactions. State is shared between matching objects. |
| **Next.js** | `layout.tsx` wrapping `{children}` | Layout renders once, persists across navigation. Only the page content swaps. Layouts preserve state and don't re-render. |
| **Storybook** | Global decorators | A decorator wraps all stories with shared layout. Individual stories opt into layout types via parameters. |
| **Design-to-code tools** | Generate component once, import everywhere | Locofy/FigmaForge convert a Figma component to code once. Reuse is through import, not re-generation. |

**The universal pattern:** Shared chrome is designed/built **once** and **composed** into pages — never re-generated independently per page. Plan B's "design per-page, check after" approach (Phase B3) goes against this industry consensus.

---

## Recommended Solution

Based on the research, here is the recommended approach — ordered by implementation priority.

### Step 1: Fix Prerequisites (blocks everything)

**1a. Fix duplicate pages.**
- Add deduplication by `route` in `POST /api/pages`
- Filter pages by `status !== 'draft'` when no design exists (or by `designStatus: 'rendered'`) in shared component detection
- Clean up the fixture (remove 16 duplicate drafts)

**1b. Fix navigateTo propagation (Stage 4).**
This is the single highest-impact fix. Two changes, applied together:

- **Prompt fix:** Add a worked example to `penpot-v2-pipeline.ts` showing the exact mapping from planning tree to flat DesignSpec with navigateTo preserved:
  ```
  Planning: { name: "NavItemHome", navigateTo: "dashboard" }
  DesignSpec: { "nav-item-home": { parent: "navigation-bar", catalog: "tab", navigateTo: "dashboard" } }
  ```

- **Programmatic validation:** After extracting the DesignSpec from the LLM (line 626), add a check: extract all `navigateTo` values from the planning output, compare against the DesignSpec output, and programmatically inject any missing ones by finding the best-matching node (by name similarity or catalog type). This is the safety net.

**Why both:** The prompt fix teaches the AI to do it right. The programmatic validation catches the cases where it doesn't. This hybrid approach preserves AI agency while ensuring correctness. The `analyzeNavigation()` LLM fallback should remain as a tertiary safety net but should no longer be the primary mechanism.

### Step 2: Design Chrome Once ("Chrome Pass")

**Recommended approach:** Add a new orchestration step between planning and design in `design-page-all.ts`.

```
Stage 1: Research all pages (parallel)
Stage 2: Plan all pages (parallel)
 NEW → Stage 2.5: Chrome Pass
         - Identify shared components via existing detection (page-context-prompt.ts:60-69)
         - Pick one page as the "reference" (first approved page)
         - Design ONLY the shared chrome components for the reference page
         - Save as shared-chrome.json
Stage 3: Design all pages (parallel)
         - Each page receives shared-chrome.json as immutable constraint
         - The AI designs only the content area; chrome is pre-filled
```

**Why this over Plan B's approach:**
- Eliminates cross-page drift at the source (not after the fact)
- Matches the Figma/Next.js "design once, compose everywhere" industry pattern
- Simpler than a coherence checker that detects but can't fix
- The pipeline already builds a shared design system prompt once (line 342-349) — extending this to shared chrome is a natural evolution

**Active tab state:** The one valid concern about "design once" is that the NavBar needs a different active tab per page. Solution: the shared chrome spec defines the NavBar structure, but each page's design pass sets the active tab state as an override. This is how Figma handles it (main component + instance overrides).

### Step 3: Auto-Derived Layout (Not Declarative Schema)

**Recommended approach:** Do not add a `layout` field to `PagesSpec`. Instead, derive layout from existing data.

Build a `resolveSharedComponents()` function that:
1. Counts component appearances across all `status: 'approved'` pages (existing logic at `page-context-prompt.ts:60-69`)
2. Filters to components appearing on ALL page-type screens
3. Derives position from the component catalog's `category` field:
   - `category: 'layout'` + name contains "nav"/"header"/"top" → header region
   - `category: 'layout'` + name contains "sidebar" → sidebar region
   - `category: 'layout'` + name contains "footer"/"tab"/"bottom" → footer region
4. Returns a `SharedChrome` object consumed by the Chrome Pass and LayoutShell

**Why derived over declarative:**
- Zero maintenance burden — adapts automatically as pages change
- No consumer gap (the function IS the consumer)
- The component catalog already classifies NavigationBar/Sidebar/Footer as `category: 'layout'`
- If Stage 7 (code generation) later needs explicit layout data, the derived output can be serialized to the prototype manifest at that point

### Step 4: LayoutShell in the Prototype Renderer

**Recommended approach:** Wrap `PrototypeApp` with a `LayoutShell` component.

```
LayoutShell
  ├── Shared header (rendered from shared-chrome.json TopBar spec)
  ├── Content area (only this swaps on navigation)
  │   └── DesignSpecRenderer (page content without chrome nodes)
  ├── Shared footer (rendered from shared-chrome.json NavigationTabs spec)
  └── Overlay layer (modal/drawer/sheet renders on top of everything)
```

**Implementation approach:**
1. When building the prototype manifest, identify shared chrome nodes from the reference page's DesignSpec
2. For each page, produce a "content-only" spec by removing shared chrome nodes from the flat adjacency list
3. `LayoutShell` renders chrome once; `PrototypeApp` manages which content-only spec to show
4. Navigation within chrome (tab clicks) triggers `PrototypeApp.navigateTo` — chrome persists, content swaps

**Iframe bridge change:** The manifest already carries all specs. The LayoutShell reads shared chrome from the reference page's spec and strips those nodes from each page's spec at render time. No protocol change needed — just client-side spec splitting.

### Step 5: NavBar navigateTo Fix (Prompt + Validation)

This is covered by Step 1b but deserves emphasis: the prompt fix should include a specific NavBar flattening example because NavBar is the highest-frequency case of navigateTo loss.

Add to `penpot-v2-pipeline.ts` prompt:

```
## NavigationBar Flattening Example

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

CRITICAL: Each child becomes its own node. navigateTo MUST be copied exactly.
DO NOT flatten NavigationBar into a single node with overrides.
```

---

## Implementation Priority & Effort

| Step | Effort | Impact | Depends on |
|------|--------|--------|------------|
| 1a. Fix duplicate pages | Small (1-2 hrs) | Unblocks all shared component logic | Nothing |
| 1b. Fix navigateTo propagation | Medium (4-6 hrs) | Unblocks navigation for Plan A + B | Nothing |
| 2. Chrome Pass orchestration | Medium (6-8 hrs) | Eliminates cross-page chrome drift | 1a |
| 3. resolveSharedComponents() | Small (2-3 hrs) | Provides data for Chrome Pass + LayoutShell | 1a |
| 4. LayoutShell renderer | Medium (6-8 hrs) | Persistent chrome in prototype | 2, 3 |
| 5. NavBar prompt example | Small (1 hr) | Included in 1b | — |

**Total estimated effort:** ~20-28 hours across 3-4 sessions.

Steps 1a and 1b can be done in parallel. Steps 2 and 3 should be done together. Step 4 is independent renderer work.

---

## How Plan B Relates to Plan A

Plan A (mostly done — phases A1-A4 complete) added `screen_type` classification to pages. A page can now be a `page`, `modal`, `drawer`, or `sheet`. Plan A teaches the pipeline *how different screens render*.

Plan B addresses *what stays the same across screens*. Shared layouts interact with overlays — a drawer opening over a page with a sidebar has different layout constraints than a drawer over a full-width page. Plan A must be proven first.

Both plans share a critical dependency: the Stage 4 `navigateTo` propagation fix. This fix (Step 1b above) is the single highest-leverage improvement in the pipeline.

---

## Summary: Plan B Original vs. Recommended

| Concern | Plan B's Approach | Recommended | Why |
|---------|------------------|-------------|-----|
| Shared components | Declarative `layout` schema in YAML | Auto-derived via `resolveSharedComponents()` | Zero maintenance, no consumer gap, adapts automatically |
| Cross-page consistency | Post-hoc coherence checker | Chrome Pass: design once, inject as constraint | Prevention beats detection — matches Figma/Next.js pattern |
| NavBar navigation | Update planning prompt (Stage 3) | Fix design prompt (Stage 4) + programmatic validation | Stage 3 already works; the break is at Stage 4 |
| Persistent prototype chrome | Not addressed | LayoutShell wrapping PrototypeApp | Feasible, low blast radius, high user impact |
| Duplicate pages | Not addressed | Dedup in `POST /api/pages` + status filtering | Must-fix prerequisite |

---

## Glossary

| Term | Meaning |
|------|---------|
| **Chrome** | UI elements that persist across all pages (nav bar, sidebar, footer) |
| **Chrome Pass** | A new orchestration step that designs shared components once before individual page design |
| **Screen type** | Classification of a page: `page` (full screen), `modal` (centered popup), `drawer` (side panel), `sheet` (bottom panel) |
| **navigateTo** | Metadata on a UI element that says "clicking this navigates to page X" |
| **DesignSpec** | A JSON document describing every visual element on a page as a flat adjacency list |
| **Stage 3 / Planning** | The AI step that decides which components go on a page and how they're arranged |
| **Stage 4 / Design** | The AI step that produces the final visual design as flat DesignSpec nodes |
| **LayoutShell** | A wrapper component that renders shared chrome once and swaps only the content area |
| **Component catalog** | A YAML file listing all available UI components with their properties and visual rules |
| **ADR** | Architecture Decision Record — a short document explaining why a technical decision was made |
| **Prototype** | A browser preview where you can see all designed screens and click between them |
