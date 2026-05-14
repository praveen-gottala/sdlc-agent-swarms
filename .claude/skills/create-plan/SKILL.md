---
name: create-plan
description: MANDATORY entry point for any initiative crossing the plan threshold (multi-session, multi-package, roadmap phase, new agent/ADR/public API, or user asks for a "plan"). Triggers on phrases like "plan", "execution plan", "scaffold plan", "phased work for", "create a plan to", "plan out". Explores the codebase, scaffolds the plan folder under `docs/plans/active/`, generates per-phase verification gates that auto-invoke `/review-plan-impl`, `/mid-session-drift-check`, and `/verify-done`, and auto-runs `/challenge-plan` with the explicit plan path.
argument-hint: "<description of what to build>"
---

# Create Plan

You are creating an execution plan for a new initiative. This skill is the
**mandatory** entry point whenever the work crosses the plan threshold
(see Step 0). It handles roadmap phases (`/create-plan Phase 3 change
classification`), ad-hoc work (`/create-plan add evaluator diversity
scoring`), and child plans of an existing initiative (`/create-plan M2
of CHIP's Next Steps`).

References:

- `docs/guides/planning-docs.md` — canonical "How to create a plan"
  entry box and **Verification gate (canonical)** section that the
  templates in Step 4 link to.
- `.claude/skills/README.md` — lifecycle diagram showing where each
  gate skill fires.

## Protocol

### Step 0: Threshold check + canonical-location guardrail

**Plan threshold.** Run `/create-plan` (or follow `.claude/skills/create-plan/SKILL.md` step by step in Cursor) when ANY of these is true:

- Work spans more than one session, OR
- Touches more than one package under `packages/`, OR
- Maps to a phase in `docs/roadmap.md`, OR
- Introduces a new agent, pipeline stage, ADR, or public API, OR
- The user explicitly asks for a "plan", "execution plan", "phased work", or similar.

Below this threshold (single-file fix, doc-only edit, lint/typecheck cleanup), do the work directly.

If the request is below threshold, **exit this skill** with the one-line note:

```
Below plan threshold — proceeding directly.
```

and do the work without scaffolding a plan folder.

**Canonical location guardrail (hard rule).** The plan MUST be written to
`docs/plans/active/<name>/execution-plan.md`, never to `~/.claude/plans/`.
Claude Code's plan-mode auto-creates files in `~/.claude/plans/` as scratch
space; those files are ephemeral and not part of the project's planning
system. If plan-mode was used during this skill, copy the final plan
content into the canonical location and treat `~/.claude/plans/` as
disposable.

### Step 1: Understand the initiative

Parse `$ARGUMENTS` as a description of what to build.

Read `docs/roadmap.md` and check if the description matches a roadmap phase
(by phase number or keyword in the Goal column).

**If roadmap match found:**

- Extract: phase number, goal, demoable outcome, tasks, exit criteria,
  prereq decisions
- Note this as the roadmap source for Step 4

**If no roadmap match:**

- This is an ad-hoc initiative (quality improvement, feature, infra task)
- Proceed without roadmap context

If `$ARGUMENTS` is empty or unclear, list available roadmap phases and ask
the user what they want to plan.

### Step 2: Check existing plan state (active, backlog, completed, child)

Derive a kebab-case folder name from the description:

- "handle auth for users" → `auth-for-users`
- "Phase 3 change classification" → `change-classification`
- "add evaluator diversity scoring" → `evaluator-diversity-scoring`

Check for existing plans **in this order**:

1. **Child of an existing active initiative.** If the description starts
   with a milestone marker like "M2 of <Initiative>", "Phase N of
   <Initiative>", "next step for <Initiative>", or names a parent plan
   directly, treat this as a **child plan**. Do NOT create a new sibling
   folder. Instead, scaffold the child files inside the parent folder:

   ```
   docs/plans/active/<parent-name>/
     execution-plan.md          (existing parent plan — leave alone)
     m<N>-execution-plan.md     (new child plan)
     m<N>-session-prompts.md    (new child session prompts, optional)
   ```

   Existing pattern to mirror: `docs/plans/active/chips-next-steps/` has
   `execution-plan.md`, `m1-execution-plan.md`, `m1-session-prompts.md`,
   `m1-decisions.md`. Do not create `docs/plans/active/m2-of-chips-next-steps/`
   — that's a sibling, not a child.

