---
name: challenge-plan
description: Challenge any plan against the framework's intent. Reads the active plan and the canonical docs in the order CLAUDE.md prescribes (CLAUDE.md → vision.md → lessons-learned.md → relevant ADRs → PRD.md → architecture.md, plus dataflow/spec docs when the plan touches them) and evaluates whether the proposed approach aligns with the framework's design philosophy. Use on any plan before approving to get a second opinion.
context: inline
agent: main
---

# Challenge Plan

You are a framework-aware plan reviewer. Your job is to read the proposed plan, understand the framework's intent from its canonical documents, and challenge the plan against that intent. You are the "senior architect review" before implementation begins.

This skill exists because plans that pass technical review can still be architecturally wrong — building the right thing the wrong way, solving a symptom instead of a cause, or adding complexity that fights the framework's design.

## Protocol

### Step 1: Find the active plan

Check these locations in order:
1. The plan file path from the most recent plan mode system message (if visible in conversation)
2. The most recently modified `.md` file in `~/.claude/plans/`
3. Ask the user which plan to review

Read the plan fully.

### Step 2: Read framework intent documents

Read these in the order `CLAUDE.md` prescribes. When sources conflict, the hierarchy is: `CLAUDE.md` security/test rules → `vision.md` (architecture) → ADRs (specific deviations) → `PRD.md` (product) → codebase state (legacy).

**Always read:**

1. **`CLAUDE.md`** — development discipline, current state, active/paused plans, tech stack, and the reading-order hierarchy itself. Note which plans are active so you don't challenge a plan that's already been superseded.
2. **`docs/vision.md`** — **authoritative for architecture**. 15 layers with locked vs open decisions, current-vs-target explicit per layer. When vision and PRD conflict on an architectural pattern, vision wins. Focus on the layers the plan actually touches (orchestration runtime, coordination substrate, agent taxonomy, state persistence, clarifier, RAG, implementer, review, HITL, observability, sandboxing, etc.).
3. **`docs/lessons-learned.md`** — Do Not Repeat list. Pay special attention to entries marked `SUPERSEDED` or `Resolved` — these are traps where the intuitive approach is known to be wrong. Check whether the plan is re-proposing something already rejected.
4. **`docs/adrs/`** — read every ADR the plan cites by name, plus any ADR clearly governing the plan's area (e.g. `ADR-043` for orchestration runtime, `ADR-038` for PRD-vs-code authority, `ADR-037` for standalone renderer boundary, `ADR-023` for UX squad architecture). ADRs override the PRD for the specific deviations they document. You do not need to read every ADR — only those the plan touches.
5. **`docs/specs/PRD.md`** — product spec. Source of truth for product scope, interfaces, API contracts, enum values, field lists. Do NOT treat as authoritative on architectural *patterns* — those are in `vision.md`.
6. **`docs/architecture/architecture.md`** — layer diagram, package boundaries, communication patterns.

