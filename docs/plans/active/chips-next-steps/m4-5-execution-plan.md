# M4.5: Skill-Derived Spine Quality Gates — Execution Plan

## Status: NOT STARTED

## Related Documents

- **Parent:** [`execution-plan.md`](execution-plan.md) — milestone table, M4.5 sketch in §Deferred / Follow-Up Plans
- **M4 plan:** [`m4-execution-plan.md`](m4-execution-plan.md) — M4.5 sketch origin, pre-shipped assets
- **Vision Layer 9:** [`docs/vision.md`](../../../vision.md) — 4-pass Reviewer topology
- **Skills:** `.claude/skills/mid-session-drift-check/SKILL.md`, `.claude/skills/review-plan-impl/references/rubric.md`
- **Guide:** [`docs/guides/planning-docs.md`](../../../guides/planning-docs.md) — verification gate (canonical)

## Context

M4 shipped a working end-to-end spine (Clarifier → Architect → Design → Implement → Review). The Reviewer has 5 basic deterministic gates, the Implementer has 0 quality gates, and the Architect Critic has 15 gates. M4.5 extracts deterministic logic from Claude Code skills into these pipeline nodes — enriching gates without restructuring graphs.

**What prompted this:** The M4 plan explicitly deferred skill-derived gate enrichment as M4.5 to avoid scope creep. The Reviewer's 5 gates are thin compared to the 11 checks `/mid-session-drift-check` and 7-point rubric `/review-plan-impl` run manually. Meanwhile, the Implementer has zero post-code quality gates — issues only surface when they hit the Reviewer.

**Scope adjustment from M4 sketch:** Research showed `/review-prd-compliance` (30-40% extractable) and `/implement-feature` (10-20%) aren't worth pipeline nodes. Replaced with `/verify-done` (75-85% extractable) as Implementer post-code gates.

**Current topology:**
```
Reviewer (3 nodes):   deterministicGates(5) → llmReview → emitReviewResult
Implementer (4 nodes): loadTaskContext → [runDesignSpecialist] → generateCode → reportCompletion
Architect Critic:     validateContractBundle() — 15 gates
```

**Target topology:**
```
Reviewer (4 nodes):   deterministicGates(16) → llmReview → assumptionValidator → emitReviewResult
Implementer (5 nodes): loadTaskContext → [runDesignSpecialist] → generateCode → postCodeQualityGates → reportCompletion
Architect Critic:     validateContractBundle() — 17 gates
```

## Exit Criteria

M4.5 is COMPLETE when ALL of:

1. **Reviewer** has 4 nodes (was 3) — separate `assumptionValidator` satisfying vision Layer 9
2. **Reviewer** has 12+ deterministic gates (was 5) from drift-check + rubric extraction
3. **Implementer** has 5 nodes (was 4) — `postCodeQualityGates` with 5 checks from `/verify-done`
4. **Architect Critic** has 17 gates (was 15) from `/challenge-plan` extraction
5. **Zero false positives** on existing eval scenarios (greenfield + brownfield)
6. `nx run-many -t typecheck`, `test`, `lint` — zero failures
7. Parent `execution-plan.md` updated with M4.5 COMPLETE status

## Out of Scope

- Full skill rewrite (skills keep working as Claude Code commands)
- Interactive features (visual verification, trade-off resolution)
- `/create-plan` extraction (too interactive)
- `/verify-done` visual Chrome DevTools checks (not automatable in pipeline)
- `/review-prd-compliance` as standalone node (30-40% extractable — stays LLM-driven)
- `/implement-feature` spec-lock (10-20% extractable — not worth it)

## Key Files

| File | Action |
|------|--------|
| `packages/agents-reviewer/src/graph/state.ts` | Add `assumptionValidationResults` channel |
| `packages/agents-reviewer/src/graph/reviewer-graph.ts` | Rewire to 4-node topology |
| `packages/agents-reviewer/src/graph/nodes/llm-review.ts` | Trim assumption logic |
| `packages/agents-reviewer/src/graph/nodes/assumption-validator.ts` | **Create** |
| `packages/agents-reviewer/src/graph/nodes/gates/` | **Create** directory with modular gate files |
| `packages/agents-reviewer/src/graph/nodes/deterministic-gates.ts` | Refactor to compose modular gates |
| `packages/agents-implementer/src/graph/state.ts` | Add `postCodeGateResults` channel |
| `packages/agents-implementer/src/graph/implementer-graph.ts` | Insert `postCodeQualityGates` node |
| `packages/agents-implementer/src/graph/nodes/post-code-quality-gates.ts` | **Create** |
| `packages/core/src/architect/critic.ts` | Add 2 new gates to `validateContractBundle()` |
| `packages/agents-architect/src/graph/retry-routing.ts` | Add routing for new gates |

