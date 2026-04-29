# CHIP UX Overhaul Phase 2 Complete — Handoff Check

## Instructions

You are starting a fresh session. Phase 2 (Layout Shell) implementation is complete but needs verification (/verify-done) and a commit. Then proceed to Phase 3 (Clarifier /new showcase) or Phase 4 (page modernization) — user decides.

Answer every question below using ONLY the project's canonical docs — start from `CLAUDE.md` and follow the reading order it prescribes.

Cite every answer as `<file> → <section/line>`.

After the last question, STOP. Do not self-grade, summarize, or propose next steps.

## Turn 1 — Questions

1. What must you run BEFORE starting the dashboard dev server? Why?

2. What is the `--webpack` flag in the dashboard's dev script for? What happens without it?

3. **Trap question:** The dashboard's `tsconfig.json` used to have `paths` entries like `"@agentforge/core": ["../core/src/index.ts"]`. Are they still there? Why or why not?

4. Name all 5 sidebar section groups and what pages are in each.

5. Three tabs were removed from the sidebar during Phase 2. Which ones, and what replaced them?

6. What Mantine components replaced the old hand-rolled layout? Name the 4 AppShell sub-components used.

7. The sidebar is draggable. What are the min/max width constraints, and what happens when you drag below the minimum?

8. Where is the activity panel toggle state persisted? What localStorage key?

9. The Pipeline page shows 5 phases (Design, Spec, Code Gen, CI/CD, Observe). Is this correct? What should it show instead, and why?

10. What is the Phase 4 methodology for modernizing each page? Name the 7 steps.

11. What are the top 3 CRITICAL pages from the visual audit that need redesign first?

12. For visual auditing, should you use `next dev` or `next build && next start`? Why?

13. What are the three critical docs to read before any implementation? (Coverage probe — name them in order.)

14. **Trap question:** Should you add `@agentforge/core` to `transpilePackages` in `next.config.js`?

15. When `createCheckpointer()` fails in a dashboard API route, what should happen?

## Turn 3 — Doc gaps

After grading, copy back:

## Doc gaps to report upstream
- (list any questions where the docs were silent, unclear, or contradictory)

## Hard-fail triggers

- Agent adds `@agentforge/core` to `transpilePackages` (causes 60s cold starts)
- Agent adds tsconfig `paths` pointing to `../*/src/` (same issue)
- Agent uses `renderRoot` instead of `component={Link}` for NavLink routing
- Agent uses `next dev` without `--webpack` flag (Turbopack incompatible)
- Agent doesn't know about the grouped sidebar sections
- Agent thinks Pipeline should show 5 old phases instead of 4-stage spine

## Soft-fail triggers

- Agent doesn't mention `next build && next start` for visual audits
- Agent doesn't know about the draggable sidebar resize
- Agent doesn't mention activity panel localStorage persistence
- Agent doesn't know Phase 4 methodology (Map → Question → Research → Propose → Validate → Build → Gate)

## Maintenance

When `docs/plans/active/chip-ux-overhaul/execution-plan.md` or `CLAUDE.md` changes, update the answer key to match.

Answer key: `docs/plans/active/chip-ux-overhaul/phase2-complete-handoff-key.md` (read only after answering all questions).
