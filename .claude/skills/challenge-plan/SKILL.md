---
name: challenge-plan
description: Challenge any plan against the framework's intent. Reads the active plan, framework docs (PRD, architecture, CLAUDE.md), and evaluates whether the proposed approach aligns with the framework's design philosophy. Use on any plan before approving to get a second opinion.
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

Read these in order — they define what this framework IS and what it's trying to accomplish:

1. **`docs/specs/PRD.md`** — the product spec. Focus on: vision, goals, phase boundaries, what each agent is responsible for, the SDLC pipeline stages.
2. **`docs/architecture/architecture.md`** — layer diagram, package boundaries, communication patterns.
3. **`CLAUDE.md`** — current state, active plans, tech stack, architecture rules.
4. **`docs/architecture/design-pipeline-dataflow.md`** — how the design pipeline flows end-to-end, stage inputs/outputs.
5. **`docs/architecture/prototype-rendering-dataflow.md`** — how prototype rendering works, what the renderer IS and IS NOT.

### Step 3: Evaluate alignment

For each major decision in the plan, check:

1. **Layer violation?** Does the plan put logic in the wrong layer? (e.g., renderer doing spec correction, CLI doing orchestration that belongs in agents, dashboard doing agent work)
2. **Phase boundary crossing?** Does the plan blur the boundary between design and code generation, or between preview and production?
3. **Fighting the architecture?** Does the plan work around the framework's patterns instead of using them? (e.g., direct agent-to-agent calls instead of event bus, hardcoded config instead of YAML-driven)
4. **Solving the wrong problem?** Is the plan fixing a symptom when the root cause is elsewhere? (e.g., patching spec JSON when the renderer has CSS bugs, adding workarounds when the LLM prompt needs fixing)
5. **Scope creep?** Does the plan add abstractions, features, or flexibility that no current consumer needs?
6. **Missing simpler alternative?** Is there a way to achieve the same goal with less code, fewer moving parts, or by reusing existing infrastructure?

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
- **Be specific.** "This violates layer boundaries" is weak. "This puts spec correction logic in the renderer (DesignSpecRenderer.tsx) but the renderer is a read-only preview tool — corrections belong in the correction pipeline (browser-correction-adapter.ts)" is strong.
- **Acknowledge strengths.** Plans are rarely 100% wrong. Say what's right before what's not.
- **Propose alternatives.** Every challenge must include what you'd do instead. Criticism without alternative is unhelpful.
- **Don't block good plans.** If the plan is well-aligned with minor concerns, say so and recommend proceeding with notes, not a full redesign.
- **Framework intent over personal preference.** The framework's documented architecture wins over what you'd build from scratch. The framework is opinionated — respect its opinions.