## Patterns to Reuse

| Pattern | Location | Usage in M4.5 |
|---------|----------|---------------|
| `GateResult` type | `packages/agents-reviewer/src/types.ts` | Template for new gate results |
| `createDeterministicGates` | `packages/agents-reviewer/src/graph/nodes/deterministic-gates.ts` | Refactor into modular composition |
| `LLMReviewResponseSchema` | `packages/agents-reviewer/src/graph/nodes/llm-review.ts` | Trim assumption fields |
| `validateContractBundle` | `packages/core/src/architect/critic.ts` | Add 2 new gates |
| `GATE_RETRY_TARGETS` | `packages/agents-architect/src/graph/retry-routing.ts` | Add 2 new entries |
| `ReviewerDeps` | `packages/agents-reviewer/src/deps.ts` | Extend with optional plan path |
| `ImplementerStateType` | `packages/agents-implementer/src/graph/state.ts` | Add gate channels |

---

## Phase 1: Assumption Validator Node Split

**Goal:** Split collapsed passes 3+4 out of `llmReview` into a dedicated `assumptionValidator` node → vision Layer 9 4-pass compliance.

**Why first:** Highest architectural value. Aligns graph topology with vision. Independent of other phases.

### Tasks

- [ ] **1A.** Add `AssumptionValidationResult` type to `packages/agents-reviewer/src/types.ts` — `{ assumptionId, violated, evidence, severity: 'blocking' | 'warning' }`.
- [ ] **1B.** Add `assumptionValidationResults` channel to `packages/agents-reviewer/src/graph/state.ts` (last-write-wins, defaults to `[]`).
- [ ] **1C.** Create `packages/agents-reviewer/src/graph/nodes/assumption-validator.ts`:
  - Deterministic pass: for each ledger entry, scan diff file contents for direct contradictions (resolved assumption value vs diff content).
  - LLM pass: for unresolved/ambiguous assumptions, focused LLM call with only assumption entries + relevant diff hunks (cheaper than current full-review approach).
  - Writes to `assumptionValidationResults` channel.
- [ ] **1D.** Trim assumption logic from `llm-review.ts` — remove ledger section from prompt (lines 84-95), remove "validate against assumption ledger" instruction (lines 109-110), remove `assumptionViolations` from `LLMReviewResponseSchema`.
- [ ] **1E.** Update `emit-review-result.ts` — read `state.assumptionValidationResults`, merge violations into `reviewResult.assumptionViolations`. If any violation is `severity: 'blocking'`, override outcome to `'rejected'`.
- [ ] **1F.** Rewire `reviewer-graph.ts`: `deterministicGates → llmReview → assumptionValidator → emitReviewResult → END`.
- [ ] **1G.** Tests: `assumption-validator.test.ts` (deterministic contradiction + empty ledger + mock LLM path), update `llm-review.test.ts` and `emit-review-result.test.ts`.
- [ ] **1H.** Update barrel exports in `packages/agents-reviewer/src/index.ts`.

### Phase 1 Gate (run in order; each writes a receipt)

- [ ] `nx test agents-reviewer` — all tests pass
- [ ] `nx run-many -t typecheck` — zero errors
- [ ] Reviewer graph node count: 4 (was 3)
- [ ] `/review-plan-impl docs/plans/active/chips-next-steps/m4-5-execution-plan.md --phase 1`
- [ ] `/mid-session-drift-check`
- [ ] All gate findings resolved before checking Phase 1 complete

---

## Phase 2: Enriched Reviewer Deterministic Gates

**Goal:** Raise gate count from 5 to 12+ by extracting deterministic checks from `/mid-session-drift-check` and `/review-plan-impl` rubric.

### Tasks

- [ ] **2A.** Create `packages/agents-reviewer/src/graph/nodes/gates/` directory with modular structure:
  - `index.ts` — barrel exporting all gate runners
  - `m4-gates.ts` — move existing 5 gates from `deterministic-gates.ts` body
  - `drift-check-gates.ts` — new
  - `rubric-gates.ts` — new
