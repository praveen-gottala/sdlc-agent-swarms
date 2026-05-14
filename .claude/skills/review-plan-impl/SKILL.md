---
name: review-plan-impl
description: Fresh-context review of a diff against an active execution plan phase. Spawns a reviewer subagent with deterministic pre-checks, 7-point rubric, and portable prompt audit trail. Use after implementing a plan phase to verify fidelity before committing.
context: inline
agent: main
---

# Review Plan Implementation

You are a plan-implementation reviewer. Your job is to compare what was actually built (the diff) against what the plan said to build (the phase specification), using a fresh-context subagent that has no memory of the implementation session.

This skill fills the gap between `/challenge-plan` (reviews the plan before execution) and `/mid-session-drift-check` (reviews process compliance mid-session). This skill reviews **implementation fidelity** — did we do what we said we would?

## When to use (and when to use something else)

```
/challenge-plan        → Before approving a plan (strategic gate)
/review-plan-impl      → After implementing a phase, before committing (fidelity gate)
/mid-session-drift-check → Before any commit, process compliance (process gate)
/verify-done           → Before declaring done on dashboard/renderer work (proof gate)
/review-prd-compliance → Before release, spec audit (compliance gate)
```

`/review-plan-impl` is the "did we do what we said we would?" gate.
The others are "did we do it correctly?" gates.

## Invocation

```
/review-plan-impl <plan-file> [--phase <phase-name>] [--diff-base <ref>]
```

- `<plan-file>` (required): path to the active plan, e.g. `docs/plans/active/chips-next-steps/m1-execution-plan.md`
- `--phase` (optional): named phase to scope review to (e.g. `Phase 1`, `Phase 4`). When omitted, reviews the whole plan against the diff.
- `--diff-base` (optional, default `HEAD`): git ref to diff against working tree. Supports `HEAD`, `origin/main`, branch names.

## Protocol

### Step 1: Read the plan and extract the phase

Read the plan file fully. If `--phase` is specified, extract the relevant phase section. If not, use the entire plan.

### Step 2: Extract expected file changes (tiered strategy)

Plans use inconsistent formats for listing file changes. Use a tiered extraction strategy and record which tier was used (this is reported in the output for confidence signaling):

**Tier 1: Structured table.** If the phase has a "Files modified" / "Files to create" / "Files to update" markdown table, parse it. This is the highest-confidence extraction.

**Tier 2: Inline path extraction.** If no table exists, extract file paths from the phase section text by matching:
- Backtick-quoted paths (`` `packages/core/src/types/foo.ts` ``)
- "File:" prefixed lines
- Paths matching `packages/*/src/**/*` patterns
- Bullet points starting with a file path

**Tier 3: LLM extraction.** If neither structured table nor inline paths are found, include the raw phase text in the subagent prompt and let the LLM identify expected file changes as part of rubric evaluation. Flag this as "low-confidence" in the report.

### Step 3: Gather deterministic pre-check facts

Before spawning the subagent, compute these facts deterministically:

1. **File match (Tier 1-2 only):**
   ```bash
   git diff --name-only <diff-base>
   ```
   Compare against extracted file list. Report:
   - Files in plan AND in diff (matches)
   - Files in plan NOT in diff (missing implementation)
   - Files in diff NOT in plan — classify each as:
     - `prerequisite` — blocking bug fix required to unblock planned work (not scope creep)
     - `cascading` — consequence of a planned type/interface change (not scope creep)
     - `opportunistic` — unrelated fix noticed during implementation (IS scope creep)

2. **Verification commands:** If the plan phase has a "Verification" section with commands (e.g., `nx run-many -t typecheck`, `nx test agents-ux`), execute deterministic ones and capture results.

3. **Dead code check:**
   ```bash
   npx tsc --noUnusedLocals --noEmit 2>&1 | head -50
   ```

4. **Git status:** Capture untracked files that may belong to a different phase or commit.

### Step 4: Write the portable prompt file

Assemble a self-contained prompt file at `artifacts/plan-impl-review/<timestamp>/prompt.md` using the template at `references/portable-prompt.md.tmpl`. This file contains:

- Plan excerpt (phase section or full plan)
- Git diff output
- Deterministic pre-check results (with extraction tier noted)
- The 7-point rubric from `references/rubric.md`
- The output contract

This file is written BEFORE spawning the subagent. It serves as:
- Audit trail of exactly what the reviewer saw
- Fallback for re-running in any other tool (paste into another Claude session, ChatGPT, etc.)
- Evidence that the review was fresh-context (prompt is self-contained)

