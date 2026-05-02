# CHIP UX Phase 4.2+ — Remaining Pages Handoff Check

## Instructions

You are starting a fresh session. Phases 1, 2, 4.1 (Home), and 4.0 (Runs) are committed. Next is Phase 4.2+: redesigning the remaining pages using the Map → Question → Research → Propose → Validate → Build → Gate methodology.

Answer every question below using ONLY the project's canonical docs — start from `CLAUDE.md` and follow the reading order it prescribes.

Cite every answer as `<file> → <section/line>`.

After the last question, STOP. Do not self-grade, summarize, or propose next steps.

## Turn 1 — Questions

1. What are the 4 stages of the spine? Name them in order and explain why the old 5-phase model was wrong.

2. What is the priority order for the remaining Phase 4 pages after Home and Runs? Name at least 5 in order.

3. What methodology must be applied to every page redesign? Name all 7 steps.

4. The execution plan has a "Context for Phase 4.0 implementers" section with 10 gotchas. Name any 4 of them.

5. **Trap question:** Should you use `transpilePackages` or tsconfig `paths` pointing to `../*/src/` for monorepo packages in the dashboard?

6. What shared component was extracted during Phase 4.0, and what two variants does it support? Where does it live?

7. What is ADR-050 about? Name the two vision Layer 14 deviations it documents and their triggers to revisit.

8. The `/api/pipeline` endpoint still exists. What is its status, and what endpoint replaced it?

9. What Mantine component prop is used for expandable/collapsible content? (Not `in`, not `opened` — what is it in Mantine v9?)

10. **Trap question:** Should you use `router.refresh()` after a user action that changes data?

11. What emergency controls does the Runs page have? Where are they defined in the vision?

12. Name the 3 HITL gates and their positions between spine stages.

13. Name the first 3 docs in the CLAUDE.md reading order. (Coverage probe.)

14. What design principles from the execution plan forbid emojis and AI aesthetic? Quote the key phrases.

15. What is the `RunStatus.type` constraint that the next implementer needs to know about when adding new spine stages?

## Turn 3 — Doc gaps

After grading, copy back:

## Doc gaps to report upstream
- (list any questions where the docs were silent, unclear, or contradictory)

## Hard-fail triggers

- Agent thinks Pipeline should show 5 phases (Design/Spec/Code Gen/CI/CD/Observe)
- Agent proposes adding `@agentforge/core` to `transpilePackages`
- Agent uses `router.refresh()` instead of `window.location.reload()` for data refresh
- Agent uses gradient rings or glass cards ("AI aesthetic")
- Agent duplicates SpineRail instead of importing from `@/components/spine/spine-rail`
- Agent adds new consumers of `/api/pipeline` instead of `/api/runs`

## Soft-fail triggers

- Agent doesn't know about ADR-050's two deviations
- Agent doesn't know the Mantine v9 Collapse prop name (`expanded`)
- Agent doesn't mention the Map → Question → Research → Propose → Validate → Build → Gate methodology
- Agent doesn't know `RunStatus.type` is a closed union

## Maintenance

When `docs/plans/active/chip-ux-overhaul/execution-plan.md` or `CLAUDE.md` changes, update the answer key to match.

Answer key: `docs/plans/active/chip-ux-overhaul/phase4-pages-handoff-key.md` (read only after answering all questions).