2. **Active plan with the same name.** Check `docs/plans/active/<name>/`.
   If a plan folder exists:

   - Read the execution plan
   - Show the progress checklist
   - Ask: "An active plan already exists. Resume it, or start fresh?"

3. **Backlog plan matching the topic.** Check `docs/plans/backlog/`.
   If a backlog plan matches:

   - Show the backlog plan
   - Ask: "A backlog plan exists for this. Promote to active as-is,
     use as starting point, or start fresh?"

4. **Completed plan with the same name (collision check).** Check
   `docs/plans/completed/`. If `<name>` already exists there, surface
   the collision before proceeding:

   - Show the completed plan's location
   - Ask: "A completed plan with this name exists. Pick a different
     folder name (e.g. `<name>-v2`, `<name>-followup`), or treat this
     as a follow-up that re-uses the historical context?"

5. If none of the above match: proceed to Step 3.

### Step 3: Explore the codebase (structured exploration summary)

If `/session-start` has not run in this session, read
`docs/lessons-learned-rules.md` first — it contains active rules that
govern plan creation (e.g., "Plans Must Trace Data Flows and Verify
Claims").

Launch an Explore agent (or do the exploration inline if the scope is
small) to understand the relevant area.

Produce a **structured exploration summary** with these six named
sections — each is required so downstream challenge actually has
ground truth to challenge against:

```
**Packages touched**
- `packages/<name>/` — <one-line role>
- ...

**Existing patterns to reuse**
- <pattern name> at `<path>` — <why it's the right pattern here>
- ...

**Governing ADRs**
- ADR-<NNN> (`docs/adrs/ADR-NNN-<slug>.md`) — <one-line relevance>
- ...

**Vision layer(s) involved**
- Layer <N> <name> — <one-line relevance from `docs/vision.md`>
- ...

**Rejected patterns to avoid**
- <pattern name> (`docs/design-decisions.md` §X.Y) — <why it was rejected>
- ...

**Applicable lessons-learned rules**
- "<rule name>" — applies because <one-line reason>
- ...
```

If any of the six sections is empty, say so explicitly (`**Governing
ADRs:** none found`). An empty section is a finding, not a default.

For "Rejected patterns to avoid," scan `docs/design-decisions.md` for
alternatives that were considered and rejected in the plan's scope area.
CLAUDE.md § "Rejected Patterns — Check Before Proposing" mandates this
check before introducing any novel architectural pattern.

For "Applicable lessons-learned rules," scan `docs/lessons-learned-rules.md`
for any RULE entry that governs the plan's scope (e.g., data flow tracing
for pipeline plans, test fixture rules for test plans, renderer rules for
design work). Rule #18 ("Plans Must Trace Data Flows and Verify Claims")
applies to virtually every plan — verify every factual claim against code.

If a roadmap phase was matched in Step 1, ALSO read the relevant
`docs/vision.md` layer(s) to understand the target architecture.

If the work is ad-hoc but the exploration discovers it touches an
identified vision layer (observability, telemetry, CLI, retrieval,
clarifier, etc.), read that layer in `docs/vision.md` too. The
ad-hoc path does not get to skip vision when the work plainly
crosses a layer.

Present the exploration summary before proceeding.

### Step 4: Create the execution plan

Create the folder and file: `docs/plans/active/<name>/execution-plan.md`
(or, for child plans from Step 2.1, `docs/plans/active/<parent>/m<N>-execution-plan.md`).

The verification-gate text below is the canonical wording from
`docs/guides/planning-docs.md` § "Verification gate (canonical)".
That doc is the single source of truth — if the gate model changes,
update it there first and regenerate plans from this skill.

