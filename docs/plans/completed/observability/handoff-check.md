# Observability — Handoff Check

## Turn 1: Questions for the new agent

Answer each question with citations in `<file> → <section/line>` format. Start your output with a **`## Docs consulted`** section listing every file you read, in the order you read them. After answering the last question, STOP.

1. Where is the observability execution plan, and what is the status of each phase?

2. What package provides Langfuse/OTel integration, and what are its four main source modules?

3. How does `TracedProvider` work — what does it wrap, what OTel observation type does it create, and what data does it capture on each LLM call?

4. Why was the `PipelineTelemetrySink` interface NOT widened with input/output content fields? What approach was chosen instead, and why?

5. Which CLI commands are traced with Langfuse? Name all of them.

6. How do you verify programmatically (not via browser) that traces landed in Langfuse? Give the exact command.

7. What happens when `LANGFUSE_SECRET_KEY` is not set? Does the pipeline break, warn, or silently degrade?

8. The planning stage's `defaultValues` field on componentTree nodes was originally a map (`Record<string, number | string>`). Why did this break, and what pattern replaced it?

9. **Trap question:** Should new structured output schemas for Claude API use `additionalProperties: { type: 'string' }` to represent string maps?

10. What is the next pending task in the observability plan, and what files does it touch?

11. After documenting a new feature, what mandatory validation step must be performed before declaring the docs complete?

12. Name the three documents a new agent should read to understand the observability setup (in the order they'd discover them starting from CLAUDE.md).

---

Answer key: `docs/plans/observability-handoff-key.md` (read only after answering all questions).

## Turn 3: Doc gap report

Copy this section back in your response:

### Doc gaps to report upstream

_(List any questions where the canonical docs were silent, contradictory, or required guessing. Format: `Q<n>: <gap description>`. If none, write "None found.")_

---

## Hard-fail triggers

- Agent cannot locate `docs/plans/active/observability/execution-plan.md` → ABORT (plan file missing).
- Agent answers Q9 with "yes" (use additionalProperties as map) → ABORT (would reintroduce the API rejection bug).
- Agent cannot name the programmatic verification command for Q6 → ABORT (critical operational knowledge).

## Soft-fail triggers

- Agent misses one traced command in Q5 — re-read the guide, not abort-worthy.
- Agent doesn't cite the exact ADR number — acceptable if rationale is correct.

## Maintenance

When any of these source files change, update the corresponding answer in the key:
- `packages/telemetry/src/` → Q2, Q3
- `docs/plans/active/observability/execution-plan.md` → Q1, Q10
- `docs/guides/langfuse-setup.md` → Q5, Q6, Q7
- `docs/lessons-learned-rules.md` → Q8, Q9, Q11
- `packages/agents-ux/src/ux-planning/ux-planning.ts` → Q8