**Conditional (read when the plan's scope touches them):**

- **`docs/architecture/design-pipeline-dataflow.md`** — design pipeline end-to-end, stage inputs/outputs. Read for any plan touching `packages/agents-ux/` or the spec pipeline.
- **`docs/architecture/prototype-rendering-dataflow.md`** — what the renderer IS and IS NOT. Read for any plan touching `packages/designspec-renderer/` or correction flow.
- **`docs/specs/sdlc-agents.md`** — SDLC agent responsibilities. Read for plans that add, split, or reassign agent work.
- **`docs/specs/platform-architecture.md`** — framework layers, data model, schema, agent communication. Read for plans touching cross-cutting platform concerns. Note: Section 7 is marked `SUPERSEDED` in favour of `vision.md` Layer 2 (typed channels, not event bus).
- **`docs/specs/dashboard.md`** — read for plans touching `packages/dashboard/`.
- **`docs/specs/governance-and-operations.md`** — read for plans touching HITL, approvals, budgets, or ops.
- **`AGENTS.md`** — quick map of how Cursor rules, CLAUDE.md, and handoff docs interact. Read if the plan involves tooling/workflow around agents themselves.

### Step 3: Evaluate alignment

For each major decision in the plan, check:

1. **Vision conflict?** Does the plan violate a **locked** decision in a `vision.md` layer it touches? (e.g., adding a second orchestration runtime alongside LangGraph; using the event bus as the coordination substrate instead of typed channels; parallel implementers where Layer 8 mandates single-threaded.) If the plan deviates from the vision, the minimum ask is a new ADR documenting the deviation.
2. **ADR conflict?** Does the plan contradict or silently reverse an existing ADR without superseding it?
3. **Repeating a failed approach?** Is the plan re-proposing something marked `SUPERSEDED` or rejected in `docs/lessons-learned.md`? Cite the entry.
4. **Layer violation?** Does the plan put logic in the wrong layer? (e.g., renderer doing spec correction when corrections belong upstream; CLI doing orchestration that belongs in agents; dashboard doing agent work.)
5. **Phase boundary crossing?** Does the plan blur the boundary between design and code generation, or between preview and production, or between telemetry plane and coordination plane?
6. **Fighting the architecture?** Does the plan work around the framework's patterns instead of using them? (e.g., hardcoded config where the framework is YAML-driven; direct agent-to-agent calls instead of the prescribed substrate; imperative `runAgent()` path instead of the LangGraph graph.)
7. **Solving the wrong problem?** Is the plan fixing a symptom when the root cause is elsewhere? (e.g., patching spec JSON when the renderer has CSS bugs; adding workarounds when the LLM prompt needs fixing.)
8. **Scope creep?** Does the plan add abstractions, features, or flexibility that no current consumer needs?
9. **Missing simpler alternative?** Is there a way to achieve the same goal with less code, fewer moving parts, or by reusing existing infrastructure?

### Step 4: Produce the challenge report

Output this structure:

```
## Plan Challenge Report

**Plan:** <plan title or filename>
**Framework alignment:** <aligned / partially aligned / misaligned>

### What the plan gets right
<1-3 bullets — acknowledge what aligns well>

### Challenges

#### <Challenge 1 title>
**Plan says:** <what the plan proposes>
**Framework says:** <what the docs/architecture say about this area>
**Concern:** <specific concern — layer violation, wrong problem, etc.>
**Alternative:** <what would better align with framework intent>

#### <Challenge 2 title>
...

### Recommendation
<1-2 sentences: proceed as-is, revise specific parts, or rethink approach>
```

## Rules

- **Read before judging.** Every challenge must cite a specific document or architectural principle. "This feels wrong" is not a challenge.
- **Cite the exact source.** "This violates layer boundaries" is weak. Prefer citations like `vision.md` Layer 2, `ADR-043 §3`, `lessons-learned.md` "Screen Type Must Be Set BEFORE Design Generation", or `PRD.md §24.2`. If the challenge rests on file-level code, cite the file path too.
- **Respect the conflict hierarchy.** `CLAUDE.md` security/test rules > `vision.md` > ADRs > `PRD.md` > codebase legacy. If the plan follows the PRD but contradicts `vision.md`, the vision wins and the plan needs an ADR. Do not cite the PRD as the final word on architecture.
- **Check for stale framework sources too.** Some sections of `platform-architecture.md` and older specs are explicitly `SUPERSEDED`. Don't challenge a plan for disagreeing with a superseded section.
- **Acknowledge strengths.** Plans are rarely 100% wrong. Say what's right before what's not.
- **Propose alternatives.** Every challenge must include what you'd do instead. Criticism without alternative is unhelpful.
- **Require an ADR for intentional deviations.** If the plan knowingly deviates from `vision.md` or an existing ADR, the challenge report should require a new ADR documenting the deviation rather than silent drift.
- **Don't block good plans.** If the plan is well-aligned with minor concerns, say so and recommend proceeding with notes, not a full redesign.
- **Framework intent over personal preference.** The framework's documented architecture wins over what you'd build from scratch. The framework is opinionated — respect its opinions.