- [ ] **2B.** Implement drift-check gates in `drift-check-gates.ts` (from `/mid-session-drift-check`):
  1. `mocks-in-prod` — scan diff for `jest.fn()`, `vi.fn()`, `mock(` in non-test files. **Blocking.**
  2. `test-coverage-gap` — new `.ts` file without `.test.ts` companion. Non-blocking warning.
  3. `skipped-tests` — `.skip(`, `xit(`, `xdescribe(` in diff. **Blocking.**
  4. `commented-out-code` — added lines with `//` + TS keywords (`import`, `export`, `function`, `const`). Non-blocking.
  5. `any-type-usage` — `: any`, `as any` in non-test files. Non-blocking.
  6. `console-log-in-prod` — `console.log(` in non-test, non-script files. Non-blocking.
  7. `scope-creep-vs-taskplan` — diff files not in `contractBundle.taskPlan.tasks[].filePaths`. Non-blocking.
  8. `superseded-pattern` — imports or patterns from known-superseded modules. Non-blocking.
- [ ] **2C.** Implement rubric gates in `rubric-gates.ts` (from `/review-plan-impl`):
  1. `plan-file-coverage` (rubric point 1) — files in plan phase not in diff. Non-blocking (plan may not be available).
  2. `scope-creep-classification` (rubric point 4) — classify unplanned files as prerequisite/cascading/opportunistic. Non-blocking.
  3. `dead-code-hint` (rubric point 5) — heuristic: unused imports in diff hunks. Non-blocking.
- [ ] **2D.** Refactor `deterministic-gates.ts` to compose gates from `gates/` directory. Same node signature, internally calls modular runners.
- [ ] **2E.** Add optional `planFilePath?: string` to `ReviewerDeps` if rubric gates need plan access.
- [ ] **2F.** Tests: `drift-check-gates.test.ts` and `rubric-gates.test.ts` with fixture diffs per gate.

### Phase 2 Gate (run in order; each writes a receipt)

- [ ] All existing deterministic gate tests pass (no regression)
- [ ] New gate tests pass independently
- [ ] `nx test agents-reviewer` and `nx run-many -t typecheck` pass
- [ ] Gate count: 12+ (was 5)
- [ ] `/review-plan-impl docs/plans/active/chips-next-steps/m4-5-execution-plan.md --phase 2`
- [ ] `/mid-session-drift-check`
- [ ] All gate findings resolved before checking Phase 2 complete

---

## Phase 3: Implementer Post-Code Quality Gates

**Goal:** Add `postCodeQualityGates` node to Implementer graph with 5 checks extracted from `/verify-done`.

**Why in Implementer, not Reviewer:** Catches issues before the diff crosses the agent boundary. Reduces unnecessary Reviewer invocations and wasted LLM cost.

### Tasks

- [ ] **3A.** Add `PostCodeGateResult` type to `packages/agents-implementer/src/types.ts` — `{ name, passed, detail, blocking }`.
- [ ] **3B.** Add `postCodeGateResults` and `postCodeGatesPassed` channels to `packages/agents-implementer/src/graph/state.ts`.
- [ ] **3C.** Create `packages/agents-implementer/src/graph/nodes/post-code-quality-gates.ts`:
  1. `test-triad-status` — verify tool-loop ran typecheck/tests/lint and last invocation passed. Blocking.
  2. `no-empty-artifacts` — every artifact has non-empty content. Blocking.
  3. `struggle-detection` — 3+ consecutive failed tool calls of same type = warning; 5+ total errors = warning. Non-blocking.
  4. `file-count-sanity` — 0 artifacts = blocking; 20+ for single task = non-blocking warning.
  5. `deviation-count` — 3+ deviations = warning; 5+ = blocking.
- [ ] **3D.** Wire into `implementer-graph.ts`: `generateCode → postCodeQualityGates → reportCompletion`.
- [ ] **3E.** Enrich `report-completion.ts` — include gate results in `TaskCompletionReport.deviationsFromContract`.
- [ ] **3F.** Tests: `post-code-quality-gates.test.ts`, update `report-completion.test.ts`.
- [ ] **3G.** Update barrel exports.

### Phase 3 Gate (run in order; each writes a receipt)

- [ ] All existing Implementer tests pass
- [ ] New gate tests pass
- [ ] `nx test agents-implementer` and `nx run-many -t typecheck` pass
- [ ] Implementer graph node count: 5 (was 4)
- [ ] `/review-plan-impl docs/plans/active/chips-next-steps/m4-5-execution-plan.md --phase 3`
- [ ] `/mid-session-drift-check`
- [ ] All gate findings resolved before checking Phase 3 complete

---

## Phase 4: Architect Critic Enrichment

**Goal:** Add 2 gates to `validateContractBundle()` from `/challenge-plan` deterministic checks. Gate count: 15 → 17.

### Tasks

