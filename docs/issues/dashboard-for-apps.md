# Design Studio — Phased Execution Plan v2

## How to use this document

Each phase is a self-contained Claude Code session. Phases are ordered by dependency. Each phase has:

- **What it builds** — the deliverable
- **Claude Code prompt** — copy-paste into Claude Code
- **Test** — verification before moving on
- **STOP rule** — if any cross-package import fails, STOP and report the error. Do not fall back to stubs, direct YAML writes, or placeholder implementations.

**Why no fallbacks:** Fallbacks mask integration issues. A "working" UI built on stubs gives false confidence — when you wire the real code later, you discover type mismatches, missing dependencies, or wrong function signatures on top of a UI that assumed a different contract. Integration spikes first, UI on top of verified contracts.

Estimated total: 11 phases across 7–9 Claude Code sessions.

---

## Pre-flight: Execute humming-drifting-snowflake.md

**Status:** This plan (drop responseSchema from vision correction, add three-layer defense) is "reviewed and ready" but "pending execution." Must complete before any Design Studio work.

### Claude Code prompt

```
Read docs/plans/humming-drifting-snowflake.md and execute it fully. This plan drops responseSchema from the vision correction adapter, adds a three-layer defense (system prompt + alias map + value validation), and updates the browser-correction-adapter.ts.

After execution:
1. Run the existing test suites: `npx nx run designspec-renderer:test` and `npx nx run agents-ux:test`
2. Verify all tests pass with zero regressions
3. Confirm the alias map and value validator are exported from the barrel index
```

### Test
```bash
npx nx run designspec-renderer:test   # should pass 257+ tests
npx nx run agents-ux:test             # should pass 295+ tests
```

---

## Phase 0.5: Integration spike — verify every cross-package import

**What it builds:** A standalone test script that imports every function the dashboard will call from other packages, invokes each one with test data, and confirms the imports resolve, types match, and outputs are what the API routes expect. No UI. No API routes. Just proof that the contracts work.

**Why this exists:** Phases 4, 9, and 10 depend on importing from `@agentforge/agents-design`, `@agentforge/agents-ux`, and `@agentforge/designspec-renderer`. If any of these imports fail at build time (transpile issues, missing barrel exports, wrong types), we need to know NOW — not after building 8 phases of UI on top of assumed contracts.

### Claude Code prompt

```
Create an integration spike that verifies all cross-package imports the dashboard will need. This is NOT UI work — it's a standalone script that tests imports and function signatures.

Create `tools/dashboard-integration-spike/spike.ts`:

This script should attempt the following imports and calls. For each one, log SUCCESS or FAILURE with the exact error.

## Import group 1: agents-design (page creation)

```typescript
import { handlePageRequest } from '@agentforge/agents-design';
// OR check: import { handlePageRequest } from '../../packages/agents-design/src/page-request-handler/page-request-handler';
```

1. Log the function signature: `typeof handlePageRequest` and its parameter count
2. Check what `PageRequestInput` looks like — what fields does it need? Log the type structure.
3. Check what `EventBus` and `FileSystem` interfaces it expects. Log the required methods.
4. If the function needs dependencies injected, document exactly what interfaces are required.

## Import group 2: agents-ux (correction pipeline)

```typescript
import { BrowserCorrectionPipeline } from '@agentforge/agents-ux';
import { BrowserCorrectionAdapter } from '@agentforge/agents-ux';
```

1. Log whether these classes export from the barrel index at `packages/agents-ux/src/index.ts`
2. Check the constructor signature of `BrowserCorrectionPipeline` — what does it need?
3. Check the `run()` or `execute()` method signature — what inputs, what outputs?
4. Check if `BrowserCorrectionAdapter` needs an LLM provider configured to instantiate

## Import group 3: designspec-renderer (browser session + mechanical checks)

```typescript
import { BrowserSession } from '@agentforge/designspec-renderer';
import { extractDOM } from '@agentforge/designspec-renderer';
import { runMechanicalChecks } from '@agentforge/designspec-renderer';
```

1. Log whether these export from the barrel at `packages/designspec-renderer/src/index.ts`
2. Check `BrowserSession` constructor — does it need Playwright config? Port number?
3. Check `runMechanicalChecks` signature — what shape is the input DOM data?
4. Try `new BrowserSession()` — does it actually instantiate without errors? (May need Playwright installed)

## Import group 4: core (YAML operations)

```typescript
import { readYaml, writeYaml, loadTasks, addTask, saveTasks } from '@agentforge/core';
```

1. Verify these exports exist
2. Check `readYaml` signature — does it take a file path? Does it return parsed object?

## Import group 5: CLI (project scaffolding)

```typescript
import { buildDesignTokensSpec } from '../../packages/cli/src/commands/init';
import { pickComponentLibrary } from '../../packages/cli/src/commands/design-system';
```

1. Check if these functions are exported (they may be internal/non-exported)
2. If they're not exported, log exactly which functions ARE exported from those files
3. Check if they depend on interactive prompts (inquirer) that wouldn't work in a non-TTY API route context

## Output

For each import group, output a structured report:

```
=== GROUP 1: agents-design ===
handlePageRequest: ✅ FOUND
  - Params: (input: PageRequestInput) => Promise<PageRequestOutput>
  - PageRequestInput needs: { description: string, projectRoot: string, eventBus: EventBus, fs: FileSystem }
  - EventBus interface: { emit(event: string, data: any): void }
  - FileSystem interface: { readFile, writeFile, exists, mkdir }
  
