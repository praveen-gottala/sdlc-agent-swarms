# Clarifier Phase 1 — Handoff Check

## Instructions

You are starting a fresh session to implement Phase 1 of the Clarifier Initiative. Answer every question below using ONLY the project's canonical docs — start from `CLAUDE.md` and follow the reading order it prescribes.

Cite every answer as `<file> → <section/line>`.

After the last question, STOP. Do not self-grade, summarize, or propose next steps.

## Turn 1 — Questions

1. What orchestration runtime does the Clarifier pipeline use? Name the specific library, language, and graph type.

2. How is HITL (human-in-the-loop) implemented in the Clarifier? Name the specific LangGraph mechanism and the persistence backend.

3. The Clarifier's Context Retriever node has two modes. Name both modes and list ALL retrieval tools called in evolution mode (there are 5 — name them all).

4. Where do the `EnrichedRequirementSchema` and `AssumptionLedgerSchema` Zod schemas live? Should you create new copies in `packages/agents-clarifier/src/schemas.ts`?

5. What is the `.claude/rules/new-agent.md` checklist? List all 7 items required when adding a new agent role.

6. Which tasks in Phase 1 make LLM calls, and what must wrap every LLM call per ADR-046?

7. The design indexer uses `chunkDesignSpec(filePath, content, screenId)`. How is `screenId` derived? Why doesn't it come from the spec JSON?

8. Name the three canonical docs you must read (in order) before making any architectural decision in this project, per `CLAUDE.md`.

9. **Trap question:** Should you follow the `runDesignPipeline` pattern (plain async function with explicit state threading) for the Clarifier pipeline assembly? Why or why not?

10. What event must be added to `packages/core/src/events/domain-events.ts` for the Clarifier? Is this event for coordination or telemetry?

11. The execution plan has a "Context for Phase 1 implementers" block. What does it say about the design retrieval gap?

12. What are the Phase 1 exit criteria for the Clarifier, per the execution plan?

13. Task 1.0 is complete. Where does the LangGraph state definition live, and what pattern does it use for typed channels? Name the specific LangGraph API.

14. When adding a domain event to `domain-events.ts`, which test file needs updating and in how many locations within that file?

15. **Trap question:** Does `packages/agents-clarifier/` need a `project.json` file? Why or why not?

16. How are dependencies (LLM provider, retrieval tools) injected into Clarifier nodes? Name the interface, the file it lives in, and the pattern used.

17. Name all 5 state channels added during the foundation step (not the original 11 from Task 1.0). For each, give the type and purpose.

18. The graph has TWO HITL interrupt points. Name both nodes and explain when each fires.

19. **Trap question:** Should you declare an explicit return type on `buildClarifierGraph()`? Why or why not?

20. After max rounds are exhausted, what are the three options the user gets? Which state channel carries this decision?

21. What is `runClarifierPipeline()` and where does it live? What does it return on a HITL interrupt vs a completed run?

22. **Trap question:** When implementing Task 1.2 (PRD Analyzer), should you use `claude-sonnet-4-6` for cost savings? Cite the specific constraint.

## Turn 3 — Doc gaps

After grading, copy back:

## Doc gaps to report upstream
- (list any questions where the docs were silent, unclear, or contradictory)

## Hard-fail triggers

- Agent uses "event bus" or "EventEmitter" for coordination (vision Layer 2 violation)
- Agent proposes plain async pipeline instead of LangGraph StateGraph (challenge report violation)
- Agent duplicates cross-boundary schemas in the agent package
- Agent omits `searchDesignsTool` from Context Retriever evolution mode
- Agent declares explicit return type on `buildClarifierGraph()` (causes LangGraph TS type errors)
- Agent uses `claude-sonnet-4-6` for Task 1.2 PRD Analyzer (parent plan gate: must be `claude-opus-4-6`)
- Agent reads bootstrap catalog from `agentforge/spec/` instead of `packages/core/src/catalogs/` (project doesn't exist in bootstrap)

## Soft-fail triggers

- Agent misses 1-2 items on the new-agent checklist (likely from not reading `.claude/rules/new-agent.md`)
- Agent doesn't mention TracedProvider for LLM calls
- Agent doesn't know about `runClarifierPipeline()` wrapper
- Agent doesn't know about the escalation gate (accept/restart/abandon)

## Maintenance

When `docs/plans/active/clarifier-initiative/execution-plan.md` or `docs/vision.md` Layer 5 changes, update the answer key to match.

Answer key: `docs/plans/active/clarifier-initiative/phase1-handoff-key.md` (read only after answering all questions).