- [ ] **4A.** Add 2 gate functions in `packages/core/src/architect/critic.ts`:
  1. `adr-conflict-detection` — decisions referencing superseded ADRs. Retry target: `architectureWriter`.
  2. `task-dependency-completeness` — task B depends on A but A's `filePaths` don't overlap with B's `contextRefs`. Retry target: `taskPlanner`.
- [ ] **4B.** Add retry routing entries in `packages/agents-architect/src/graph/retry-routing.ts`.
- [ ] **4C.** Tests in `packages/core/src/architect/critic.test.ts` and `packages/agents-architect/src/graph/retry-routing.test.ts`.

### Phase 4 Gate (run in order; each writes a receipt)

- [ ] All existing Critic tests pass
- [ ] New gate tests pass
- [ ] `nx test core` and `nx test agents-architect` pass
- [ ] `nx run-many -t typecheck` pass
- [ ] Critic gate count: 17 (was 15)
- [ ] `/review-plan-impl docs/plans/active/chips-next-steps/m4-5-execution-plan.md --phase 4`
- [ ] `/mid-session-drift-check`
- [ ] All gate findings resolved before checking Phase 4 complete

---

## Phase 5: Eval + Regression Guard

**Goal:** Validate zero false positives on existing eval scenarios. Document gate catalog.

### Tasks

- [ ] **5A.** Run spine eval (`spine-cashpulse-greenfield`, `spine-cashpulse-brownfield`) with enriched gates. Document results in `packages/eval/results/m4-5/`.
- [ ] **5B.** Create gate regression fixtures in `packages/agents-reviewer/src/graph/nodes/gates/__fixtures__/` — one fixture diff per gate (e.g., diff with `jest.fn()` in prod should fail `mocks-in-prod`).
- [ ] **5C.** Run architect eval with 2 new Critic gates — verify no false positives.
- [ ] **5D.** If any false positive found: fix gate logic, add regression test, re-run.
- [ ] **5E.** Document full gate catalogs in JSDoc: Reviewer (16 gates), Implementer (5 gates), Critic (17 gates).
- [ ] **5F.** Update parent `execution-plan.md` and `CLAUDE.md` with M4.5 status.

### Phase 5 Gate (run in order; each writes a receipt)

- [ ] `nx run-many -t typecheck`, `test`, `lint` — zero failures
- [ ] Spine eval: 0 false positives from new gates
- [ ] Architect eval: 0 false positives from new Critic gates
- [ ] `/verify-done`
- [ ] `git commit`
- [ ] `/prepare-handoff` (if continuing in new session)

---

## End-of-Plan Gate

- [ ] `/verify-done` — test triad + `/verify-docs` task-scoped
- [ ] `git commit` — only after `/verify-done` passes
- [ ] `/prepare-handoff` — only if work continues in a new session

---

## Design Decisions

1. **Modular gate directory** (`gates/` with per-source files) — keeps individual gates focused and traceable to their source skill.
2. **Non-blocking default** — all new gates start non-blocking (warnings) except `mocks-in-prod` and `skipped-tests` (clear violations). Promoted to blocking after Phase 5 eval confirms zero false positives.
3. **Assumption validator as separate LLM call** — focused prompt with only assumption entries + relevant hunks. Slightly more expensive but better accuracy than embedding in the full review prompt.
4. **Post-code gates in Implementer** — catches issues at source, before diff crosses to Reviewer. Reduces unnecessary review iterations.
5. **Critic gates in `core`** — follows existing pattern where `validateContractBundle()` lives in `packages/core/src/architect/critic.ts`.

## STOP Conditions

- Assumption validator LLM call consistently fails to produce valid schema output → STOP, simplify to deterministic-only.
- Gate false positive rate > 10% on existing eval fixtures → STOP, fix gate logic before proceeding.
- New gates cause existing Reviewer/Implementer tests to fail → STOP, investigate compatibility before adding more gates.

## Anti-Shortcut (process)

- Each phase gate is a checkbox **inside** the phase. A skipped gate is an unchecked box visible next session.
- Each gate lists its expected receipt path. Missing receipt = gap surfaced by `/mid-session-drift-check`.
- `/review-plan-impl` spawns fresh-context subagent — implementing agent cannot coach it.
- Skipping a gate without explicit user waiver is a process violation.

## Verification (plan-level)

1. This file exists at `docs/plans/active/chips-next-steps/m4-5-execution-plan.md`.
2. Every phase has gate block per `docs/guides/planning-docs.md`.
3. M4 sketch scope items are tracked (dropped items documented in Out of Scope).
4. No new packages created — all work in existing `agents-reviewer`, `agents-implementer`, `agents-architect`, `core`.
5. Data-flow claims trace to files verified in exploration.
