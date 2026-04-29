# Dashboard Pipeline Planning Failure

**Priority:** High — blocks all design generation from the dashboard
**Discovered:** 2026-04-28
**Status:** Partially fixed (2026-04-29) — root cause confirmed, error handling improved

## Root Cause (Confirmed 2026-04-29)

**Vertex AI quota exhaustion.** The planning stage defaults to `claude-opus-4-7`
(`pipeline.ts:30`). The project uses Vertex AI (`AGENTFORGE_USE_VERTEX=true`) which
has a tight per-minute input token quota for Opus. The 429 error was misclassified as
`INVALID_RESPONSE` because Vertex AI wraps quota errors as generic exceptions (not
`Anthropic.APIError` with status 429). The error's `raw` field contained the real
message but `nodes.ts` only read `message` (which was undefined), producing the
unhelpful "Planning stage failed" string.

**Why CLI works:** CLI also uses Vertex AI but runs sequentially with pauses between
pages. The dashboard's "Generate All" fires 4 concurrent pipelines, exhausting the
per-minute quota immediately.

**Fixes applied (2026-04-29):**
1. `packages/providers/src/claude/claude-provider.ts` — `mapApiError` now detects
   Vertex 429/RESOURCE_EXHAUSTED in the catch-all and returns `RATE_LIMITED` instead
   of `INVALID_RESPONSE`.
2. `packages/providers/src/types.ts` — `RATE_LIMITED` error type now includes optional
   `message` field for the quota error detail.
3. `packages/agents-ux/src/design-pipeline/nodes.ts` — all three stage nodes (research,
   planning, design) now read `err.raw` as fallback when `err.message` is undefined.

**Remaining work:**
- Pipeline should retry on `RATE_LIMITED` with backoff instead of failing immediately.
- Consider using `claude-sonnet-4-6` for planning instead of `claude-opus-4-7` to
  reduce quota pressure.
- "Generate All" should run pages sequentially, not concurrently, on Vertex AI.

## Problem

The design pipeline fails at the planning stage when triggered from the dashboard ("Generate All" or per-page generate). The exact same pipeline succeeds when triggered from the CLI (`design:page`). All 4 ShoppingGuys pages fail with "Planning stage failed" from dashboard but generate successfully via CLI in ~120s each.

## Symptoms

1. Activity sidebar floods with "Pipeline failed: Pipeline failed at planning: Planning stage failed"
2. Pages remain at "Spec pending" indefinitely
3. Research stage completes successfully (research briefs are cached and reused)
4. Planning stage starts then fails within ~5 seconds (too fast for a real LLM call)
5. The UI log panel misleadingly says "Design generated for X" even when the pipeline failed (separate bug, partially fixed)

## What Works

- **CLI path:** `node packages/cli/dist/bin.js design:page product-listing --project-dir .` from `apps/shoppingguys/` succeeds every time. Full pipeline: research (cached) -> planning -> design -> evaluation -> correction.
- **Dashboard research stage:** Completes and caches research briefs correctly.
- **Dashboard design rendering:** Once a design JSON exists (from CLI), the dashboard renders it correctly in the iframe.

## Root Cause Investigation So Far

### Dashboard vs CLI pipeline setup

| Aspect | CLI (`design-page.ts`) | Dashboard (`design/route.ts`) |
|--------|------------------------|-------------------------------|
| Pipeline entry | `runDesignPipeline(input)` | `runDesignPipeline(input)` (same) |
| Input builder | CLI builds inline in `designPageAction()` | `buildDashboardPipelineInput()` in `pipeline-input-builder.ts` |
| Provider | `createClaudeProvider(model, config)` | `createClaudeProvider(model, authConfig)` via `providerFactory` |
| Agent context | `createPipelineContext()` | `createDashboardPipelineContext()` in `pipeline-context.ts` |
| Auth | `resolveClaudeAuth()` + env vars | `resolveClaudeAuth()` + env vars (same pattern) |

### Key files to investigate

1. **`packages/dashboard/src/app/api/_lib/pipeline-input-builder.ts`** — Builds the `PipelineInput`. Compare field-by-field with CLI's input construction in `packages/cli/src/commands/design-page.ts:220-350`.
2. **`packages/dashboard/src/app/api/_lib/pipeline-context.ts`** — Creates `AgentContext`. Missing fields vs CLI's `createPipelineContext`?
3. **`packages/dashboard/src/app/api/pages/[pageId]/design/route.ts:162-230`** — The `runPipelineAsync` function. Check error handling around `runDesignPipeline`.
4. **`packages/agents-ux/src/design-pipeline/nodes.ts:47-71`** — `planningNode()`. Added `console.error` logging (line 68) to capture the actual error message from `uxPlanningWork`. **Rebuild agents-ux (`nx build agents-ux`) to pick up this change.**
5. **`packages/agents-ux/src/ux-planning/ux-planning.ts:300-415`** — The `uxPlanningWork` function. Check each early-return `Err` path.

### Hypotheses (not yet tested)