=== GROUP 2: agents-ux ===
BrowserCorrectionPipeline: ✅ FOUND
  - Constructor: (session: BrowserSession, adapter: BrowserCorrectionAdapter)
  - run() params: (spec: DesignSpecV2, tags: UserTag[]) => Promise<CorrectionResult>
  ...
```

## How to run this

Add a minimal `package.json` and `tsconfig.json` to `tools/dashboard-integration-spike/` that can compile TypeScript with paths pointing to the monorepo packages. Use tsx or ts-node for execution.

```json
{
  "scripts": {
    "spike": "npx tsx spike.ts"
  }
}
```

## CRITICAL RULES
- If an import fails, DO NOT skip it. Log the exact error and continue to the next import.
- If a function signature doesn't match expectations, log what it actually is.
- DO NOT create stubs, mocks, or workarounds. This is a READ-ONLY investigation.
- At the end, output a summary: which imports work, which fail, and what needs to be fixed before dashboard development.
```

### Test
```bash
cd tools/dashboard-integration-spike
npx tsx spike.ts

# Expected output: a structured report showing every import's status
# Any FAILURE here must be fixed before proceeding to Phase 1
```

### What to do with the results

The spike report tells you exactly what's available. Before Phase 1:

1. **If an export is missing from a barrel index** — add it to the package's `index.ts`. One-line fix.
2. **If a function signature is different from expected** — update the plan's API route to match the real signature. Don't change the function — change the plan.
3. **If a CLI function depends on interactive prompts** — it can't be used in an API route. Write the equivalent logic inline in the API route. This is not a fallback — it's the planned approach because the CLI function was designed for TTY, not API routes.
4. **If a package doesn't transpile through Next.js** — fix the `transpilePackages` config before building any API routes.

---

## Phase 1: Configurable project root + projects API

**What it builds:** Removes the hardcoded `bookshelf` project root. Adds project discovery and selection APIs. Every subsequent phase depends on this.

### Claude Code prompt

