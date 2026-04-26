---
name: mid-session-drift-check
description: Mid-session audit — are we still following the rules we started with? Reads the canonical docs in CLAUDE.md's prescribed order (vision.md, lessons-learned.md, ADRs, CLAUDE.md + topical rules), inventories this session's changes, and reports concrete rule violations with file+line cites. Use before commits, before marking tasks "complete", or anytime the session has gone long enough that early-session instructions may have faded.
context: inline
agent: main
---

# Check Drift

You are performing a mid-session alignment audit. Long sessions drift — early-session rules get forgotten, guardrails get skipped, "just this once" exceptions become habits. Your job is to catch that **now**, before the drift ships.

This is NOT a PRD-compliance review (use `review-prd-compliance` for that). This is a **process-rules** audit: testing, mocks, ADRs, honesty, architecture invariants, whatever the repo's canonical rules forbid or require.

## Bail-out condition (check first)

If this session has made <3 substantive changes (file edits, new files, refactors), there's nothing meaningful to audit. Tell the user:

> "This session has made only <N> substantive changes. Drift audit is premature — the signal-to-noise won't be useful yet. Rerun `mid-session-drift-check` after a few more changes, or before your next commit."

Do not fabricate violations to justify running the skill.

## Protocol

### 1. Inventory the session's changes

Produce a concrete list of everything this session touched. Prefer `git status` + `git diff --stat` over memory. For each changed file, note:

- **New file / modified / deleted**
- **Category**: production code / test / doc / config / fixture

Output:

```
## Session inventory

- <path 1> (modified, production) — <1-line summary of the change>
- <path 2> (new, test) — ...
- ...

Totals: <n> production files, <n> test files, <n> docs, <n> configs.
```

If the totals look off (e.g. 12 production files, 0 tests), flag it immediately — that's a drift signal regardless of the specifics.

### 2. Re-read the canonical rules

Read these files completely (not skim — complete), in this order. This order is set by `CLAUDE.md` §"Reading order (IMPORTANT)" and is the authority when sources conflict (`CLAUDE.md` security/test rules → `vision.md` → ADRs → `PRD.md` → legacy codebase):