1. **Provider/model resolution failure** — The dashboard's `providerFactory` might not correctly resolve the planning model. The planning stage uses `resolveModelForRole('ux_planner', ...)` which might resolve to a model string the dashboard provider can't handle.
2. **File path resolution** — `uxPlanningWork` calls `loadSystemPrompt()` which uses `import.meta.url` to find the prompt file. In Next.js server-side context, module resolution might differ from CLI — the prompt `.md` file might not be found at the expected path.
3. **Design tokens or specs missing** — `uxPlanningWork` returns `Err` if `tokensSpec` is falsy (line 323-327). The dashboard's `readYamlFile` uses a relative path from `getActiveProjectRoot()` — check if this resolves correctly.
4. **Structured output schema** — The planning LLM call uses `responseSchema: PLANNING_OUTPUT_SCHEMA`. If the dashboard provider is configured differently (e.g., missing structured output support), the call could fail.

### How to reproduce

1. Start the dashboard: `npx next dev --port 3000` from `packages/dashboard/`
2. Switch to the ShoppingGuys project (project selector in sidebar)
3. Go to Design Studio
4. Click "Generate All" or click any "Spec pending" page
5. Watch Activity sidebar — "Planning failed: Planning stage failed" appears within ~5 seconds

### How to debug

1. Build agents-ux to pick up the `console.error` logging: `nx build agents-ux`
2. Restart the Next.js dev server
3. Trigger a single page generation from the dashboard
4. Check the **Next.js terminal** (not the browser console) for `[planningNode] Planning failed: <detail>`
5. The detail message will point to the specific `Err` return path in `uxPlanningWork`

## Additional Bugs Found in This Session

### 1. "Design generated" log is misleading (PARTIALLY FIXED)

**File:** `packages/dashboard/src/app/(dashboard)/design/page.tsx:1045-1065`

The "Generate All" flow logged "Design generated for X" whenever the POST request returned 200, regardless of whether the async pipeline run succeeded or failed. The poll loop checked for `status === 'complete' || status === 'failed'` but never inspected which one it was.

**Fix applied:** Now checks `runStatus` after polling. Logs ERROR on failure with the run error message. Only logs "Design generated" on `status === 'complete'`.

### 2. CLI doesn't update `designStatus` in pages.yaml

**File:** `packages/cli/src/commands/design-page.ts`

After a successful pipeline run, the CLI writes the design spec to disk but does NOT update `designStatus: 'rendered'` in `pages.yaml`. The dashboard route DOES update it (line 205 of `design/route.ts`). This means CLI-generated designs don't show as "Rendered" in the dashboard until manually edited.

**Fix needed:** After successful pipeline completion in `design-page.ts`, update the page's `designStatus` to `'rendered'` in `pages.yaml`.

## How to Navigate the Dashboard (for debugging agents)

### Getting to Design Studio
1. Open `http://localhost:3000` — lands on the main dashboard
2. Click "Design Studio" in the left sidebar (or navigate to `/design`)

### Switching projects
1. Click the project name at the bottom of the left sidebar (e.g., "ShoppingGuys")
2. A dropdown shows all discovered projects (from `apps/` and `fixtures/`)
3. Click a project name to switch

### Design Studio layout
- **Left panel:** Page registry — lists all pages from `pages.yaml` with status badges (Rendered/Spec pending/Generating)
- **Center panel:** Design canvas — renders the selected page's design spec in an iframe (port 4100 Vite renderer)
- **Right panel:** Tabs — Properties (node inspector), AI Edits (LLM corrections), Chat, Audit (mechanical + vision)
- **Toolbar:** Prototype, Check Coherence, Audit, Generate All
- **Bottom:** Logs panel (click "Logs" to expand), action buttons (Save, Regenerate, Approve)

### Generating designs
- **Single page:** Click a page in the left panel, then click "Regenerate" at the bottom
- **All pages:** Click "Generate All" in the toolbar
- **CLI fallback:** When dashboard pipeline fails, use `node packages/cli/dist/bin.js design:page <pageId> --project-dir <project-path>` from the monorepo root. Remember to manually set `designStatus: rendered` in `pages.yaml` afterward.

### Prototype mode
- Click "Prototype" in the toolbar (requires 2+ designed pages)
- Full-screen rendering of the current page
- Screen selector bar at the bottom to switch between pages
- Click "Exit Prototype" to return to Design Studio

### Audit tab
- **Mechanical Audit:** Click "Audit" in the toolbar. Compares spec JSON vs rendered DOM — shows Pass/Fail/Drop per node, plus layout issues (badge-oversize, overlap, etc.)
- **Deep Audit (Vision):** Click "Run Deep Audit" in the Audit tab. Calls claude-opus-4-7 vision model (~$0.05-0.10/page). Shows score and issues.
- **Fix All:** After Deep Audit, "Fix All" triggers the correction pipeline (`runBrowserCorrectionPipeline`) for iterative spec patching.

### Activity sidebar
- Right side — shows pipeline events in reverse chronological order
- Useful for seeing stage transitions: Research running -> Research complete -> Planning running -> Planning failed
- Click refresh button to update
