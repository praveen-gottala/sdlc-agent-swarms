# CHIP UX Phase 4.0 Pipeline → Runs — Answer Key

## Turn 2 — Answers

1. **Clarifier → Architect → Implementer → Reviewer**. Vision **Layer 3** (Agent taxonomy). The 4-stage vertical spine with specialist tools.
   - `docs/vision.md` → Layer 3
   - `CLAUDE.md` → Architecture section

2. Current page shows: **Design, Spec, Code Gen, CI/CD, Observe**. Wrong because these are the old PRD phases, not the vision's 4-stage spine. The vision (Layer 3) replaced the flat 10-agent model with a sequential spine.
   - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 4.0 "Pipeline is wrong"

3. **SpineRun** top-level fields: **runId, projectId, threadId** (LangGraph), **status** (idle/running/interrupted/complete/failed), **currentStage** (clarifier/architect/implementer/reviewer), **interruptGate** (clarification/design_approval/code_merge/null), **stages[]**, **tasks[]**.
   - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 4.0 "Proposed data model"

4. **"graph visualization of the current spine run. Highlighted current node. Pending HITL approvals surfaced prominently. Cost and progress per node."**
   - `docs/vision.md` → Layer 14, Target vision, surface 2

5. **NO.** The Home page is a **landing pad** that routes you to the right page. The React Flow DAG of concurrent runs belongs on the **Pipeline/Runs page**. Home shows a compact spine visual for project lifecycle context, not operational detail.
   - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → "Context for Phase 4.0 implementers" point 4

6. **Home = landing pad** — orients you and routes you ("where should I go first?"). Shows project identity, attention items, and quick actions. **Pipeline/Runs = mission control** — shows active runs, DAG visualization, run history, emergency controls. Home doesn't duplicate Pipeline functionality.
   - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 4.1 Implementation Status + Context for Phase 4.0 implementers point 4

7. **Tabler Icons** (`@tabler/icons-react`). Design principle **#2**: "No emojis. Sidebar nav items, status indicators, headings — use proper icons (Tabler Icons via `@tabler/icons-react`), never emoji characters. Emojis scream 'prototype.'"
   - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Design Principles

8. **Git worktrees.** Multiple tasks run concurrently in separate git worktrees. Merging via normal git, not by agent coordination. `max_concurrent_agents` applies at the task level, not within a task.
   - `docs/vision.md` → Layer 8 "Cross-task parallelism"

9. Three HITL gates: **(1) Clarification round** — human answers batched questions from Clarifier. **(2) Design/API approval** — after design batch coherence, before Implementer. **(3) Code review** — per-hunk diff review before merge (GitHub PR).
   - `docs/vision.md` → Layer 10 "Three structural HITL checkpoints"

10. **Pause All / Abort All** emergency controls.
    - `docs/vision.md` → Layer 14 cross-cutting
    - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 4.0 "Emergency controls"

11. **NO.** Use **`window.location.reload()`** instead. Client components use `useEffect(() => {...}, [])` for data fetching. `router.refresh()` only re-renders server components — client-side useEffects don't re-fire.
    - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → "Context for Phase 4.0 implementers" point 1

12. **`nx run-many -t build`** — rebuilds all monorepo packages so `dist/` is current. Dashboard uses pre-built dist, not raw TypeScript source. Without rebuilding, stale dist causes old behavior.
    - `CLAUDE.md` → "Dashboard Dev Server (IMPORTANT)"

13. **`docs/vision.md`** (architecture authority) → **`docs/specs/PRD.md`** (product scope) → **`CLAUDE.md`** (development discipline).
    - `CLAUDE.md` → "Reading order (IMPORTANT)"

14. Any 3 of: **(1)** `window.location.reload()` not `router.refresh()` for project switching. **(2)** E2E hydration selectors fire before async data loads — use `toPass()` retry. **(3)** Mantine v9 Select puts `data-testid` on the `<input>` directly. **(4)** Home is a landing pad, not mission control. **(5)** No AI aesthetic — no gradient rings, glass cards. **(6)** `next build` also needs `--webpack`.
    - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → "Context for Phase 4.0 implementers"

15. **`element.evaluate((el) => el instanceof HTMLInputElement ? el.value || el.placeholder : el.textContent)`** — because Mantine v9 Select renders `data-testid` directly on the `<input>` element, not a wrapper div. `innerText()` and `textContent()` return empty on inputs.
    - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → "Context for Phase 4.0 implementers" point 3
    - `e2e/pages/sidebar.po.ts` → `getProjectName()`
