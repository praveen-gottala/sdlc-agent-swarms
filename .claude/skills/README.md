# AgentForge Skills Library

Skills are structured prompts that guide Claude Code through multi-step verification,
auditing, and implementation workflows. Invoke them with `/skill-name` in the Claude
Code prompt.

## Lifecycle

Skills map to specific points in the development lifecycle:

```
New initiative    Session start     After implementing     Before commit     End of task       Pre-release
     |                 |                |                     |                   |                |
/create-plan     /session-start  /review-plan-impl     /mid-session-drift  /verify-done    /verify-docs
     |                            (fidelity gate)        -check              |                 --full-sweep
     +-> /challenge-plan (auto)                          (process gate)      +-> /verify-docs
                                                                            |    (task-scoped)
                                                                            /backstage sync
                                                                                 (doc drift)
```

## Skills Reference

### Session & Handoff

| Skill | Purpose | When to use |
|-------|---------|-------------|
| `/session-start` | Read key docs (lessons-learned, active plans, SUPERSEDED entries), produce session briefing | Every session start, before writing any code |
| `/prepare-handoff` | Capture session's tribal knowledge into canonical docs | End of session with significant work/decisions |
| `/receive-handoff` | Verify new agent understood handoff docs before touching code | Start of a handoff session |

**Example:**
```
> /session-start
# Produces a briefing with active plans, recent lessons, and SUPERSEDED warnings
```

### Planning & Analysis

| Skill | Purpose | When to use |
|-------|---------|-------------|
| `/create-plan` | **Mandatory above the plan threshold** (see `docs/guides/planning-docs.md`). Explores codebase, scaffolds plan folder under `docs/plans/active/<name>/` (or as a child plan inside an existing parent folder), generates per-phase verification gates that auto-invoke `/review-plan-impl`, `/mid-session-drift-check`, and `/verify-done`, auto-runs `/challenge-plan` with the explicit plan path. | Any new initiative crossing the plan threshold |
| `/analyze-codebase` | Deep gap analysis + prioritized task roadmap | When assessing project health or finding priorities |
| `/sprint-plan` | Time-boxed sprint planning from task backlog | Planning sprints with daily goals |
| `/challenge-plan` | Challenge a plan against framework intent (vision, PRD, ADRs) | Before approving any plan — get a second opinion |
| `/implement-feature` | PRD-traced implementation workflow with testing and ADR gates | Building new capabilities or modules |

**Example:**
```
> /challenge-plan
# Reads active plan + canonical docs, reports alignment or violations

> /implement-feature auth-middleware
# Walks through PRD lookup, implementation, testing, ADR creation
```

### Verification & Quality

| Skill | Purpose | When to use |
|-------|---------|-------------|
| `/verify-done` | Pre-completion gate: test triad + headed E2E + visual verification + doc verification | Before declaring any dashboard/prototype/renderer task done |
| `/verify-docs` | Documentation content accuracy: vision layers, specs, CLI docs, lessons-learned | From verify-done (task-scoped), before commit, or pre-release (full-sweep) |
| `/review-plan-impl` | Fresh-context diff review against plan phase: 7-point rubric + deterministic pre-checks + portable prompt audit trail | After implementing a plan phase, before committing |
| `/mid-session-drift-check` | Process compliance audit: mocks, tests, scope creep, honesty, rejected patterns | Mid-session, before commits, when session feels long |
| `/verify-design-render` | Spec-to-renderer property fidelity check | After design spec or renderer changes |

**Example:**
```
> /verify-done
# Runs: test triad -> kill stale Vite -> headed E2E -> visual verification
#        -> pipeline check -> evaluator check -> session retrospective (auto-writes
#           lessons-learned + CLAUDE.md pointers) -> /verify-docs (propose-then-confirm
#           for vision/specs/CLI) -> verification table

> /verify-docs --full-sweep
# Runs all 7 doc checks unconditionally (pre-release audit)

> /mid-session-drift-check
# Inventories session changes, re-reads rules, reports violations with file:line cites
```

### Observability (Langfuse)

| Skill | Purpose | When to use |
|-------|---------|-------------|
| `/langfuse-password-reset` | Reset self-hosted Langfuse UI login password (Postgres `users.password` bcrypt) | Locked out of Langfuse UI, lost password, dev recovery |

### Compliance & Documentation

| Skill | Purpose | When to use |
|-------|---------|-------------|
| `/review-prd-compliance` | Audit code vs PRD intent + TypeScript contracts | Checking if implementation matches product spec |
| `/write-adr` | Generate Architecture Decision Record | When implementation deviates from spec |
| `/demo-readiness` | Find fastest path to a working, showable demo | Before presentations or stakeholder updates |
| `/update-skill` | Realign a skill with canonical docs when it feels stale | When a skill cites superseded ADRs or wrong paths |
| `/backstage create` | Create or revise backstage doc page with editorial protocol | When writing new docs or fixing existing ones |
| `/backstage sync` | Regenerate Tier 3 pages + Tier 2 concept drift check | Before releases, demos, or periodically |

**Example:**
```
> /write-adr typescript-only-engine
# Creates ADR-NNN documenting the deviation with rationale

> /update-skill verify-done
# Reads canonical docs, produces drift report, applies targeted edits
```

## Ownership Boundaries

Each concern has exactly one owning skill. If two skills seem to cover the same thing,
one of them is doing it wrong.

| Concern | Owned by |
|---------|----------|
| Creating execution plans for initiatives | `/create-plan` (**mandatory** above the plan threshold defined in `docs/guides/planning-docs.md`) |
| Documentation content is accurate | `/verify-docs` |
| Code passes tests, lint, typecheck | `/verify-done` (Steps 0-2) |
| Browser behavior works correctly | `/verify-done` (Steps 3-4) |
| Process rules followed during session | `/mid-session-drift-check` |
| Code matches PRD product requirements | `/review-prd-compliance` |
| Plans align with framework philosophy | `/challenge-plan` |
| Diff matches plan phase specification | `/review-plan-impl` |
| Spec-to-renderer visual fidelity | `/verify-design-render` |
| Creating/revising doc pages | `/backstage create` |
| Doc drift detection (concept pages) | `/backstage sync` |
| Langfuse UI login / Postgres password recovery | `/langfuse-password-reset` |
| Langfuse API, CLI, docs | `.agents/skills/langfuse` (Langfuse skill) |

## How Skills Compose

Some skills invoke others:

- `/verify-done` calls `/verify-docs` (task-scoped) as its documentation verification step
- `/mid-session-drift-check` recommends running `/verify-docs` when >3 production files changed
- `/review-plan-impl` recommends cross-skill follow-ups based on findings (e.g., `/verify-done` for test gaps, `/write-adr` for behavioral changes not in plan)

No skill calls itself or creates circular invocations. `/verify-docs` never calls another
skill — it reads files and produces a report.

**Portable prompt pattern:** `/review-plan-impl` always writes a self-contained prompt file
to `artifacts/plan-impl-review/<ts>/prompt.md` before spawning its subagent. This creates an
audit trail and enables tool-agnostic re-runs. Other review skills may adopt this pattern.

## Adding a New Skill

1. Create a directory under `.claude/skills/<skill-name>/`
2. Add `SKILL.md` with frontmatter (`name`, `description`, `context`, `agent`)
3. Add the skill to `CLAUDE.md` Skills Library section
4. Update this README with the skill's entry in the appropriate table
5. Verify ownership boundaries — does the new skill overlap with an existing one?