#### Multi-phase template

For plans with more than one phase, generate a **gate block inside each
phase**, plus one end-of-plan gate. Skipping = unchecked box visible at
the top of the next session.

```markdown
# <Initiative Title> — Execution Plan

## Related Documents

- **Roadmap:** `docs/roadmap.md` Phase N (if applicable)
- **Vision:** `docs/vision.md` Layer <N> (if applicable)
- **Guide:** `docs/guides/planning-docs.md`
- **ADRs:** <list any governing ADRs from Step 3>

## Context

<From the user's description + Step 3 exploration>

## Patterns to Reuse

| Pattern | Location | Usage |
|---------|----------|-------|
| <name> | `<path>` | <how to reuse in this plan> |

## Exit Criteria

<Concrete, verifiable criteria — for roadmap phases, copied verbatim
from the roadmap; for ad-hoc, derived from description + exploration>

## Key Files

| File | Action |
|------|--------|

---

## Phase 1: <Title>

### Tasks

- [ ] <file-level task with path>
- [ ] <file-level task with path>

### Phase 1 Gate (run in order; each writes a receipt)

- [ ] `/review-plan-impl docs/plans/active/<name>/execution-plan.md --phase 1`
      Receipt: `artifacts/plan-impl-review/<ts>/report.md`
- [ ] `/mid-session-drift-check`
      Receipt: inline report in chat; cite `file:line` for any violation
- [ ] If this phase introduced a deviation: `/write-adr <topic>`
      Receipt: `docs/adrs/ADR-NNN-<slug>.md`
- [ ] If this phase touched PRD-governed code: `/review-prd-compliance`
      Receipt: inline matrix; cite PRD section + `file:line` for any drift
- [ ] All gate findings resolved before checking Phase 1 complete

---

## Phase 2: <Title>

### Tasks

- [ ] <file-level task>

### Phase 2 Gate (run in order; each writes a receipt)

- [ ] `/review-plan-impl docs/plans/active/<name>/execution-plan.md --phase 2`
      Receipt: `artifacts/plan-impl-review/<ts>/report.md`
- [ ] `/mid-session-drift-check`
      Receipt: inline report in chat; cite `file:line` for any violation
- [ ] If this phase introduced a deviation: `/write-adr <topic>`
- [ ] If this phase touched PRD-governed code: `/review-prd-compliance`
- [ ] All gate findings resolved before checking Phase 2 complete

---

## End-of-Plan Gate

- [ ] `/verify-done` — test triad + headed E2E + Chrome DevTools visual + `/verify-docs` task-scoped
      Receipt: inline verification table + screenshots
- [ ] `git commit` — only after `/verify-done` passes
- [ ] `/prepare-handoff` — only if work continues in a new session
      Receipt: `docs/plans/active/<name>/handoff-check.md` + answer key
```

#### Single-phase template

For plans with one phase, collapse to a single gate at the bottom (the
existing shape, but with `/review-plan-impl` added — the lifecycle
diagram in `.claude/skills/README.md` requires it).

```markdown
# <Initiative Title> — Execution Plan

## Related Documents

- **Guide:** `docs/guides/planning-docs.md`
- **ADRs:** <any governing ADRs from Step 3>

## Context

<Why this initiative matters, from description + exploration>

## Patterns to Reuse

| Pattern | Location | Usage |
|---------|----------|-------|
| <name> | `<path>` | <how to reuse in this plan> |

## Exit Criteria

<Concrete, verifiable criteria>

## Tasks

- [ ] <file-level task with path>
- [ ] <file-level task with path>

## Key Files

| File | Action |
|------|--------|

## End-of-Plan Gate (run in order; each writes a receipt)

- [ ] `/review-plan-impl docs/plans/active/<name>/execution-plan.md`
      Receipt: `artifacts/plan-impl-review/<ts>/report.md`
- [ ] `/mid-session-drift-check`
      Receipt: inline report in chat; cite `file:line` for any violation
- [ ] If this plan introduced a deviation: `/write-adr <topic>`
      Receipt: `docs/adrs/ADR-NNN-<slug>.md`
- [ ] If this plan touched PRD-governed code: `/review-prd-compliance`
- [ ] `/verify-done` — test triad + headed E2E + Chrome DevTools visual + `/verify-docs` task-scoped
- [ ] `git commit` — only after `/verify-done` passes
- [ ] `/prepare-handoff` — only if work continues in a new session
```

