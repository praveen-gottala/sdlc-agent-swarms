# Planning Documents — How They Work Together

> How to use the roadmap, execution plans, decision records, and capability
> visions to drive work on AgentForge. This is an operational guide, not a
> methodology argument. For the research behind these choices, see
> `docs/research/planning-methodology-investigation.md`.

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
5. When done, run `/verify-done` before declaring complete
6. The roadmap (`docs/roadmap.md`) shows what's next after the current plan
