---
name: prepare-handoff
description: Capture this session's tribal knowledge into canonical docs and validate them via a blind subagent test before the user clears context. Use when the user says the current session has significant work/decisions that need to survive into a new session.
context: inline
agent: main
---

# Prepare Handoff

You are preparing a clean handoff from the current (context-heavy) session to a future (fresh) session. Your job is to make sure every piece of tribal knowledge from this session is either (a) already in the canonical docs or (b) added to them now, and then to **prove** the docs are self-sufficient using a blind subagent test.

## Bail-out condition (check first, be honest)

Before doing anything, ask yourself: **does this session actually contain tribal knowledge worth transferring?** Tribal knowledge = gotchas, near-misses, design decisions, failed approaches, and non-obvious invariants that a reader of the committed code alone would not learn.

If the honest answer is "not really — we just wrote straightforward code and committed it," tell the user:

> "This session doesn't appear to have material tribal knowledge beyond what's in the commits. A handoff protocol would be ceremony. Do you want to skip, or is there something specific I'm missing?"

Do not fabricate tribal knowledge to justify running the skill. Wasting a handoff cycle on thin content trains the user to ignore future handoffs.

## Protocol

### 0. Plan location check (run first)

Check whether any session plan files in `~/.claude/plans/*.md` contain
plan content that is NOT in the canonical location
(`docs/plans/active/<initiative>/execution-plan.md`).

**How to check:**
1. List `~/.claude/plans/*.md` files modified in this session.
2. For each, check if a corresponding `docs/plans/active/` execution
   plan exists with the same task-level detail (not just a checklist —
   the full task breakdowns, file lists, patterns, etc.).
3. If content exists only in `~/.claude/plans/` and not in
   `docs/plans/active/`, **copy it into the canonical execution plan**
   before proceeding. The `~/.claude/plans/` files are Claude Code
   plan-mode scratch space and will not survive to the next session.

**If no `~/.claude/plans/` files exist or all content is already
canonical:** proceed to Step 1.

See `docs/guides/planning-docs.md` for the planning convention.

### 1. Tribal knowledge audit

Produce a bulleted list under three headings. Be ruthless — if something isn't real, drop it.

- **Gotchas**: non-obvious traps that cost real time in this session (OOM bugs, naming mismatches, env setup, etc.).
- **Decisions**: architectural choices made, especially ones that went against an intuitive alternative. Each needs a one-line rationale.
- **Superseded beliefs**: things we used to do / recommend that we stopped doing in this session. Each needs a one-line "don't do X because Y."

If the list is < 3 items total, re-invoke the bail-out condition.

### 2. Canonical doc updates

Each item above maps to exactly one canonical location:

- **Gotcha** → append to a "Context for implementers" block in the relevant plan doc (`docs/plans/<name>.md`). Create the block if it doesn't exist.
- **Decision** → write a new ADR at `docs/adrs/ADR-<next-num>-<slug>.md`. If Guardrail 8 applies and the decision deserves one, you **must** write it. Do not park it in a plan.
- **Superseded belief** → if the old belief lives in `docs/lessons-learned.md`, mark the entry `(SUPERSEDED YYYY-MM-DD)` with a prominent callout block at the top explaining what changed and why. Keep the original body for historical context. If the belief was oral-only, write it as a new lessons-learned entry titled "Why we stopped Xing."

Each update must be a single focused edit. Do not rewrite existing docs.

### 3. Create or update the handoff-check docs (two files)

The handoff-check is split into **two files** so the receiving agent can read questions without seeing answers. This is not optional — a single file defeats the self-audit protocol because the Read tool loads the entire file at once.

**File 1 — Questions:** `docs/plans/<phase-or-topic>-handoff-check.md`

