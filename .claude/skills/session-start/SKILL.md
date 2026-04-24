---
name: session-start
description: Session gate — reads key documents (lessons-learned, active plans, SUPERSEDED entries) and produces a brief acknowledgment before any code is written. Use at the start of every new session.
context: inline
agent: main
---

# Session Start

You are beginning a new session on this codebase. Before writing any code, you must read the key documents and prove you absorbed them. This is not ceremony — it prevents repeating mistakes that cost real hours in prior sessions.

## Protocol

### 1. Read the key documents (in this order)

Read each file fully. Do not skim.

1. **`docs/lessons-learned.md`** — every entry. The file's own status-marker key is at line 3: `RESOLVED`, `RULE`, `SUPERSEDED`, `REFERENCE`. Pay special attention to `SUPERSEDED` and `RESOLVED` entries — these contain traps where the intuitive approach is wrong. `RULE` entries are ongoing principles that apply to every session; pull them verbatim into "Top gotchas" when relevant.
2. **Active plans** — find the `**Active plans:**` block in `CLAUDE.md` (under `## Current State`). Read every referenced plan doc. Plans live in `docs/feature-plans/<plan>.md` (e.g. `docs/feature-plans/screen-types-plan-b.md`) or `docs/active-plan/<plan>/*.md` (e.g. `docs/active-plan/unify-pipeline/execution-plan.md`). Also scan the adjacent `**Completed plans:**` block — a plan listed there must not be treated as active. Also check the memory file at `~/.claude/projects/.../memory/MEMORY.md` for any `Active Work` pointers to other plans.
3. **Rules** — read all files under `.claude/rules/`. These are non-negotiable.

### 2. Produce the acknowledgment

Output a structured summary with exactly these sections:

```
## Session Briefing

**Lessons learned:** <N> entries read, <M> SUPERSEDED/Resolved
**Active plans:** <list of plan names + their status from the plan doc's Progress section>
**Rules loaded:** <list of .claude/rules/ filenames>

### Top gotchas for this session
<3-5 most relevant lessons for the work ahead, each as one line:>
- <file context> — <the rule, not a summary of the rule>

### SUPERSEDED entries (must not follow)
<For each SUPERSEDED/Resolved entry, one line:>
- <title> — SUPERSEDED <date>: <what changed and why>

### Open questions for user
<If the active plan has ambiguity, unclear next steps, or if CLAUDE.md's active plan pointer seems stale, flag it here. Otherwise write "None.">
```

### 3. Wait for confirmation

After producing the briefing, ask:

> "Session briefing complete. What would you like to work on?"

Do **not** start coding, reading additional files, or proposing plans until the user responds.

## Rules

- **Do not guess.** Every line in the briefing must cite a specific document you read. If you can't find the active plan, say so — don't fabricate one.
- **Do not editorialize.** The "Top gotchas" section states rules verbatim from the docs. Do not rephrase, soften, or add your own interpretation.
- **Flag staleness.** If any entry under `CLAUDE.md`'s `**Active plans:**` block points to a plan with all phases checked off, or duplicated under the adjacent `**Completed plans:**` block, flag it in "Open questions" — the pointer needs updating. Likewise, if `docs/active-plan/` contains a plan directory not referenced under `**Active plans:**`, surface it as possible drift.
- **Be fast.** This should take under 60 seconds. Read efficiently — you're proving comprehension, not writing a book report.