```
I need to make the dashboard project root configurable instead of hardcoded to 'bookshelf'. This is the foundation for all dashboard wiring.

## Task 1: Fix project-reader.ts

File: `packages/dashboard/src/app/api/_lib/project-reader.ts`

This file hardcodes `const PROJECT_ROOT = join(MONOREPO_ROOT, 'bookshelf')`. Replace it:

1. Add a `getActiveProjectRoot()` function that:
   - First checks `AGENTFORGE_PROJECT_DIR` env var (use the existing `getEnvVar()` function at line 67)
   - Then checks `.agentforge-dashboard-prefs.json` in the monorepo root for `{ activeProject: "/absolute/path" }`
   - Fallback: scan the monorepo root for directories containing `agentforge.yaml`, pick the first one found
   - If none found, throw a descriptive error: "No AgentForge project found. Run `agentforge init` or set AGENTFORGE_PROJECT_DIR."
2. Replace all uses of the `PROJECT_ROOT` constant with calls to `getActiveProjectRoot()`
3. Export `getActiveProjectRoot` from the module

## Task 2: Projects API routes

Create `packages/dashboard/src/app/api/projects/route.ts`:
- `GET` handler: scan the monorepo root for directories containing `agentforge.yaml`. For each found, read the YAML and return `[{ id: dirName, name: project.name, path: absolutePath, description: project.description || '' }]`. Use `readYamlFile` from project-reader.

Create `packages/dashboard/src/app/api/projects/active/route.ts`:
- `GET` handler: return `{ path: getActiveProjectRoot(), name: ... }` by reading the active project's agentforge.yaml
- `PUT` handler: accept `{ path: string }`, validate that the path contains `agentforge.yaml`, write to `.agentforge-dashboard-prefs.json` in monorepo root, return 200

## Constraints
- Use Next.js App Router conventions (export async function GET/PUT with NextRequest/NextResponse)
- All reads should use the existing helper functions from project-reader.ts where possible
- Add proper error handling — return 404 if no project, 400 if invalid path
- If any import from @agentforge/core fails, STOP and report the error with the exact message. Do not work around it.
```

### Test
```bash
npx nx run dashboard:build
curl http://localhost:3000/api/projects
curl http://localhost:3000/api/projects/active
```

---

## Phase 2: Activity sidebar + sidebar nav wiring

**What it builds:** Replaces mock data with real audit events. Wires sidebar nav to real project name.

### Claude Code prompt

```
Wire the dashboard's activity sidebar and sidebar nav to real data.

## Task 1: Activity sidebar — replace mock data

File: `packages/dashboard/src/components/layout/activity-sidebar.tsx`

This component has a `MOCK_EVENTS` hardcoded array (around line 17-60). The `useEventFeed` hook at `src/lib/hooks/use-event-feed.ts` already polls `/api/audit` every 5s and works.

1. Remove the `MOCK_EVENTS` constant entirely
2. Import and use `useEventFeed()` hook (the component is already `'use client'`)
3. Map the `FeedEvent` shape from the hook to whatever shape the component's rendering expects. Derive icon from `event.type` (e.g., 'agent' events get a bot icon, 'task' events get a check icon, 'approval' events get a shield icon). Use a simple switch/map.
4. If the feed is empty or loading, show a subtle "No recent activity" state
5. Keep the existing visual styling

## Task 2: Sidebar nav — wire project context

File: `packages/dashboard/src/components/layout/sidebar-nav.tsx`
- Accept a `project` prop with `{ name: string, repo?: string, stack?: { frontend: string, backend: string } }`
- Replace hardcoded `projectName`, `repoPath`, `stackTags` with prop values, falling back to current defaults if prop is undefined
- Add a "Design Studio" nav item linking to `/design`

File: `packages/dashboard/src/components/layout/dashboard-shell.tsx`
- Fetch `GET /api/projects/active` on mount
- Pass project data to `SidebarNav`
- Handle loading state gracefully

## Constraints
- Don't change the visual design
- Must not break any existing page that uses dashboard-shell
```

### Test
```bash
npx nx run dashboard:build
npx nx run dashboard:dev
# Verify: activity sidebar shows real events (or empty state), sidebar shows real project name, "Design Studio" nav item appears
```

---

## Phase 3: Home page + onboarding wizard

**What it builds:** Home page with onboarding (if no project) or project selector + nav grid.

### Claude Code prompt

```
Rewrite the dashboard home page to support onboarding and project selection.

## Task 1: Onboarding wizard component

Create `packages/dashboard/src/components/onboarding/onboarding-wizard.tsx`:

A 3-step form:
- Step 1: Project name (required), short description (optional)
- Step 2: GitHub repo URL (optional)
- Step 3: Component library (radio: shadcn/ui, Material UI, Custom), color scheme (Light, Dark, Both)

On submit: POST to `/api/projects`. Show loading. On success, redirect to `/`.

Use shadcn/ui components already installed in the dashboard.

## Task 2: Projects POST handler

Add POST handler to `packages/dashboard/src/app/api/projects/route.ts`:

1. Accept `{ name, description?, repoUrl?, componentLibrary?, colorScheme? }`
2. Create project directory at `{monorepoRoot}/{slugify(name)}/`
3. Write `agentforge.yaml` with project metadata (template below)
4. Create `agentforge/spec/pages.yaml` with `version: "1.0"\npages: []`
5. Create `agentforge/designs/` directory

For design token generation: the integration spike (Phase 0.5) determined whether `buildDesignTokensSpec()` from the CLI is importable and non-interactive. Use the spike results:
- If importable and non-interactive: import and use it
- If it depends on interactive prompts or is not exported: write the design tokens YAML inline. This is the planned approach because the CLI function was designed for TTY contexts, not API routes — it's not a fallback, it's the correct choice.

6. Set as active project
7. Return `{ projectId, path }`

agentforge.yaml template:
```yaml
version: "1.0"
project:
  name: "{name}"
  description: "{description}"
  platforms: ["web"]