1. `CLAUDE.md` (primary rules — reading order, conflict hierarchy, non-negotiables)
2. `docs/vision.md` (architectural authority; wins over PRD on patterns — Layers 1-3 and 8 are the highest-drift surface)
3. `docs/lessons-learned.md` (Do Not Repeat list; watch SUPERSEDED and RESOLVED markers)
4. `docs/adrs/` (read ADRs this session's changes plausibly touch; check the `Status` / `Supersedes` / `Superseded by` headers — e.g. ADR-043 supersedes ADR-022)
5. `docs/specs/PRD.md` (product truth, not pattern truth — only if this session touched product scope, interfaces, API contracts, enums, or field lists)
6. `.claude/rules/honesty.md`
7. `.claude/rules/karpathy-guidelines.md`
8. Any `.claude/rules/<topic>.md` that matches the files touched in step 1 (e.g. `testing.md` if tests were edited, `typescript.md` if `.ts` files were edited, `prd-compliance.md` if behaviour changed).
9. If the session is working inside an active plan, read that plan's Guardrails section too. Plans live in `docs/active-plan/<plan>/*.md` (e.g. `docs/active-plan/unify-pipeline/execution-plan.md`) or `docs/feature-plans/<plan>.md` (e.g. `docs/feature-plans/screen-types-plan-b.md` has `## Agent Guardrails — READ FIRST`).
10. `AGENTS.md` last — it's a navigation map, not an authority; use it to confirm you haven't missed a canonical doc.

After reading, output a short block naming the rules you read. If you skipped any that look relevant, say why.

### 3. Rule-by-rule audit

For each rule that applies, produce one block:

```
### Rule: <short name> — <path>

- **Status**: CLEAN | VIOLATION | DEVIATION_WITH_ADR | UNCLEAR
- **Evidence**: <file path + line range, or "no matching changes">
- **Detail**: <one sentence>
```

**Status definitions (be strict):**

- **CLEAN** — the rule applies to this session's changes and they comply.
- **VIOLATION** — the rule applies and is being broken. Cite exactly where.
- **DEVIATION_WITH_ADR** — the rule is broken *intentionally* and there's an ADR or plan section authorizing it. Cite the ADR.
- **UNCLEAR** — the rule might apply but you can't tell without more context. Name what would resolve it.

**Do not use CLEAN as a default.** If a rule doesn't apply, don't list it. If a rule applies but you can't tell, use UNCLEAR — not CLEAN.

**High-signal checks to run explicitly** (these are the ones that actually drift in real sessions):

1. **Mocks in production code.** Grep the changed production files for `mock`, `fake`, `stub`, `TODO`, `FIXME`, hardcoded fixtures. Any mock outside `__tests__/` or `*.test.*` is a VIOLATION unless an ADR authorizes it.
2. **Test coverage for new behaviour.** For each production file modified, does a corresponding test file also appear in the inventory? If not, VIOLATION of `testing.md` unless the change is pure refactor.
3. **ADR-worthy decisions.** Did this session make an architectural choice that went against an intuitive alternative, or deviated from the PRD/plan? Per Guardrail 8, that needs an ADR. If no ADR was written, VIOLATION.
4. **Honesty checks.** Did you claim "done," "fixed," or "passing" on anything this session without running the test/command that would verify it? Cite the message where you claimed it. If yes, VIOLATION of `honesty.md`.
5. **Scope creep.** Did this session touch files outside what the user asked for? Name them. If yes, not necessarily a violation, but surface it.
6. **Skipped or disabled tests.** Grep for `.skip(`, `.only(`, `xdescribe`, `xit`, `test.fixme` added in this session. Each one needs a linked issue/ADR or it's a VIOLATION.
7. **Commented-out code in production files.** Any new commented-out code is a VIOLATION unless the comment explains why.
8. **Premature abstraction.** Did we add an abstraction layer without at least 2 concrete consumers? If so, VIOLATION of karpathy-guidelines (simplicity first).
9. **Vision-rejected patterns.** Grep the session's production changes for patterns `CLAUDE.md` §"Rejected Patterns — Check Before Proposing" and `docs/vision.md` call out: event bus / `EventEmitter` used for coordination (not just telemetry) — vision Layer 2 / `CLAUDE.md` line 152; parallel frontend/backend/tests coders within one task — vision Layer 8 / `CLAUDE.md` line 153-154; new code extending `services/engine/` (Python orchestration) — ADR-043 / `CLAUDE.md` line 28; untyped inter-node payloads instead of typed LangGraph channels with Zod — vision Layer 2 / `CLAUDE.md` line 120-127; stub fallbacks on missing imports — `CLAUDE.md` line 313. Each hit is a VIOLATION unless an ADR authorizes it.
10. **Superseded-pattern revival.** Cross-reference the session's changes against `docs/lessons-learned.md` SUPERSEDED entries and against ADRs whose `Status` reads "Superseded by ADR-NNN". If the session reintroduces a pattern explicitly marked SUPERSEDED (e.g. `docs/lessons-learned.md` §"Renderer Staleness: Kill-and-Restart" SUPERSEDED 2026-04-20, or new code modeled on ADR-022 now that ADR-043 supersedes it), that's a VIOLATION — cite the superseding entry.
11. **Documentation currency.** If this session modified production code in more than 3 files, run `/verify-docs` in task-scoped mode. Any FAILURE in the doc report is a VIOLATION — documentation that describes pre-change state while the code has moved forward is stale by definition. Cite the verify-docs report line as evidence. See `CLAUDE.md` §Documentation (lines 306-317) for the rules being checked.

### 4. Balance — what's still clean

After the violations, list **3 specific things that passed** that you actually verified. Format:

```
## Still aligned

- <check 1 — specific, verifiable>: <evidence>
- <check 2>: <evidence>
- <check 3>: <evidence>
```

This matters. A skill that only ever reports bad news gets ignored. If you literally cannot find 3 clean things, say "I could only verify <n> clean items; the remainder are either untested or drifting" — that itself is signal.

### 5. Honesty self-check

One more block, specifically about your own behavior in this session:

```
## My own drift

- Did I claim any result without verification? <yes/no + cite>
- Did I loop on a failing approach without stopping to reconsider? <yes/no + cite>
- Did I silently add scope the user didn't ask for? <yes/no + cite>
- Did I defer to "we'll fix it later" on something I could fix now? <yes/no + cite>
```

If all four are "no," re-check. Sessions of non-trivial length almost always have at least one honest "yes" here. Zero yeses usually means you're not being honest.

### 6. Recommend remediation, don't execute it

Produce a final block:

```
## Recommended remediation

- **Fix now** (blocking — would be wrong to commit without):
  - <item 1 with file+line>
  - <item 2>

- **Fix before phase completion** (important but not commit-blocking):
  - <item 3>

- **Park as tech debt** (user-approved deviations, out-of-scope cleanups):
  - <item 4 — with proposed issue/ADR>

- **No action** (CLEAN items, just acknowledgement):
  - <item 5>
```

**Then STOP.** Do not start fixing. The user decides what category each item goes in and when. Your job was to surface; theirs is to triage.

## Anti-theater guards

- **Specificity is the honesty gate.** Every violation must have a file path and a line number. "I think we might have skipped a test somewhere" is not a finding; "`packages/foo/bar.ts:42` adds new branching logic and no matching test appears in this session" is.
- **Do not inflate.** If you find 1 real violation, report 1. Do not round up to "also here are five things that might possibly drift someday." Noise kills the skill.
- **Do not deflate either.** If you find 8 real violations, report 8. Do not triage down to a "prioritized top 3" to make the report look cleaner. The user decides what's important.
- **Distinguish violations from deviations.** A rule broken intentionally with an ADR is DEVIATION_WITH_ADR, not VIOLATION. Not all deviation is drift.
- **Do not run this every N turns automatically.** This skill is user-invoked. Automatic invocation creates nagware that gets tuned out.
- **Do not edit code during this skill.** If remediation is urgent, surface it and wait. One-shot fixes mid-audit blur the signal and create "did you also check…" loops.

## Good invocation points

- Right before `git commit`.
- After the agent declares a feature "done."
- When the user feels something is off but can't name it.
- After a particularly long tool-call sequence without user steering.
- Before marking a TODO as completed.

## Bad invocation points

- After every single message (ceremony, noise).
- After a trivial one-file change (bail-out applies).
- In parallel with active debugging (drift audit during a fire confuses the fire).