### Step 5: Spawn the reviewer subagent

Spawn a `reviewer` subagent with the contents of `prompt.md` as the task prompt.

```javascript
Agent({
  description: "Review diff against <plan-name> <phase-name>",
  subagent_type: "reviewer",
  prompt: "<contents of artifacts/plan-impl-review/<ts>/prompt.md>"
})
```

The subagent runs with:
- Fresh context window (no conversation history from this session)
- Read-only tools only (Glob, Grep, Read)
- No ability to edit files

The `reviewer` subagent type uses the persona at `.claude/agents/reviewer.md`,
which is the plan-implementation reviewer (7-point rubric, no PRD-compliance bias).
PRD auditing is owned by `/review-prd-compliance` (which uses `Explore`, not `reviewer`).
The prompt content from `references/portable-prompt.md.tmpl` reinforces the rubric
and scope constraints.

### Step 6: Save and render the report

Save the subagent's output to `artifacts/plan-impl-review/<timestamp>/report.md`.

Render the report inline with:
- Path to `prompt.md` (for audit trail)
- Path to `report.md` (for the full verdict)
- Summary of findings
- Cross-skill trigger notes (see below)

### Step 7: Cross-skill trigger notes

Based on findings, suggest which skill to run next:

| Finding type | Suggested next skill |
|-------------|---------------------|
| Test gaps | `/verify-done` after fixing |
| Scope creep | `/mid-session-drift-check` for process compliance |
| Behavioral changes not in plan | `/write-adr` for deviation documentation |
| Test quality violations | Fix, then `/mid-session-drift-check` (checks #1, #2) |
| Dead code | Fix before committing |

## Output Contract

The skill always emits exactly two artifacts:

- `artifacts/plan-impl-review/<ts>/prompt.md` — the self-contained prompt the subagent ran on
- `artifacts/plan-impl-review/<ts>/report.md` — the reviewer's verdict

**Artifacts are local-only** (gitignored via `artifacts/` in `.gitignore`). They are
regenerable from plan + diff at any time and exist for immediate review, not long-term
archival. If you need to share a review, copy the relevant files out of `artifacts/`.

The report has this section structure:

```markdown
## Summary
One paragraph: what was reviewed, extraction tier used, overall assessment.

## Plan Compliance
Files expected vs. actual. Extraction tier noted for confidence.

## Behavioral Changes
Any public surface changes the plan didn't anticipate.

## Test Gaps
Tests the plan called for but aren't present.

## Test Quality
Unnecessary, tautological, or pattern-violating tests found.

## Scope Creep
Files modified but not in the plan. Untracked files for wrong phase.

## Dead Code
Unused imports, functions, or variables introduced by this diff.

## Straightforward Fixes
Parent agent can apply these directly.

## Follow-up Prompt for Claude Code
A fenced code block the user can paste into a fresh session.

## What's Solid
No changes needed — what the implementation got right.

## Next Steps
Cross-skill trigger notes (which skill to run next based on findings).
```

## Rubric Reference

The 7-point rubric lives in `references/rubric.md`. It covers:

1. Plan compliance (files expected vs. modified)
2. Behavioral-change claims (public surface verification)
3. Test gaps (plan-specified tests present?)
4. Scope creep (unplanned file modifications)
5. Dead code (unused helpers after refactor)
6. Fix classification (straightforward vs. needs broader context)
7. Test quality (unnecessary tests, tautologies, rejected patterns)

## Portable Prompt Pattern

The `prompt.md` audit trail is a deliberate design choice. This skill always writes a self-contained prompt file before spawning the subagent. This pattern:

- Creates an audit trail of what the reviewer saw
- Enables tool-agnostic re-runs (paste into any LLM tool)
- Provides fallback when subagent spawn fails

This pattern is novel among the project's skills and is recommended for adoption by other review skills (e.g., `/challenge-plan`).

## Future: Spine Reviewer Generalization

This skill validates two key patterns from the Spine Reviewer (vision Layer 9):

1. **Fresh-context review** — Reviewer does not inherit implementer's reasoning trace
2. **Deterministic-first** — Facts computed before LLM judgment

When the Spine Reviewer is built (M5-M6), shared components should be extracted:
- `ReviewPass` interface, `ReviewFinding` Zod schema, deterministic gate runner
- See `docs/vision.md` Layer 9 and `docs/architecture/spine-implementation.md` Stage 4
