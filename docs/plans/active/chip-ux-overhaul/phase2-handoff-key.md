# CHIP UX Overhaul Phase 2-3 — Answer Key

## Turn 2 — Answers

1. **CHIP = Crafted Human Intelligence Platform.** Rebrand from AgentForge (2026-04-28). Dashboard strings in `sidebar-nav.tsx` (logo + "CHIP"), `layout.tsx` (page title "CHIP Dashboard"), `page.tsx` ("CHIP Dashboard" heading, "Create a new CHIP project").
   - `CLAUDE.md` → Active plans item 5
   - `packages/dashboard/src/components/layout/sidebar-nav.tsx` → logo section
   - `packages/dashboard/src/app/layout.tsx` → metadata

2. **Mantine v9.1.1** (`@mantine/core`, `@mantine/hooks`, `@mantine/notifications`). Coexists with Tailwind — Mantine components accept `className` prop for Tailwind utilities. PostCSS config has both `postcss-preset-mantine` and `@tailwindcss/postcss`. `MantineProvider` wraps the app with `forceColorScheme="dark"`.
   - `packages/dashboard/package.json` → dependencies
   - `packages/dashboard/postcss.config.js`
   - `packages/dashboard/src/app/layout.tsx` → MantineProvider
   - `packages/dashboard/src/theme.ts` → chipTheme

3. **`@xyflow/react`** (React Flow v12) + **Dagre** for auto-layout. Industry standard for directed acyclic graph rendering.
   - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Feature-to-Library Mapping table

4. **Vercel AI SDK** — `ai` package with `@ai-sdk/anthropic`. Hook: **`useChat`** for SSE streaming, token-by-token rendering.
   - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Feature-to-Library Mapping table

5. **153 seconds of typing dots** with no stage visibility. The API waited for the entire 6-node pipeline before responding. Fix: **SSE streaming** — emit stage progress events per node, streaming text for AI messages. `ReadableStream` in the API route, custom `useClarifierStream` hook on the frontend.
   - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 3.1
   - `docs/plans/active/clarifier-initiative/execution-plan.md` → Task 1.8 progress note

6. **NO.** Do NOT add `eventBus` to `ClarifierDeps`. No pipeline stage node in the codebase has `eventBus` as a dependency. The design pipeline uses a sink pattern where **callers** handle telemetry, not graph nodes. `emitComplete` stays as a no-op state transition. `runClarifierPipeline()` emits `RequirementsClarified` via `writeBridgeEvent()`.
   - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Implementation gotchas (Tasks 1.7-1.8)" block
   - `CLAUDE.md` → "Event Registry Completeness" scope clarification

7. Check **`getState(config).next.length > 0`** after `invoke()`. LangGraph's `interruptBefore` returns normally — `invoke()` does NOT throw `GraphInterrupt`. The original code had a `catch` block for `GraphInterrupt` that never fired, so `interrupted` was always `false`. Fixed in `run.ts:74-79`.
   - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Implementation gotchas (Tasks 1.7-1.8)" first bullet
   - `packages/agents-clarifier/src/run.ts` → lines 74-79

8. **`import.meta.url`** in prompt-loading functions resolves to `.next/server/app/api/clarifier/` under webpack, where `.md` prompt files don't exist. `serverExternalPackages` tells Next.js to load the package as a regular Node.js module (not webpack-compiled), so `import.meta.url` works correctly. Must `nx build agents-clarifier` first so `dist/` exists.
   - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Implementation gotchas (Tasks 1.7-1.8)" third bullet
   - `packages/dashboard/next.config.js` → `serverExternalPackages`

9. Pipeline stepper: **`Mantine Stepper`**. Activity timeline: **`Mantine Timeline`**. Question cards: **`Mantine Radio.Group + Card`**.
   - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Feature-to-Library Mapping + Phase 3.2, 3.5

10. Six stages: (1) **Context Retriever** — loads catalog + design tokens (bootstrap) or calls 5 RAG tools (evolution). (2) **PRD Analyzer** — extracts structured PRD from raw input using Claude Opus. (3) **Gap Detector** — deterministic checklist + ClarifyGPT divergence analysis. (4) **Question Prioritizer** — EVPI scoring, budget enforcement, assumption ledger. (5) **Story Writer** — EARS acceptance criteria, FeaturePlan DAG, EnrichedRequirement. (6) **Critic** — INVEST/EARS/DAG deterministic quality checks with bounded retry.
    - `docs/plans/active/clarifier-initiative/execution-plan.md` → Tasks 1.1-1.6

11. Four CSS utilities: **`glass`** (glassmorphic background + border + backdrop-blur), **`gradient-text`** (blue-to-purple gradient clip), **`gradient-btn`** (gradient background with hover glow), **`shimmer-skeleton`** (animated loading skeleton). Also: `glass-hover`, `gradient-border`, `focus-ring`.
    - `packages/dashboard/src/app/globals.css` → @layer components

12. **`docs/plans/active/chip-ux-overhaul/execution-plan.md`**. Five phases: (1) Brand Identity + Design Tokens, (2) Layout Shell Redesign, (3) Clarifier `/new` Showcase, (4) Migrate Existing Pages, (5) Roadmap Items (document only).
    - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → top-level headers

13. Phase 1 exit criteria: (1) User submits seed at `/new`, (2) clarifier asks **<=7 questions** in **<=3 rounds**, (3) produces **structured PRD YAML** with **assumption ledger**, (4) dashboard shows **PRD for approval**, (5) **both modes** (bootstrap + evolution) work, (6) **HITL interrupt persists in Postgres** (survives page refresh), (7) all tests green (**typecheck, unit, lint, E2E**).
    - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Phase 1 exit criteria"

14. **Do NOT use `res.json()`.** The API route returns **SSE (Server-Sent Events)** via `ReadableStream` with `Content-Type: text/event-stream`. The frontend consumes via `fetch()` + `ReadableStream.getReader()` (not `EventSource` because POST body is needed). This enables real-time stage progress instead of a 153-second wait.
    - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 3.1
    - `packages/dashboard/src/app/api/clarifier/route.ts` → ReadableStream

15. **Falls back to `new MemorySaver()`.** `createCheckpointer()` tries Postgres when `DATABASE_URL` is set in `.env`. If the Postgres container isn't running, it throws `ECONNREFUSED`. The API route wraps it in try/catch and falls back to in-memory checkpointer.
    - `docs/plans/active/clarifier-initiative/execution-plan.md` → "Implementation gotchas (Tasks 1.7-1.8)" fifth bullet
    - `packages/dashboard/src/app/api/clarifier/route.ts` → checkpointer try/catch
