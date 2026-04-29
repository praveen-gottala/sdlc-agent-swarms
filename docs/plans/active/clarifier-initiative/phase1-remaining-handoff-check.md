# Clarifier Phase 1 Remaining (Tasks 1.7-1.8) — Handoff Check

## Instructions

You are starting a fresh session to complete the remaining Phase 1 work: Task 1.7 (event emission + integration test) and Task 1.8 (dashboard integration). Answer every question below using ONLY the project's canonical docs — start from `CLAUDE.md` and follow the reading order it prescribes.

Cite every answer as `<file> → <section/line>`.

After the last question, STOP. Do not self-grade, summarize, or propose next steps.

## Turn 1 — Questions

1. Tasks 1.2-1.6 are already implemented. Name all 6 Clarifier node factories and the file each lives in.

2. What does the `emitComplete` node currently do, and what must be added to it for Task 1.7? Name the specific domain event.

3. When adding event emission to `emitComplete`, which test file(s) need updating and in how many locations? (Hint: the event was already registered in Task 1.0 — this is about the emission, not the registration.)

4. What is `runClarifierPipeline()`, where does it live, and what does it return on a HITL interrupt vs a completed run?

5. The graph has TWO HITL interrupt points. Name both nodes and explain when each fires.

6. **Trap question:** Should you use `EventEmitter` to emit the `RequirementsClarified` event from `emitComplete`? Why or why not?

7. For Task 1.8 dashboard integration, what existing UI pattern should you reuse for the chat interface? Name the specific file and line range.

8. How does the dashboard resume a LangGraph graph after a HITL interrupt? Name the specific API call and the config field.

9. What are the Phase 1 exit criteria? List all of them.

10. Name the three canonical docs you must read (in order) before any architectural decision, per `CLAUDE.md`.

11. What model does the PRD Analyzer (Task 1.2) use, and why is it different from the Gap Detector and Story Writer?

12. How are dependencies injected into Clarifier nodes? Name the interface, the file, and the pattern.

13. What is the `ClarifierInput` interface and what fields does it accept? Where is it defined?

14. **Trap question:** Should you create a new LangGraph `StateGraph` for the dashboard integration, or reuse the existing one? How?

15. When mocking `CompletionResult` in tests, what fields does `CostRecord` require beyond the USD amounts? (This gotcha was discovered during Tasks 1.2-1.6.)

## Turn 3 — Doc gaps

After grading, copy back:

## Doc gaps to report upstream
- (list any questions where the docs were silent, unclear, or contradictory)

## Hard-fail triggers

- Agent uses `EventEmitter` for `RequirementsClarified` emission (vision Layer 2 violation — event bus is telemetry plane, but emission must go through the bus, not be used as coordination)
- Agent creates a second LangGraph graph for the dashboard instead of calling `runClarifierPipeline()`
- Agent skips the integration test for Task 1.7
- Agent uses wrong model for PRD Analyzer (must be `claude-opus-4-6`)
- Agent doesn't wire HITL resume via `graph.invoke(humanResponse, { configurable: { thread_id } })`

## Soft-fail triggers

- Agent doesn't know about the `CostRecord` field naming gotcha
- Agent doesn't mention the ChatTab pattern from design-inspector.tsx for Task 1.8
- Agent doesn't know about `_resetPromptCache()` test helpers

## Maintenance

When `docs/plans/active/clarifier-initiative/execution-plan.md` changes, update the answer key to match.

Answer key: `docs/plans/active/clarifier-initiative/phase1-remaining-handoff-key.md` (read only after answering all questions).
