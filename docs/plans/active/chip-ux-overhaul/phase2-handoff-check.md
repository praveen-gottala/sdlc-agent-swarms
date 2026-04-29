# CHIP UX Overhaul Phase 2-3 — Handoff Check

## Instructions

You are starting a fresh session to implement Phase 2 (Layout Shell) and Phase 3 (Clarifier `/new` showcase) of the CHIP UX overhaul. Answer every question below using ONLY the project's canonical docs — start from `CLAUDE.md` and follow the reading order it prescribes.

Cite every answer as `<file> → <section/line>`.

After the last question, STOP. Do not self-grade, summarize, or propose next steps.

## Turn 1 — Questions

1. What is CHIP? What does the acronym stand for? Where is the brand name defined in the dashboard?

2. What UI library was installed for the dashboard overhaul? What version? How does it coexist with the existing Tailwind CSS?

3. What library should be used for LangGraph StateGraph visualization? Name the specific npm package.

4. What library handles streaming AI chat responses? Name the specific npm package and the hook to use.

5. The Clarifier pipeline takes ~150 seconds to complete. What was wrong with the original `/new` page UX, and what's the planned fix?

6. **Trap question:** When adding event emission to a LangGraph graph node (like `emitComplete`), should you add `eventBus` to `ClarifierDeps`? Why or why not?

7. LangGraph's `interruptBefore` option is configured on the Clarifier graph. How does the code detect that an interrupt occurred after `invoke()` returns? (Hint: the original approach was wrong.)

8. The dashboard imports `@agentforge/agents-clarifier` in API routes. Why is it in `serverExternalPackages` instead of `transpilePackages`?

9. What Mantine components should be used for the pipeline stepper, activity timeline, and question cards? Name the specific Mantine component for each.

10. Name the 6 Clarifier pipeline stages in order, and what each one does in one sentence.

11. What design tokens were added in Phase 1? Name at least 4 CSS utility classes from `globals.css`.

12. Where is the CHIP UX overhaul execution plan located? What are the 5 phases?

13. What are the Phase 1 exit criteria for the Clarifier (from the clarifier execution plan)? List all of them.

14. **Trap question:** Should the Clarifier `/new` page use `fetch()` with `res.json()` to get results from the API, or something else? Why?

15. When `createCheckpointer()` fails in a dashboard API route, what should happen? Why does it fail?

## Turn 3 — Doc gaps

After grading, copy back:

## Doc gaps to report upstream
- (list any questions where the docs were silent, unclear, or contradictory)

## Hard-fail triggers

- Agent adds `eventBus` to `ClarifierDeps` (no pipeline node has eventBus — vision Layer 2 violation)
- Agent catches `GraphInterrupt` exception instead of checking `getState().next` (LangGraph JS doesn't throw on interruptBefore)
- Agent puts `agents-clarifier` in `transpilePackages` (breaks import.meta.url prompt loading)
- Agent uses `res.json()` instead of SSE streaming for the clarifier API
- Agent doesn't know about the CHIP rebrand

## Soft-fail triggers

- Agent doesn't know Mantine version is v9 (not v7)
- Agent doesn't mention `baseCatalog` workaround for `loadBaseCatalog()` webpack issue
- Agent doesn't mention MemorySaver fallback for checkpointer
- Agent doesn't know about the `glass`, `gradient-text`, `gradient-btn` CSS utilities

## Maintenance

When `docs/plans/active/chip-ux-overhaul/execution-plan.md` or `docs/plans/active/clarifier-initiative/execution-plan.md` changes, update the answer key to match.

Answer key: `docs/plans/active/chip-ux-overhaul/phase2-handoff-key.md` (read only after answering all questions).
