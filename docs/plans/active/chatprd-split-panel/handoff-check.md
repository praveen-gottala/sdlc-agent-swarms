# Handoff Check — ChatPRD Split-Panel PRD Builder (Phase 3)

## Turn 1 — Answer these questions using only the project's canonical docs

Start from `CLAUDE.md` and navigate to relevant docs. Do NOT guess from filenames.

**Required first section of output: `## Docs consulted`** — list every file you read to answer these questions, in `<file> → <section>` format.

### Questions

1. What streaming API method does `runClarifierPipelineStream` use — a custom `onNodeComplete` callback or LangGraph's native `graph.stream()`? What `streamMode` is used?

2. The `prdAnalyzer` node produces a 9-section PRD. Does it stream sections one-by-one as they're generated, or does the entire PRD arrive at once? Why?

3. How does the dashboard detect a HITL interrupt when using `graph.stream()`? Does the stream emit a special interrupt event, or is another mechanism required?

4. What Jest/SWC polyfills are needed when testing SSE stream parsing in the dashboard test environment? Name the specific globals and their import sources.

5. There are TWO pipeline runner functions in `packages/agents-clarifier/src/run.ts`. Name both and explain when each is used.

6. The `/api/clarifier/respond` route currently returns JSON, not SSE. Has it been upgraded to SSE streaming yet? If not, how does the `useClarifierStream` hook handle both response types?

7. What is the file path and storage key for the resizable PRD panel width? What are its min/max/default pixel values?

8. When does the PRD panel first become visible — at page load, when the user submits a seed, or when `prdDraft` data first arrives?

9. The plan mentions a "Document | Graph" toggle in the right panel. What is the current implementation status of the React Flow graph visualization?

10. What animation technique is used to create the "progressive rendering" feel for PRD sections, given that all sections arrive from a single LLM call?

11. TRAP QUESTION: Should you add `onNodeEnter(name)` / `onNodeExit(name, elapsed)` callbacks to `runClarifierPipeline` for streaming? Why or why not?

12. Name the three canonical documents that a new session MUST read, in the order prescribed by CLAUDE.md §Reading order.

After answering all questions, **STOP**. Do not self-grade, summarize, or propose next steps.

## Turn 3 — Doc gaps

After reading the answer key, report any gaps you found:

```
## Doc gaps to report upstream
- <gap 1>
- <gap 2>
```

## Hard-fail triggers

- Agent cannot find `runClarifierPipelineStream` in any doc or code reference
- Agent proposes using `onNodeComplete` callback (superseded approach)
- Agent claims PRD sections stream one-by-one from the LLM

## Soft-fail triggers

- Agent gets the storage key wrong but knows the pattern
- Agent correctly identifies React Flow as NOT STARTED but doesn't know the toggle plan

## Maintenance

When `packages/agents-clarifier/src/run.ts` or `docs/plans/active/chatprd-split-panel/execution-plan.md` change, the answer key must be updated.

Answer key: `docs/plans/active/chatprd-split-panel/handoff-key.md` (read only after answering all questions).