stack:
  frontend: "react"
  backend: "node"
  database: "postgresql"
  styling: "tailwind"
budget:
  per_task_max_usd: 2.00
  per_phase_max_usd: 25.00
  monthly_max_usd: 200.00
```

## Task 3: Home page rewrite

File: `packages/dashboard/src/app/page.tsx`
- Fetch `GET /api/projects` on mount
- No projects → render OnboardingWizard full-screen
- Has projects → module grid with working `<Link>` navigation
- Fix paths: `/kanban` → `/tasks`, `/specs` → `/spec`
- Add "Design Studio" card linking to `/design`

## Constraints
- 3 steps max, minimal required fields
- Use existing shadcn components
```

### Test
```bash
npx nx run dashboard:build
npx nx run dashboard:dev
# Delete .agentforge-dashboard-prefs.json, navigate to / → wizard appears
# Complete wizard → project created → redirects to dashboard
# With existing project → module grid with correct links
```

---

## Phase 4: Pages API + create page modal

**What it builds:** Pages API using the real `handlePageRequest()` and the single-prompt creation modal.

### Claude Code prompt

```
Build the pages API and create-page modal. The integration spike (Phase 0.5) verified that `handlePageRequest` from agents-design is importable. Use the exact function signature from the spike report.

## Task 1: Pages API routes

Create `packages/dashboard/src/app/api/pages/route.ts`:

GET handler:
- Read `agentforge/spec/pages.yaml` from active project
- Return pages array with id, name, description, route, status, and `designStatus` (default 'draft')

POST handler:
- Accept `{ description: string }`
- Import `handlePageRequest` from `@agentforge/agents-design` — use the exact import path verified in the spike
- Construct the dependencies (EventBus, FileSystem) using the interfaces documented in the spike report
- Call `handlePageRequest()` with the description + dependencies
- Add `designStatus: 'draft'` to the created page entry
- Return `{ pageId, taskId }`

If the import fails at build time, STOP and report the exact error. Do not fall back to direct YAML writes.

Add `@agentforge/agents-design` to `transpilePackages` in `packages/dashboard/next.config.js`.

Create `packages/dashboard/src/app/api/pages/[pageId]/route.ts`:
- GET: return single page by ID
- PATCH: accept partial updates (description, components, designStatus), write back

## Task 2: Create page modal

Create `packages/dashboard/src/components/pages/create-page-modal.tsx`:

shadcn Dialog with:
- Single textarea
- Disabled attachment buttons ("Coming soon" tooltips)
- "Generate" button → POST /api/pages → loading → close + navigate to /design?page={pageId}
- "Cancel" button

## Task 3: Surface the create button

"+ New Page" / "Design a page" buttons on:
- `src/app/page.tsx` — CTA card
- `src/app/spec/page.tsx` — header button
- `src/app/pipeline/page.tsx` — header button

## Constraints
- ONE textarea + generate. No structured forms.
- Real handlePageRequest. No stubs.
- If import fails, STOP and report.
```

### Test
```bash
npx nx run dashboard:build   # must succeed with agents-design import

curl -X POST http://localhost:3000/api/pages \
  -H "Content-Type: application/json" \
  -d '{"description":"Settings page with profile and billing"}'
# Must return { pageId, taskId } and write to pages.yaml
```

---

## Phase 5: Screen-by-screen wiring (batch)

**What it builds:** Wires remaining 8 screens to real data.

### Claude Code prompt

