# Planning Documents — How They Work Together

> How to use the roadmap, execution plans, decision records, and capability
> visions to drive work on AgentForge. This is an operational guide, not a
> methodology argument. For the research behind these choices, see
> `docs/research/planning-methodology-investigation.md`.

---

## How to create a plan

`/create-plan` (under `.claude/skills/create-plan/SKILL.md`) is the
**mandatory entry point** for any new initiative that crosses the plan
threshold below. Do not scaffold plan folders ad-hoc; do not start
phased work without running it.

**Plan threshold.** Run `/create-plan` (or follow `.claude/skills/create-plan/SKILL.md` step by step in Cursor) when ANY of these is true:

- Work spans more than one session, OR
- Touches more than one package under `packages/`, OR
- Maps to a phase in `docs/roadmap.md`, OR
- Introduces a new agent, pipeline stage, ADR, or public API, OR
- The user explicitly asks for a "plan", "execution plan", "phased work", or similar.

Below this threshold (single-file fix, doc-only edit, lint/typecheck cleanup), do the work directly.

The skill scaffolds the plan folder under `docs/plans/active/<name>/`,
generates per-phase verification gates, and auto-runs `/challenge-plan`
with the explicit plan path before declaring the plan ready. The
"Execution plan — always" section below stays in force; this box
formalises **when** the plan must be created via the skill rather than
ad-hoc.

The matching CLAUDE.md `## IMPORTANT` mandate uses identical threshold
wording — if you change the threshold here, update CLAUDE.md and
`.claude/skills/create-plan/SKILL.md` Step 0 in the same edit.

---

## The four document types

| Document | Question it answers | Timescale | Location |
|----------|---------------------|-----------|----------|
| **Roadmap** | What capabilities does AgentForge need, in what order? | Quarterly | `docs/roadmap.md` |
| **Execution plan** | What tasks do I do today, and how do I verify them? | Per session | `docs/plans/active/<initiative>/execution-plan.md` |
| **Decision record** | Why did we choose this approach over alternatives? | Permanent (until revisited) | `docs/design-decisions.md` |
| **Capability vision** | Where is this capability area heading long-term? | Evolves slowly | `docs/plans/active/<initiative>/<name>-vision.md` |

Each serves a different audience at a different timescale. Don't collapse
them into one document — that's how alignment debt accumulates.

---

## The work cycle

### 1. Pick the next work from `roadmap.md`

The roadmap has eight numbered phases encoding a dependency graph. Phase
numbers are a topological sort — Phase 2 (RAG) needs Phase 0 (foundation)
because RAG indexes the schemas Phase 0 produces.

**Default rule:** work on the lowest-numbered unblocked phase.

**Override when:**
- A quality issue blocks demos (e.g., visual diversity scoring)
- An infrastructure gap blocks debugging (e.g., observability cleanup)
- A backlog item's trigger fires (see `docs/plans/backlog/`)

The roadmap is a default, not a mandate. Each session, you decide: roadmap
phase or something more urgent? The roadmap makes the default obvious so
you don't spend decision energy on it.

### 2. Create or resume an execution plan

For a new initiative, create a folder in `docs/plans/active/`:

```
docs/plans/active/<initiative>/
  execution-plan.md     Required — task checklist with verification criteria
  <name>-vision.md      Optional — only if the initiative needs strategic direction
  handoff-check.md      Optional — for cross-session continuity
  handoff-key.md        Optional — answer key for handoff checks
```

The execution plan is the BriefingScript — what to achieve, how to verify
it. Structure it with:

- **Related documents** — pointers to roadmap phase, ADRs, vision doc
- **Context for implementers** — gotchas, decisions already made, things
  that look obvious but aren't
- **Progress checklist** — tasks with checkboxes, completion dates, brief
  notes on what was done
- **Key files** — table of files this plan touches

### 3. Align: does the plan fulfill the roadmap's exit criteria?

This is the only alignment check. The roadmap phase says something like:

> Exit criteria: User submits seed at `/new`, clarifier asks ≤7 questions
> in ≤3 rounds, produces structured PRD YAML with assumption ledger.

The execution plan's tasks, when all checked off, must make that sentence
true. If they don't, either the plan is incomplete or the roadmap's exit
criteria need revision. One comparison, not an alignment ceremony.

### 4. Execute against the plan, not the roadmap

During coding sessions, the execution plan is the authority. The roadmap
doesn't tell you how to build something — it tells you what "done" looks
like. If you discover the exit criteria were wrong, update both the
execution plan AND the roadmap.

**Session start:** Run `/session-start`. It reads the active plans.
**During session:** Check tasks off as you complete them.
**Before declaring done:** Run `/verify-done`.

### 5. When a phase ships

1. Check off all tasks in the execution plan
2. Mark the roadmap phase as complete
3. Move the plan folder: `docs/plans/active/<initiative>/` →
   `docs/plans/completed/<initiative>/`
4. Update CLAUDE.md's `**Active plans**` and `**Completed plans**` sections
5. The next roadmap phase is now unblocked

---

## When to create each document type

### Execution plan — always

Every initiative that takes more than one session gets an execution plan.
This is non-negotiable. Without it, the next session starts from zero.
Use `/create-plan` (mandatory above the threshold defined in the
"How to create a plan" box at the top of this doc).

### Decision record — when you choose between alternatives

Add a section to `docs/design-decisions.md` when:
- You pick approach A over approach B and the reasoning isn't obvious
- Research influenced the decision (cite sources)
- Someone might later ask "why didn't you just...?"

Each entry has: decision, reasoning, alternatives considered, revisit trigger.

### Capability vision — rarely

Create one only when a capability area needs strategic direction that spans
multiple roadmap phases. Current example: UX design quality (5-tier maturity
trajectory backed by research).