Contains:
- **Turn 1 block** — 10–15 questions targeting the gotchas from step 1. Include one "trap" question where the intuitive answer is wrong (e.g. "should you follow <superseded lesson>?"), and one "coverage probe" that forces the agent to name all three critical docs in order.
- **Turn 3 block** — instruction to copy the `## Doc gaps to report upstream` section back.
- **Hard-fail / soft-fail triggers** — named failure patterns that mean "abort the handoff."
- **Maintenance section** — when source docs change, the answer key must change too.
- **Answer key pointer** — a line at the bottom: `Answer key: docs/plans/<phase-or-topic>-handoff-key.md` (read only after answering all questions).

**File 2 — Answer key:** `docs/plans/<phase-or-topic>-handoff-key.md`

Contains:
- **Turn 2 block** — authoritative answer key with **bolded keywords** (keywords are what grading diffs against; prose is irrelevant). Each answer cites the exact file + section anchor.

The receiving agent reads File 1 first, answers from canonical docs, then reads File 2 to self-grade. Keeping them separate makes the protocol mechanically enforceable — not just an honor system.

### 4. Blind subagent validation (this is the real test)

Spawn a Task subagent with `subagent_type: explore`. The prompt must:

- State explicitly: "You have ZERO pre-loaded context. `AGENTS.md` and `CLAUDE.md` are reasonable starting points; nothing else has been pre-loaded into your attention."
- Include a **`Docs consulted`** requirement as the first section of output (for auditing honesty — catches agents that guess from filenames).
- Include all handoff-check questions verbatim from Turn 1.
- Require citations in `<file> → <smallest anchor>` format.
- Forbid self-grading, summarizing, or proposing next steps ("After Q<n>, STOP").

### 5. Grade the subagent's answers strictly against your own key

For each question, classify:

- **PASS** = hit all bolded keywords + valid cite.
- **PARTIAL** = hit some keywords but missed one or more. Must be specific about which.
- **FAIL** = contradicted the key, cited the wrong file, or answered a different question.

Every non-PASS row must be further classified:

- **AGENT_GAP** = docs say it clearly, subagent missed it. No doc change needed.
- **DOC_GAP** = docs are silent / unclear / contradictory. **Patch the source doc + answer key before proceeding.**
- **KEY_AMBIGUOUS** = your key is open to interpretation. Tighten the key.

**Expected case: you will find at least one DOC_GAP or KEY_AMBIGUOUS on the first run.** (This already happened once — the `POST /api/projects/activate` answer-key bug.) If the first subagent run returns 100% PASS on a freshly-written handoff-check, be suspicious and verify at least 2 citations by reading the cited files yourself. Perfect first runs are usually context leakage, not doc quality.

### 6. Iterate

- If DOC_GAPs found → patch docs → re-run subagent.
- Hard cap: **3 iterations.** If the 3rd run still produces DOC_GAPs, stop and tell the user: "After 3 patch cycles the docs still don't cover X. This needs human-in-the-loop." Do not fake a clean pass by narrowing questions.

### 7. Output

On clean pass (or after 3 iterations with residual gaps surfaced to user), produce:

```
## Handoff ready

Canonical docs updated:
- <file 1>: <what changed>
- <file 2>: <what changed>
- <file 3>: <what changed>

Handoff-check: <path>

Subagent validation: <n>/<n> PASS after <k> iteration(s).
Residual known gaps (if any): <list or "none">.

## To start the next session

In a new Cursor chat, paste this exactly:

> Run the `receive-handoff` skill with handoff-check = <absolute path to handoff-check doc>.

After the new agent finishes its READY gate, tell it to proceed.
```

## Anti-theater guards

- If tribal-knowledge audit fails the bail-out threshold, bail. Ceremony hurts trust.
- Every canonical doc update must be a specific edit to a specific file. "Update the plan" is not a step; "append items 8–9 to the Context block at line 870" is.
- Never fabricate a citation in the answer key. If you can't cite, the claim doesn't belong in the answer key.
- Never re-run the subagent with the answer key in the prompt. That's context leakage by definition.
- If the user's open editor tabs contain the handoff-check or canonical docs, note it. The subagent is immune (different context) but a future human-driven check via "new Cursor chat" is NOT — remind the user to close those tabs before trying that variant.