```
Wire the remaining dashboard screens to real data.

## Screen 1: Pipeline (`src/app/pipeline/page.tsx`)
- Replace hardcoded `totalBudget={50.00}` and `activeAgents={3}`
- Fetch budget from `/api/projects/active`, agent count from `/api/agents`
- UI resilience: if the API call fails, show "—" placeholder (not hardcoded fake numbers)

## Screen 2: Tasks (`src/app/tasks/page.tsx`)
- Verify `mapStatus()` handles all TaskStatus enum values
- Wire Kanban drag-drop to `PATCH /api/tasks/[id]`. Create route if needed — use `saveTasks` from @agentforge/core (verified in spike).

## Screen 3: Approvals (`src/app/approvals/page.tsx`)
- Wire approve/reject buttons to `POST /api/approvals/[gateId]/decide`. Create route if needed.
- Replace `setRecentDecisions([])` with fetch for past decisions

## Screen 4: Spec viewer (`src/app/spec/page.tsx`)
- Replace hardcoded `SPEC_FILE_PATHS`, `fileStatuses`, `fileDrift`
- Create `src/app/api/spec/route.ts`: scan `agentforge/spec/` recursively
- Fetch dynamically on mount

## Screen 5: Traces (`src/app/traces/page.tsx`)
- Replace hardcoded `TASK_IDS`
- Create `src/app/api/traces/route.ts`: return task IDs from tasks.yaml
- Show "No traces yet" if empty

## Screen 6: Costs (`src/app/costs/page.tsx`)
- Replace hardcoded budget limits with values from agentforge.yaml
- Show "—" if budget section missing

## Screen 7: Integrations (`src/app/integrations/page.tsx`)
- Wire Settings modal Save to persist
- Ensure Penpot listed as "Primary"

## Screen 8: Agents (`src/app/agents/page.tsx`)
- Wire CreateAgentModal submit to POST /api/agents (create route if needed)
- Refetch after modal closes

## Constraints
- For unavailable data show "—" or "No data" — not fake numbers
- Use @agentforge/core imports verified in spike
- If any @agentforge/core import fails, STOP and report
```

### Test
```bash
npx nx run dashboard:build
npx nx run dashboard:dev
# Navigate each screen, verify data loads from API
```

---

## Phase 6: Renderer iframe bridge

**What it builds:** postMessage communication between dashboard and browser renderer.

*(No cross-package import risk — creates new code on both sides.)*

### Claude Code prompt

```
Build the iframe communication bridge between the dashboard and the browser renderer.

## Context

The browser renderer is at `packages/designspec-renderer/src/renderer/browser/app/`. Runs on its own Vite dev server.

## Task 1: Message type definitions

Create `packages/designspec-renderer/src/renderer/browser/iframe-protocol.ts`:

```typescript
export type ParentMessage =
  | { type: 'load-spec'; specJson: string }
  | { type: 'enable-tagging' }
  | { type: 'disable-tagging' }
  | { type: 'highlight-node'; nodeId: string }
  | { type: 'clear-highlights' }

export type ChildMessage =
  | { type: 'render-complete'; success: boolean; nodeCount: number }
  | { type: 'node-hovered'; nodeId: string | null; rect: { x: number; y: number; width: number; height: number } | null; catalogType: string | null }
  | { type: 'node-clicked'; nodeId: string; catalogType: string | null; computedStyles: Record<string, string> }
  | { type: 'ready' }
```

Export from barrel.

## Task 2: Renderer-side handling

Modify `DesignSpecRenderer.tsx`:
1. On mount, postMessage `{ type: 'ready' }` to parent
2. Listen for ParentMessage: load-spec (re-render), enable/disable-tagging, highlight/clear
3. Tagging enabled: mouseover/click on `[data-node]` elements send node-hovered/node-clicked with bounding rect, catalog type, computed styles
4. After render: send render-complete

## Task 3: Dashboard hook

Create `packages/dashboard/src/lib/hooks/use-renderer-bridge.ts`:
Returns: `{ isReady, loadSpec, enableTagging, disableTagging, highlightNode, clearHighlights, taggingEnabled, onNodeHovered, onNodeClicked, onRenderComplete }`

## Task 4: Health check

Add `/health` endpoint to Vite dev server config.

## Constraints
- Include `source: 'agentforge'` in all messages for filtering
- Don't break standalone renderer mode
- No new dependencies
```