Fill in the Key Files table, populate the Patterns to Reuse table from
Step 3's "Existing patterns to reuse" findings, and refine tasks into
concrete, file-level work items based on the Step 3 exploration.

**Present the draft to the user for review before writing to disk.**

#### Gate tiering (rule block — keep verbatim in the generated plan if you customize it)

| Tier | When | Skill(s) | Time budget |
|------|------|----------|-------------|
| **Task** | After each file-level checkbox | none — just check the box | ~0 |
| **Phase end** | Before checking a phase complete | `/review-plan-impl --phase N` then `/mid-session-drift-check` (plus conditional `/write-adr`, `/review-prd-compliance`) | ~5–15 min + ~2–5 min |
| **Plan end / pre-commit** | Before the final `git commit` | `/verify-done` (test triad + E2E + visual + `/verify-docs`) | ~10–30 min |

The lifecycle source of truth is `.claude/skills/README.md`. Required
ordering — do **not** reorder:

- After implementing → `/review-plan-impl --phase N`
- Before commit → `/mid-session-drift-check`
- End of task → `/verify-done`

For a 5-phase plan: roughly 5 × (5–15 + 2–5) = 35–100 min of phase-gate
time, plus one `/verify-done` at the end. The cost is bounded and tied
to actual work units — not bureaucratic ceremony.

#### Anti-shortcut (rule block — keep verbatim in the generated plan)

- **Each phase gate is a checkbox INSIDE the phase**, not a global
  section at the bottom. A skipped gate is an unchecked box visible at
  the top of the next session.
- **Each gate prints its expected receipt artifact path** next to the
  checkbox (e.g. `artifacts/plan-impl-review/<ts>/report.md`). A missing
  receipt file is an obvious gap that `/mid-session-drift-check`
  surfaces.
- **`/review-plan-impl` spawns a fresh-context subagent** — the
  implementing agent cannot coach it. Already its design — we just stop
  skipping it.
- **`/mid-session-drift-check` at every phase boundary catches a skipped
  earlier gate** within one phase, not at end-of-plan when it's expensive
  to fix.
- **Skipping a gate without an explicit user waiver is a process
  violation** surfaced by `/mid-session-drift-check`. Documented once in
  `CLAUDE.md` `## IMPORTANT`; this skill template just enforces it.

We are NOT adding new mid-session checks beyond
`/mid-session-drift-check`. It already covers mocks, tests, scope creep,
honesty, rejected patterns, and doc currency — layering more would be
ceremony.

### Step 5: Update CLAUDE.md

Add the new plan to CLAUDE.md's `**Active plans**` section using the
**dense template** below. The template must visually match existing
entries (status, last completed phase, dates, link).

#### Template

```
N. <Initiative Name> — Phase <N> <STATUS> (<YYYY-MM-DD>): <1-sentence list of what landed in that phase>. Next: <concrete next phase or step>. See `docs/plans/active/<name>/execution-plan.md`
```

#### Before / after example

**Before (the old generic template — DO NOT use):**

```
11. Auth Middleware — Add JWT auth and session middleware. See `docs/plans/active/auth-middleware/execution-plan.md`
```

**After (the dense template — USE this shape):**

```
11. Auth Middleware — Phase 1 COMPLETE (2026-05-14): JWT provider, refresh token rotation, session middleware (3 tests). Next: Phase 2 (rate limiting + CSRF). See `docs/plans/active/auth-middleware/execution-plan.md`
```

Reference shape from existing entries (do not edit these — just match
their density):

