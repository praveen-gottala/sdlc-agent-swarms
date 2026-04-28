# Unify Pipeline Phase 3 — Handoff Check

## Turn 1: Questions for the new agent

Answer each question with citations in `<file> → <section/line>` format. Start your output with a **`## Docs consulted`** section listing every file you read, in the order you read them. After answering the last question, STOP.

1. What is the current status of the Unify Design Pipeline plan? Which phases are complete and which remain?

2. Where does `PREVIEW_DIR_REL` point to now, and what was it before Task 3.0 changed it?

3. The dashboard chat route (`POST /api/pages/[pageId]/design/chat`) used to make 3 LLM calls per message. How many does it make now, and which adapter class handles the call?

4. The dashboard correct route (`POST /api/pages/[pageId]/design/correct`) used to have a `new Function('m', 'return import(m)')` dynamic import hack. What replaced it?

5. Where does `DashboardSseSink` live, and what interface does it implement? How does it capitalize stage names?

6. After Phase 3 Task 3.2, three functions were deleted from `packages/dashboard/src/app/api/_lib/pipeline-helpers.ts`. Name all three.

7. What file was also deleted alongside those three functions (a re-export wrapper from `@agentforge/core`)?

8. The `buildPrototypeManifest` function scans directories under `PREVIEW_DIR_REL`. How does it handle directories whose names start with `__` (like `__shared-chrome__`), and why was this filter added?

9. **Trap question:** Should the prototype `manifest.json` file on disk contain `__shared-chrome__` as a screen entry, relying on the API route to filter it at runtime?

10. When writing Jest tests for dashboard API routes in `packages/dashboard/src/app/api/pages/__tests__/`, what relative path must `jest.mock()` use to mock `packages/dashboard/src/app/api/_lib/project-reader`?

11. Name the three CLAUDE.md test-triad commands that must all pass before declaring any task done.

12. What does the execution plan say about Phase 4 (Stage 1 unification) and Phase 5 (docs/ADRs)? Are they blocked by Phase 3?

---

## Turn 3: Doc gap report

**Answer key:** `docs/plans/unify-pipeline-phase3-handoff-key.md` (read only after answering all questions above).

Copy this section back in your response:

### Doc gaps to report upstream

_(List any questions where the canonical docs were silent, contradictory, or required guessing. Format: `Q<n>: <gap description>`. If none, write "None found.")_

---

## Hard-fail triggers

- Agent cannot locate `docs/active-plan/unify-pipeline/execution-plan.md` → ABORT (plan file is missing or renamed).
- Agent answers Q9 with "yes" (follow the old runtime-filter-only pattern) → ABORT (would reintroduce pseudo-screen leak).
- Agent cannot name all 3 deleted functions in Q6 → ABORT (incomplete understanding of what Phase 3 removed).

## Soft-fail triggers

- Agent gets mock path wrong in Q10 (common confusion) → re-read test files, not abort-worthy.
- Agent doesn't cite lessons-learned for Q8/Q9 → doc discoverability issue, not a blocker.

---

## Maintenance

When any of these source files change, update the corresponding answer:
- `packages/core/src/constants.ts` → Q2
- `packages/dashboard/src/app/api/pages/[pageId]/design/chat/route.ts` → Q3
- `packages/dashboard/src/app/api/pages/[pageId]/design/correct/route.ts` → Q4
- `packages/dashboard/src/app/api/_lib/dashboard-sink.ts` → Q5
- `packages/dashboard/src/app/api/_lib/pipeline-helpers.ts` → Q6
- `packages/agents-ux/src/prototype/build-manifest.ts` → Q8
- `docs/active-plan/unify-pipeline/execution-plan.md` → Q1, Q6, Q12
- `docs/lessons-learned.md` → Q8, Q9