### Test
```bash
npx nx run designspec-renderer:build
npx nx run dashboard:build
# Start renderer on port 4100 — standalone mode works
# Console: postMessage enable-tagging → hover elements → node-hovered messages fire
```

---

## Phase 7: Design Studio — page registry + canvas

**What it builds:** `/design` route with left + center panels.

### Claude Code prompt

```
Build the Design Studio page with page registry and design canvas.

## Task 1: Page at `packages/dashboard/src/app/design/page.tsx`

Three-panel layout:
- Left (200px): page registry
- Center (flex: 1): design canvas
- Right (260px): placeholder div "Inspector — Phase 8"

Fetch `GET /api/pages` on mount. Accept `?page=<pageId>` query param.

## Task 2: Page registry at `packages/dashboard/src/components/design/page-registry.tsx`

Props: `{ pages, selectedId, onSelect, onCreateNew }`

Page cards with name, designStatus badge (draft=gray, generating=blue-pulse, rendered=amber, correction=coral, approved=green, locked=purple), metadata, active highlight. "+ New page" opens create-page-modal from Phase 4.

## Task 3: Design canvas at `packages/dashboard/src/components/design/design-canvas.tsx`

States by designStatus:
- null: "Select a page" empty state
- draft: "Generate design" CTA (logs to console — Phase 9 wires real endpoint)
- generating: progress dots
- rendered/correction: iframe src="http://localhost:4100", useRendererBridge, fetch spec from GET /api/pages/{id}/design/spec, loadSpec(), enable tagging
- approved: iframe, tagging disabled, "Unlock" button

Action bar: "Submit feedback", "Approve", "Regenerate", iteration indicator.
Context bar: project name + component library + page count + token count.

## Task 4: Spec read endpoint

Create `packages/dashboard/src/app/api/pages/[pageId]/design/spec/route.ts`:
- GET: read `agentforge/designs/{pageId}.json`, 404 if missing
- PUT: write full DesignSpec JSON to file

## Constraints
- Check renderer health before loading iframe
- "Generate design" just logs in this phase
- 'use client'
```

### Test
```bash
# Start renderer on 4100, dashboard on 3000
# /design → pages list, click page with existing JSON → iframe renders
# Click elements → events in console
```

---

## Phase 8: Property editor (Tier 1 free edits)

**What it builds:** Inspector with Properties tab for direct JSON edits.

### Claude Code prompt

```
Build the property editor for the Design Studio inspector.

## Task 1: Inspector at `packages/dashboard/src/components/design/design-inspector.tsx`

Props: `{ selectedNode, designSpec, tags, score, iteration, onPropertyChange, onChatSubmit }`

Three tabs:

**Properties (green "free" badge):**
No node: "Click an element to edit properties"
Node selected: nodeId (mono), type, editable groups:
- Layout: direction (dropdown), gap (number), justify (dropdown), align (dropdown), padding (number)
- Dimensions: width (text), height (number)
- Appearance: background (text), borderRadius (number)
Read from DesignSpec node. On change call onPropertyChange(nodeId, path, value).

**AI edits (purple "LLM" badge):**
Score /100, tags list with status badges, mechanical check summary.

**Chat:**
Textarea + Send button. Toast "Structural edits coming soon". Cost hint.

## Task 2: Wire into design page

Replace right panel placeholder. On node click → set selectedNode. On property change → clone spec → patch node → loadSpec() to iframe → opacity flash.

## Task 3: Save button

In action bar: "Save" → PUT /api/pages/{id}/design/spec with current in-memory spec.

## Constraints
- Instant feedback — patch in memory, send to iframe, no disk write per change
- Read from DesignSpec JSON, not computed styles
- Import DesignSpecV2 type (verified in spike)
```

### Test
```bash
# Select page → click element → Properties shows fields → change gap → iframe re-renders → Save → reload persists
```

---

## Phase 9: Design generation pipeline API

**What it builds:** Endpoint that triggers design generation using real pipeline imports.

### Claude Code prompt