Don't create a vision for every roadmap phase. Most phases are concrete
enough that the execution plan suffices.

### Roadmap update — when exit criteria change

The roadmap is not immutable. Update it when:
- You discover an exit criterion was wrong
- A dependency ordering turns out to be unnecessary
- A new phase needs to be inserted
- A phase should be split or merged

Don't update it for tactical changes (task reordering, scope adjustments
within a phase). Those belong in the execution plan.

---

## Parallel work and the roadmap

The roadmap gates **new vertical capabilities** (clarifier, RAG,
implementer, reviewer). It does not gate all work. These run in parallel:

| Work type | Driven by | Example |
|-----------|-----------|---------|
| Roadmap phases | `docs/roadmap.md` | Phase 1: Clarifier |
| Quality improvements | Execution plans in `docs/plans/active/` | Visual diversity evaluator scoring |
| Bug fixes | Issue tracking | Renderer staleness |
| Infrastructure | Backlog triggers | Observability, skill drift |

The roadmap provides a default priority ordering. Everything else
competes for attention based on urgency and impact.

---

## Plan lifecycle

```
docs/plans/
  active/       Work in progress. Read during /session-start.
  backlog/      Planned but not started. Trigger conditions noted.
  completed/    Done. Don't read during session-start. Historical reference.
```

**Moving between states:**

- **backlog → active:** User decides to start the initiative. Create the
  execution plan folder in `active/`.
- **active → completed:** All exit criteria met. Move the folder.
- **active → backlog:** Pausing. Move back to backlog with a note on why
  and what's left.
- **backlog → deleted:** Initiative is no longer relevant. Delete the file
  (Shape Up pattern: unselected work is discarded, not accumulated).

---

## Quick reference for agents

If you're an AI agent starting a session on this codebase:

1. `/session-start` reads CLAUDE.md and active plans automatically
2. CLAUDE.md's `**Active plans**` section tells you what's in progress
3. Each active plan has an `execution-plan.md` with a progress checklist
4. Work on unchecked tasks in the execution plan
5. Run the **per-phase gate** before checking each phase complete (see below)
6. When done, run `/verify-done` before declaring complete
7. The roadmap (`docs/roadmap.md`) shows what's next after the current plan

---

## Verification gate (canonical)

This is the single source of truth for the gate model that
`.claude/skills/create-plan/SKILL.md` bakes into every generated plan
template. If the gate model changes, update this section first and
regenerate plans from the skill.

### Tiering

Each work unit gets exactly the verification it needs — no more, no less.

| Tier | When | Skill(s) | Time budget |
|------|------|----------|-------------|
| **Task** | After each file-level checkbox | none — just check the box | ~0 |
| **Phase end** | Before checking a phase complete | `/review-plan-impl --phase N` then `/mid-session-drift-check` (plus conditional `/write-adr`, `/review-prd-compliance`) | ~5–15 min + ~2–5 min |
| **Plan end / pre-commit** | Before the final `git commit` | `/verify-done` (test triad + headed E2E + visual + `/verify-docs`) | ~10–30 min |

For a 5-phase plan: roughly 5 × (5–15 + 2–5) = 35–100 min of phase-gate
time, plus one `/verify-done` at the end. Cost is bounded and tied to
actual work units, not bureaucratic ceremony.

### Per-phase gate (run in order; each writes a receipt)

Inside each phase block in the generated plan:

- [ ] `/review-plan-impl docs/plans/active/<name>/execution-plan.md --phase N`
      Receipt: `artifacts/plan-impl-review/<ts>/report.md`
- [ ] `/mid-session-drift-check`
      Receipt: inline report in chat; cite `file:line` for any violation
- [ ] If this phase introduced a deviation: `/write-adr <topic>`
      Receipt: `docs/adrs/ADR-NNN-<slug>.md`
- [ ] If this phase touched PRD-governed code: `/review-prd-compliance`
      Receipt: inline matrix; cite PRD section + `file:line` for any drift
- [ ] All gate findings resolved before checking the phase complete

### End-of-plan gate (run after the last phase, before commit)

- [ ] `/verify-done` — test triad + headed E2E + Chrome DevTools visual + `/verify-docs` task-scoped
      Receipt: inline verification table + screenshots
- [ ] `git commit` — only after `/verify-done` passes
- [ ] `/prepare-handoff` — only if work continues in a new session
      Receipt: `docs/plans/active/<name>/handoff-check.md` + answer key

Single-phase plans collapse the per-phase block into the end-of-plan
gate (the `.claude/skills/create-plan/SKILL.md` template shows both
shapes).

### Required ordering

The lifecycle source of truth is `.claude/skills/README.md`. Required
ordering — do **not** reorder:

- After implementing → `/review-plan-impl --phase N`
- Before commit → `/mid-session-drift-check`
- End of task → `/verify-done`

### Anti-shortcut rules

- Each gate is a checkbox INSIDE the phase, not a global "Verification"
  section at the bottom — a skipped gate is an unchecked box visible at
  the top of the next session.
- Each gate prints its expected **receipt artifact path** next to the
  checkbox. A missing file is an obvious gap that
  `/mid-session-drift-check` surfaces.
- `/review-plan-impl` spawns a fresh-context subagent — the implementing
  agent cannot coach it.
- `/mid-session-drift-check` at every phase boundary catches a skipped
  earlier gate within one phase, not at end-of-plan when fixes are
  expensive.
- Skipping a gate without an explicit user waiver is a **process
  violation** surfaced by `/mid-session-drift-check`. Documented once
  in `CLAUDE.md` `## IMPORTANT`; this section is the canonical
  description of the gate it references.