- "Visual Diversity — Phase 1-2, 4 COMPLETE. Prerequisite COMPLETE.
  Phase 3 (3.1-3.8) COMPLETE. ... Next: Phase 5 ... See
  `docs/plans/active/visual-diversity/execution-plan.md`"
- "CHIP's Next Steps — M0 (Ground Truth) COMPLETE (2026-05-04).
  ... Next: M1 (Connect ...). See
  `docs/plans/active/chips-next-steps/execution-plan.md`"

For a brand-new plan, the status is typically `Phase 1 NOT STARTED` —
that's still the dense shape:

```
N. <Initiative Name> — Phase 1 NOT STARTED. Goal: <one sentence>. See `docs/plans/active/<name>/execution-plan.md`
```

Number it after the existing active plans. For child plans, add a
sub-bullet under the parent entry rather than a new top-level entry.

### Step 6: Auto-challenge (with explicit plan path)

Invoke `/challenge-plan` and **pass the plan path explicitly** so the
companion skill does not have to guess from `~/.claude/plans/`:

```
/challenge-plan docs/plans/active/<name>/execution-plan.md
```

(Or for a child plan: `/challenge-plan docs/plans/active/<parent>/m<N>-execution-plan.md`.)

The challenge report may surface:

- Framework violations (vision conflicts, ADR contradictions)
- Trade-off decisions requiring user input
- Missing alternatives or scope concerns

If the challenge requires plan revision, update the execution plan
before declaring ready.

## Output

After all steps complete:

```
## Plan Created: <Initiative Title>

**Location:** docs/plans/active/<name>/execution-plan.md
**Source:** <roadmap Phase N | ad-hoc | child of <parent>>
**Exit criteria:** <one-line summary>
**Phases:** <N> phase(s), each with its own gate block
**End-of-plan gate:** /verify-done → git commit → conditional /prepare-handoff
**Challenge result:** <aligned | revised after challenge>

Ready to implement. Run /session-start in the next session to pick up
this plan automatically.
```

## Rules

- **Threshold gates the skill.** Below threshold (Step 0), exit
  immediately with the one-line note. The mandate is for substantive
  work, not every code touch.
- **Always explore before scaffolding.** Don't create plans from the
  description alone. The Step 3 exploration grounds the tasks in real
  file paths and existing patterns. The six named exploration sections
  are required.
- **Exit criteria must be verifiable.** "Make auth work" is not an exit
  criterion. "Login endpoint returns JWT, refresh token rotates, session
  middleware rejects expired tokens" is.
- **Don't duplicate work.** If a backlog, active, or completed plan
  already covers this topic, reuse it (or pick a non-colliding folder
  name) rather than creating a parallel plan.
- **Child plans live inside the parent folder.** Do not create sibling
  folders for milestones of an existing initiative. See the pattern at
  `docs/plans/active/chips-next-steps/`.
- **The challenge is non-negotiable.** Step 6 always runs and always
  passes the explicit plan path. Plans that skip challenge have
  historically cost rework hours.
- **Tasks must be file-level.** "Implement auth" is not a task.
  "Create `packages/auth/src/jwt-provider.ts` with `createToken()` and
  `verifyToken()`" is a task.
- **Per-phase gates are checkboxes inside each phase.** Not a global
  section at the bottom. Single-phase plans collapse to one end-of-plan
  gate. The required ordering (`/review-plan-impl --phase N` →
  `/mid-session-drift-check` → conditional `/write-adr` /
  `/review-prd-compliance` → end-of-plan `/verify-done` →
  `git commit` → conditional `/prepare-handoff`) matches the lifecycle
  diagram in `.claude/skills/README.md`. Do not reorder.
- **Receipt paths next to gates.** Each gate checkbox prints its
  expected receipt artifact path so a missing file is an obvious gap.
- **Canonical location only.** See Step 0 guardrail. Reminder: the plan
  MUST be written to `docs/plans/active/<name>/execution-plan.md`,
  never to `~/.claude/plans/`.
