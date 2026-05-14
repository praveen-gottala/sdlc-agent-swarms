# Plan-Implementation Review Rubric

7-point rubric for reviewing a diff against an execution plan phase.
Each point produces findings classified as: straightforward fix (parent agent
does it) or needs-broader-context (emit a follow-up prompt for Claude Code).

---

## 1. Plan Compliance

**Question:** For each file the plan says to modify/create, was it actually changed?

- Parse the plan's expected file list (extraction tier determines confidence).
- Cross-reference against `git diff --name-only`.
- Report: matches, files in plan but not in diff (missing), files in diff but not in plan (see rubric #4).

**Canonical case study:** M1 Phase 1+4 review — CashPulse fixture was called for in the plan but absent from the diff.

**Extraction tier affects confidence:**
- Tier 1 (structured table): high confidence, deterministic match
- Tier 2 (inline paths): medium confidence, may miss indirect references
- Tier 3 (LLM extraction): low confidence, flag as "best-effort"

## 2. Behavioral-Change Claims

**Question:** When the plan says "no behavioral changes," is the public surface actually unchanged?

- Diff the public API surface: exported functions, CLI options, type signatures, API routes.
- Look for: removed options, changed defaults, renamed exports, altered error messages.

**Canonical case study:** M1 Phase 1+4 — plan said "no behavioral changes" but the refactor lost the `--width` CLI option (dead code after extraction) and replaced a rich `description` string with a terse one.

**What to check:**
- Exported symbols before/after (grep `export`)
- CLI option definitions (Commander.js `.option()` calls)
- API route handlers (method + path + response shape)
- Type interface field changes in `packages/core/src/types/`

## 3. Test Gaps

**Question:** Does the plan call for specific tests — are they actually present?

- Match plan's test requirements ("parity test," "fixture-based test," "exact-equality assertion") against test files in the diff.
- Flag tests that exist but use weaker assertions than the plan specified (e.g., `.toContain()` instead of `.toEqual()`).
- Flag test files the plan mentions that don't appear in the diff.

**Canonical case study:** M1 Phase 1+4 — plan called for "exact parity" tests but implementation used `.toContain()` checks that would pass even with missing fields.

## 4. Scope Creep

**Question:** Are there files in the diff that the plan didn't call for?

For each unplanned file, classify WHY it was touched:

- **`prerequisite`** — A blocking bug fix required to unblock planned work. Example: you need to modify `pipeline-input-builder.ts` (in plan), but `readYaml()` in core has a bug that prevents it from working. Fixing core is NOT scope creep — it's an unplanned prerequisite. Document as "prerequisite fix: [bug] blocked [planned file]."
- **`cascading`** — A consequence of a planned change that broke an unplanned file. Example: you change a type in `types.ts` (in plan), and now `run-pages.ts` (not in plan) fails to compile. NOT scope creep — it's a necessary cascade. Document as "cascading from [planned file change]."
- **`opportunistic`** — An unrelated fix noticed during implementation but not blocking planned work. Example: you spot a typo in `design-evaluator.ts` while working on pipeline input. This IS scope creep — should be deferred to a separate commit.

Also flag:
- Untracked files (`git status`) that belong in a different phase or commit.
- Changes to shared infrastructure (package.json, tsconfig, nx.json) not mentioned in the plan — classify as prerequisite, cascading, or opportunistic.

**Overlap note:** `/mid-session-drift-check` also flags scope creep (check #5), but without plan awareness — it says "not necessarily a violation, but surface it." This check is plan-specific: it knows exactly which files SHOULD have been modified and classifies each unplanned file by reason.

## 5. Dead Code

**Question:** Did the refactor leave behind unused helpers?

- Functions, variables, imports, or type aliases that became unused after the change.
- Especially common after extract-and-move refactors where the original call site was updated but the helper wasn't deleted.
- Check: `npx tsc --noUnusedLocals --noEmit` results included in deterministic pre-checks.

## 6. Fix Classification

**Question:** For each finding, can the parent agent fix it in place, or does it need a fresh implementer session?

- **Straightforward fix:** Single-file change, no architectural judgment needed, no test changes required. Example: delete unused import, add missing export.
- **Needs broader context:** Multi-file change, requires understanding of callers/consumers, needs new tests, or involves an architectural decision. Example: restore lost CLI option with proper wiring.

Always err toward "needs broader context" when unsure. A straightforward fix that breaks something is worse than a follow-up prompt that's overly cautious.

## 7. Test Quality

**Question:** Are new tests meaningful, or are they padding?

Aligned with CLAUDE.md Test Quality Gates. Evaluate every new or modified test file in the diff:

### What to flag

1. **Tautological tests** — Tests that assert against their own mocks. Example: configuring a mock to return `{ foo: 'bar' }` then asserting `result.foo === 'bar'`. The test can never fail for a real reason.

2. **Duplicate assertion sites** — Same behavior tested in multiple test files. If `pipeline.test.ts` already asserts that `createPipelineContext()` returns a valid context, a new `pipeline-context.test.ts` asserting the same thing is redundant.

3. **Mock-heavy tests without scope justification** — Tests mocking 3+ dependencies without a top-of-file scope-header comment. Per CLAUDE.md: "prefer one integration test against a tmp dir over six mock-heavy units."

4. **Tests for impossible scenarios** — Error handling tests for conditions that can't occur given the function's callers and type system. Per CLAUDE.md: "Don't add error handling, fallbacks, or validation for scenarios that can't happen."

5. **Rejected mock patterns** — `as unknown as jest.Mock` casts. Per project convention: use flag-based mocks, not cast-based mocks. See `packages/dashboard/src/app/api/_lib/__tests__/checkpointer.test.ts` for the approved pattern.

Known coverage gap: TQG #3 (mock-asserting-mock) was not exercised in the M1 Phase 1 dogfood because the violating file (`pipeline-input-parity.test.ts`) was deleted before the run. The rubric language matches CLAUDE.md Test Quality Gates #3 verbatim, so future runs will catch it.

### Classification

- **Necessary** — Tests real behavior; has at least one assertion that would fail if production code broke.
- **Padding** — Tautological, duplicate, or tests impossible scenarios. Recommend deletion.
- **Needs refactoring** — Useful test but uses rejected patterns. Recommend fixing the pattern, keeping the test.

---

## Future: Spine Reviewer Generalization

This rubric is plan-specific — it reviews implementation fidelity against a development plan. The Spine Reviewer (vision Layer 9) uses a four-pass architecture for a different purpose (code quality against architectural intent):

1. Deterministic gates (typecheck, lint, tests, security scan)
2. LLM reviewer (failure-mode checklist against ArchitectureSpec)
3. Assumption validator (diff vs AssumptionLedger)
4. Triage (blocking / suggestion / false-positive)

**Shared patterns validated by this skill:**
- Fresh-context review (reviewer does not inherit implementer's reasoning)
- Deterministic-first (facts computed before LLM judgment)
- Finding classification (actionable categories with evidence)
- Diff-scoped review (not whole-codebase)

**When the Spine Reviewer is built (M5-M6), extract shared components:**
- `ReviewPass` interface: `(diff, referenceDoc, rubric) → Finding[]`
- `ReviewFinding` Zod schema (severity, category, evidence, file location, suggested fix)
- Deterministic gate runner (typecheck/lint/test → structured findings)
- See `docs/vision.md` Layer 9 and `docs/architecture/spine-implementation.md` Stage 4
