# CHIP UX Overhaul Phase 2 Complete — Answer Key

## Turn 2 — Answers

1. **`nx run-many -t build`** — rebuilds all monorepo packages so `dist/` is current. The dashboard uses **pre-built dist** (not raw TypeScript source). Without rebuilding, stale `dist/` causes the dashboard to show old behavior.
   - `CLAUDE.md` → "Dashboard Dev Server (IMPORTANT)"

2. **Turbopack doesn't support `extensionAlias`** which the monorepo's `.js` → `.ts` ESM convention requires. The `--webpack` flag forces Next.js 16 to use webpack instead of the default Turbopack.
   - `docs/lessons-learned-rules.md` → "Next.js 16 + Mantine v9 Compatibility Gotchas"
   - `packages/dashboard/package.json` → `"dev": "next dev --webpack --port 3000"`

3. **NO.** The `paths` entries were **removed** (2026-04-29). They were the root cause of 60s cold starts — `"@agentforge/core": ["../core/src/index.ts"]` forced webpack to compile 382 extra TypeScript files from source instead of using pre-built `dist/`.
   - `docs/lessons-learned-rules.md` → "Dashboard Dev Server: tsconfig paths Force Source Compilation"
   - `packages/dashboard/tsconfig.json` → only has `"@/*": ["./src/*"]`

4. Five groups: **BUILD** (Pipeline, Design Studio, Spec), **EXECUTE** (Tasks, Agents, Approvals), **GOVERN** (Trust, Budget), **CONFIGURE** (Integrations), **EXTERNAL** (Observability → Langfuse at localhost:3001).
   - `packages/dashboard/src/components/layout/sidebar-nav.tsx` → `NAV_SECTIONS`

5. **Traces** (removed — Langfuse trace viewer), **Audit** (removed — Langfuse audit trail), **Costs** (renamed to **Budget** — cost viewing → Langfuse, budget config stays). **Observability** external link added pointing to Langfuse.
   - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 2.5 findings

6. **`AppShell`** wrapping the dashboard with **`AppShell.Header`**, **`AppShell.Navbar`**, **`AppShell.Main`**, **`AppShell.Aside`**.
   - `packages/dashboard/src/components/layout/dashboard-shell.tsx`

7. Min: **140px** (below this → snaps to **64px** collapsed/icon-only). Max: **360px**. Default: **220px**. Width persisted in localStorage key `chip-sidebar-width`. Double-click resize handle to toggle collapse/expand.
   - `packages/dashboard/src/components/layout/dashboard-shell.tsx` → constants at top

8. **localStorage** key **`chip-activity-open`**. Saved as `'true'`/`'false'` string. Restored on mount.
   - `packages/dashboard/src/components/layout/dashboard-shell.tsx` → `ACTIVITY_KEY`

9. **NO, it's wrong.** Shows the old 5-phase model. Should show the **4-stage spine** from vision Layer 3: **Clarifier → Architect → Implementer → Reviewer**. Phase 4.0 plans to replace Pipeline with a **Runs** view showing active/recent pipeline executions with a `SpineRun` data model.
   - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 4.0
   - `docs/vision.md` → Layer 3

10. Seven steps: **Map** (list screens/data/actions) → **Question** (vision alignment, necessity) → **Research** (competitor patterns) → **Propose** (modernized design) → **Validate** (check against vision.md) → **Build** (Mantine, browser-test) → **Gate** (/mid-session-drift-check, /verify-done).
    - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 4 Methodology

11. **Home `/`** (CRITICAL — emojis, generic grid, no data, first investor impression), **Pipeline `/pipeline`** (CRITICAL — wrong data model), **Trust `/trust`** (CRITICAL — completely empty page).
    - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Visual Audit Baseline table

12. **`next build && next start`** (production mode). Dev mode compiles pages on-demand (4s per page on first visit), which blocks Chrome DevTools MCP with 30s+ timeouts. Production mode pre-compiles all pages.
    - `docs/lessons-learned-rules.md` → "Next.js 16 + Mantine v9 Compatibility Gotchas" point 4

13. **`docs/vision.md`** (architecture authority) → **`docs/specs/PRD.md`** (product scope) → **`CLAUDE.md`** (development discipline). This is the reading order specified in CLAUDE.md.
    - `CLAUDE.md` → "Reading order (IMPORTANT)"

14. **NO.** Adding `@agentforge/core` to `transpilePackages` forces webpack to compile it from source (because `tsconfig.base.json` has `customConditions: ["@agentforge/source"]` which leaks into Next.js). This was the root cause of 60s cold starts. All monorepo packages use pre-built `dist/`.
    - `docs/lessons-learned-rules.md` → "Dashboard Dev Server: tsconfig paths Force Source Compilation"
    - `packages/dashboard/next.config.js` → no `transpilePackages` at all

15. **Falls back to `new MemorySaver()`.** `createCheckpointer()` tries Postgres when `DATABASE_URL` is set. Dashboard API routes must try/catch and fall back to in-memory checkpointer when database is unavailable.
    - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Implementation gotchas (Tasks 1.7-1.8)" fifth bullet