```
Wire design generation to the dashboard API. Use imports verified in the integration spike.

## Task 1: POST /api/pages/[pageId]/design

Create `packages/dashboard/src/app/api/pages/[pageId]/design/route.ts`:

POST:
1. Read page description from pages.yaml
2. Read design tokens, component catalog from project
3. Set designStatus to 'generating'
4. Design pipeline — check `packages/agents-ux/src/ux-design/` for planning/design agent functions:
   - If a callable pipeline function exists: import and call it
   - If the agents exist but aren't wired as a single callable function: STOP and report what exists (function names, signatures) and what interface is needed. Do not create a placeholder.
5. After JSON generated:
   - Import BrowserSession from @agentforge/designspec-renderer (verified import path)
   - Render spec, screenshot, save to `agentforge/designs/{pageId}.png`
   - Import and run mechanical checks
6. Set designStatus to 'rendered'
7. Return `{ specPath, screenshotPath, mechanicalIssues }`

If the LLM pipeline is not yet callable: STOP after step 3. Report exactly what interface needs to exist. Don't create a placeholder.

If BrowserSession or mechanical checks fail to import: STOP and report. They were verified in the spike.

GET: Return `{ designStatus, specPath, screenshotPath, mechanicalIssues, correctionIteration, score }`

## Task 2: POST /api/pages/[pageId]/design/approve

Set designStatus to 'approved', return 200.

## Task 3: Wire canvas buttons

"Generate" → POST design → loading → reload iframe
"Approve" → POST approve → update status
"Regenerate" → POST design again

## Constraints
- No SSE — simple request/response with loading
- No placeholder LLM calls. Report what's missing.
- If Playwright is too heavy for API process, report this as a constraint.
- On failure, reset designStatus to 'draft'
```

### Test
```bash
npx nx run dashboard:build

# If pipeline exists:
curl -X POST http://localhost:3000/api/pages/settings/design
# Returns specPath + mechanicalIssues

# If pipeline missing:
# Build succeeds, endpoint returns clear error with needed interface spec
```

---

## Phase 10: Vision correction wiring

**What it builds:** Connects "Submit feedback" to real BrowserCorrectionPipeline.

### Claude Code prompt

```
Wire vision correction to the Design Studio. Use imports verified in the integration spike.

## Task 1: POST /api/pages/[pageId]/design/correct

1. Accept `{ tags: [{ nodeId, feedback }] }`
2. Read DesignSpec from `agentforge/designs/{pageId}.json`
3. Set designStatus to 'correction'
4. Import BrowserCorrectionPipeline from @agentforge/agents-ux (verified path)
5. Construct with verified dependencies (BrowserSession, BrowserCorrectionAdapter)
6. Call run/execute with spec + tags
7. Write corrected spec, increment iteration
8. Run mechanical checks
9. Set designStatus to 'rendered'
10. Return `{ iteration, mechanicalIssues, patchesApplied }`

If import fails: STOP and report. Verified in spike.
If pipeline needs LLM provider config: report what's needed (env vars, setup). Don't skip.

## Task 2: Tagging flow in canvas

On node click → auto-switch to AI edits tab → show nodeId + textarea → "Add tag" → local tags array → tag count on "Submit feedback" button.

Wire "Submit feedback": collect pending tags → POST /correct → loading → update statuses → reload iframe.

## Task 3: Tag input in inspector AI edits tab

Clicked node: show nodeId + textarea "Describe what's wrong" + "Add tag" button. Tags list below with status badges.

## Constraints
- Max 3 iterations — disable button after 3
- Import real pipeline. No stubs.
- Monotonic guard is in existing pipeline — don't re-implement
```

### Test
```bash
# Full flow: select page → click element → tag feedback → Submit → correction runs → design updates → "1/3"

curl -X POST http://localhost:3000/api/pages/settings/design/correct \
  -H "Content-Type: application/json" \
  -d '{"tags":[{"nodeId":"budget-badge","feedback":"should be compact pill"}]}'
# Must call real correction pipeline
```

---

## Post-Phase 10: What's next

After 11 phases you'll have:

- Verified integration layer (spike proves all imports)
- All 11 dashboard screens wired to real data
- Design Studio at `/design` with real pipeline integrations (or clear reports of what's missing)

**Next priorities:**
1. Build the LLM pipeline interface if Phase 9 reported it missing
2. SSE for generation progress
3. Blast radius analysis for cross-page changes
4. Prompt enhancer (Haiku call)
5. Design token editor
6. Version history with rollback