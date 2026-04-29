# CHIP UX Phase 4.0 Pipeline → Runs — Handoff Check

## Instructions

You are starting a fresh session. Phase 2 (Layout Shell) and Phase 4.1 (Home page) are committed. Next is Phase 4.0: redesigning the Pipeline page from the wrong 5-phase model to a Runs view aligned with the 4-stage spine.

Answer every question below using ONLY the project's canonical docs — start from `CLAUDE.md` and follow the reading order it prescribes.

Cite every answer as `<file> → <section/line>`.

After the last question, STOP. Do not self-grade, summarize, or propose next steps.

## Turn 1 — Questions

1. What are the 4 stages of the spine? Name them in order with their vision Layer reference.

2. The current Pipeline page shows 5 phases. Name them and explain why they're wrong.

3. What data model does the execution plan propose for `SpineRun`? Name the top-level fields.

4. What does vision Layer 14 prescribe for the Pipeline surface? Quote the key phrase.

5. **Trap question:** Should the Home page show a React Flow DAG of concurrent runs?

6. What is the difference between the Home page's role and the Pipeline/Runs page's role?

7. The Pipeline page currently uses emoji icons (e.g. `🎨`, `📋`, `⚡`). What should it use instead, and what design principle forbids emojis?

8. When implementing cross-task parallelism, what mechanism does the vision prescribe? (Not agent-level parallelism — task-level.)

9. What are the 3 HITL gates that should be visible on the Runs page? Name them and their trigger points.

10. What emergency controls does vision Layer 14 prescribe for the dashboard?

11. **Trap question:** Should you use `router.refresh()` after the user triggers a pipeline action that changes data?

12. What must you run BEFORE starting the dashboard dev server, and why?

13. Name the 3 critical docs in reading order. (Coverage probe.)

14. The execution plan has a "Context for Phase 4.0 implementers" section. Name 3 gotchas from it.

15. What E2E test pattern is required for the project switcher's `getProjectName()` method, and why?

## Turn 3 — Doc gaps

After grading, copy back:

## Doc gaps to report upstream
- (list any questions where the docs were silent, unclear, or contradictory)

## Hard-fail triggers

- Agent thinks Pipeline should show 5 phases (Design/Spec/Code Gen/CI/CD/Observe)
- Agent puts concurrent-run DAG visualization on the Home page instead of Pipeline/Runs
- Agent uses `renderRoot` instead of `component={Link}` for NavLink
- Agent adds `@agentforge/core` to `transpilePackages`
- Agent uses gradient rings or glass cards ("AI aesthetic")
- Agent uses `router.refresh()` instead of `window.location.reload()` for data refresh

## Soft-fail triggers

- Agent doesn't know about the SpineRun data model proposal
- Agent doesn't mention the 3 HITL gates (clarification, design/API approval, code merge)
- Agent doesn't know about Pause All / Abort All emergency controls
- Agent doesn't mention `next build --webpack` requirement

## Maintenance

When `docs/plans/active/chip-ux-overhaul/execution-plan.md` or `CLAUDE.md` changes, update the answer key to match.

Answer key: `docs/plans/active/chip-ux-overhaul/phase4-pipeline-handoff-key.md` (read only after answering all questions).
