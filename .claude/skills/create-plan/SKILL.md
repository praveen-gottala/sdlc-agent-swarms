---
name: create-plan
description: Create an execution plan for any initiative — roadmap phase, feature, quality improvement, or infrastructure task. Explores the codebase, scaffolds the plan folder, and auto-challenges against framework intent.
argument-hint: "<description of what to build>"
---

# Create Plan

You are creating an execution plan for a new initiative. This skill handles
both roadmap phases (`/create-plan Phase 3 change classification`) and
ad-hoc work (`/create-plan add evaluator diversity scoring`).

Reference: `docs/guides/planning-docs.md` explains how planning documents
work together.

## Protocol

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

### Step 2: Check existing plan state

Derive a kebab-case folder name from the description:
- "handle auth for users" → `auth-for-users`
- "Phase 3 change classification" → `change-classification`
- "add evaluator diversity scoring" → `evaluator-diversity-scoring`

Check for existing plans:

1. `docs/plans/active/<name>/` — if a plan folder exists:
   - Read the execution plan
   - Show the progress checklist
   - Ask: "An active plan already exists. Resume it, or start fresh?"

2. `docs/plans/backlog/` — if a backlog plan matches this topic:
   - Show the backlog plan
   - Ask: "A backlog plan exists for this. Promote to active as-is,
     use as starting point, or start fresh?"

3. If no existing plan: proceed to Step 3.

### Step 3: Explore the codebase

Launch an Explore agent to understand the relevant area:

- What packages and files are involved?
- What types, interfaces, and functions already exist?
- What patterns should be followed (from similar existing work)?
- What ADRs govern this area?

If a roadmap phase was matched in Step 1, also read the relevant
`docs/vision.md` layer to understand the target architecture.

Present a brief exploration summary before proceeding.

### Step 4: Create the execution plan

Create the folder and file: `docs/plans/active/<name>/execution-plan.md`

**For roadmap phases**, scaffold from the roadmap's exit criteria:

```markdown
# <Phase Goal> — Execution Plan

## Related Documents
- **Roadmap:** `docs/roadmap.md` Phase N
- **Vision:** `docs/vision.md` Layer <relevant>
- **Guide:** `docs/guides/planning-docs.md`

## Context
<From the roadmap's demoable outcome + codebase exploration findings>

## Exit Criteria (from roadmap)
<Copied verbatim from roadmap phase>

## Progress Checklist
- [ ] <concrete task with file paths>
- [ ] ...

## Key Files
| File | Action |
|------|--------|
```

**For ad-hoc initiatives**, scaffold from the description + exploration:

```markdown
# <Initiative Title> — Execution Plan

## Related Documents
- **Guide:** `docs/guides/planning-docs.md`
- **ADRs:** <any governing ADRs from exploration>

## Context
<Why this initiative matters, from the user's description + exploration>

## Exit Criteria
<Concrete, verifiable criteria derived from description + exploration>

## Progress Checklist
- [ ] <concrete task with file paths>
- [ ] ...

## Key Files
| File | Action |
|------|--------|
```

Fill in the Key Files table and refine tasks into concrete, file-level
work items based on the Step 3 exploration.

**Present the draft to the user for review before writing to disk.**

### Step 5: Update CLAUDE.md

Add the new plan to CLAUDE.md's `**Active plans**` section:

```
N. <Name> — <one-line summary>. See `docs/plans/active/<name>/execution-plan.md`
```

Number it after the existing active plans.

### Step 6: Auto-challenge

Invoke `/challenge-plan` on the newly created execution plan.

The challenge report may surface:
- Framework violations (vision conflicts, ADR contradictions)
- Trade-off decisions requiring user input
- Missing alternatives or scope concerns

If the challenge requires plan revision, update the execution plan before
declaring ready.

## Output

After all steps complete:

```
## Plan Created: <Initiative Title>

**Location:** docs/plans/active/<name>/execution-plan.md
**Source:** <roadmap Phase N | ad-hoc>
**Exit criteria:** <one-line summary>
**Tasks:** <N> tasks in checklist
**Challenge result:** <aligned | revised after challenge>

Ready to implement. Run /session-start in the next session to pick up
this plan automatically.
```

## Rules

- **Always explore before scaffolding.** Don't create plans from the
  description alone. The codebase exploration in Step 3 grounds the tasks
  in real file paths and existing patterns.
- **Exit criteria must be verifiable.** "Make auth work" is not an exit
  criterion. "Login endpoint returns JWT, refresh token rotates, session
  middleware rejects expired tokens" is.
- **Don't duplicate work.** If a backlog or active plan already covers
  this topic, reuse it rather than creating a parallel plan.
- **The challenge is non-negotiable.** Step 6 always runs. Plans that
  skip challenge have historically cost rework hours.
- **Tasks must be file-level.** "Implement auth" is not a task.
  "Create `packages/auth/src/jwt-provider.ts` with `createToken()` and
  `verifyToken()`" is a task.
- **Canonical location only.** The plan MUST be written to
  `docs/plans/active/<name>/execution-plan.md` — never to
  `~/.claude/plans/`. Claude Code's plan-mode auto-creates files in
  `~/.claude/plans/` as scratch space; those files are ephemeral and
  not part of the project's planning system. If plan-mode was used
  during this skill, copy the final plan content into the canonical
  location and treat `~/.claude/plans/` as disposable. See
  `docs/guides/planning-docs.md` for the planning convention.
