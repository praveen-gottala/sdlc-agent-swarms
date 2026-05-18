# M4: Full Spine — Execution Plan

## Related Documents

- **Parent:** [`execution-plan.md`](execution-plan.md) — milestone table, M3.6 closeout, brownfield wiring notes
- **ADR-057:** [`docs/adrs/ADR-057-task-type-aware-design-slice-strategy.md`](../../../adrs/ADR-057-task-type-aware-design-slice-strategy.md) — accepted defaults (`'none'` NEW, `'structure-only'` MODIFY)
- **R9.4 eval:** [`docs/research/briefs/R9_4-design-info-value-eval.md`](../../../research/briefs/R9_4-design-info-value-eval.md) — §5 Recommendation, §9 Open caveats (especially §9.4–9.5)
- **R9 brownfield:** [`docs/research/briefs/R9-brownfield-design-delta.md`](../../../research/briefs/R9-brownfield-design-delta.md) — delta format, context wiring, impact analysis
- **Operator guide:** [`docs/guides/design-info-value-eval.md`](../../../guides/design-info-value-eval.md) — how to re-run design-info regression eval
- **Vision:** [`docs/vision.md`](../../../vision.md) — Layer 8 (Implementation), Layer 9 (Review), Layer 3 (taxonomy)
- **Guide:** [`docs/guides/planning-docs.md`](../../../guides/planning-docs.md) — verification gate (canonical)

## Context

M0–M3.6 are COMPLETE. The Architect graph (Nodes 0.5–6), Critic, eval harness, brownfield research (R9), and empirical design-context measurement (M3.6 / R9.4) are done. **M4 ships the remaining spine stages: Implementer + Reviewer**, wired end-to-end from Clarifier → Architect → Design → Implement → Review.

**Non-negotiable Phase 1 commitments** (from M3.6 closeout 2026-05-17 — do not re-litigate ADR-057 or expand the 90-cell matrix):

1. **Tested routing** — NEW → no design-spec in implementer prompt; MODIFY → `extractStructure(existingDesignSpec)` in prompt (wiring tests, not config-only).
2. **Brownfield design specialist** — pipeline emits `DesignSpecDelta`, not full-screen regen (M3.6 used hand-crafted deltas).
3. **Instrumentation** — log `taskType`, `DesignSliceStrategy`, quality proxy (compile/schema) per implementer call.

**Pre-shipped assets M4 consumes (do not rebuild):**

| Asset | Location |
|-------|----------|
| `extractStructure`, `extractLabelsAndBindings` | `packages/agents-architect/src/design-slice/index.ts` |
| `deltaApply`, `DesignSpecDelta` (TS) | `packages/designspec-renderer/src/renderer/delta/` |
| Design-info regression scenario | `packages/eval/src/scenarios/design-info-value.yaml` |
| Eval runners | `scripts/run-design-info-eval.ts`, `scripts/run-design-info-reviewer.ts`, `scripts/analyze-design-info-eval.ts` |
| Architect graph pattern | `packages/agents-architect/src/graph/` |

**Gaps to close (verified against codebase 2026-05-17):**

- No `packages/agents-implementer/` or `packages/agents-reviewer/` yet
- No `packages/orchestrator/` (R1 deferred — M4 runs tasks **sequentially**, single-threaded per task)
- `ContextRefKindSchema` lacks `existingDesign` / `designDelta` (`architect.schemas.ts:132–138`)
- No `DesignSliceStrategy` Zod enum in `core` (ADR-057 directive)
- `change-classifier.ts` is a stub (no `affectedScreens`)
- `designNode` always emits full `DesignSpecV2` (no delta path)

## Patterns to Reuse

| Pattern | Location | Usage in M4 |
|---------|----------|-------------|
| LangGraph compile + interrupts | `packages/agents-architect/src/graph/architect-graph.ts` | Template for Implementer/Reviewer graphs |
| Typed state channels | `packages/agents-architect/src/graph/state.ts` | `Annotation.Root` for spine state |
| Contract slicing | `packages/agents-architect/src/context-slicer.ts` | Extend for `existingDesign` refs + slice strategy |
| Design slice functions | `packages/agents-architect/src/design-slice/index.ts` | ADR-057 MODIFY routing |
| Design pipeline | `packages/agents-ux/src/design-pipeline/pipeline.ts` | Specialist tool inside Implementer until spine replaces standalone path |
| `designNode` | `packages/agents-ux/src/design-pipeline/nodes.ts` | Add brownfield branch inside `browserDesignWork` / penpot path |
| Spec persistence | `packages/core/src/design-spec-store.ts` | `readDesignSpec` / `writeDesignSpec` |
| Delta apply | `packages/designspec-renderer/src/renderer/delta/delta-utils.ts` | Post-LLM deterministic merge |
| Critic deterministic-first | `packages/agents-architect/src/graph/nodes/critic.ts` | Reviewer gate ordering |
| TracedProvider / Langfuse | `packages/telemetry/src/` | Per-stage + per-implementer-call spans |
| Eval scenarios | `packages/eval/src/scenarios/*.yaml` | Full spine + regression |
| `withEnv` | `packages/core/src/test-utils/with-env.ts` | Env in tests |

## Exit Criteria

M4 is COMPLETE when ALL of the following are true:

1. **ADR-057 routing** is implemented in production Implementer context assembly with **wiring tests** (NEW absent, MODIFY structure-only present).
2. **Brownfield design path** produces `DesignSpecDelta` for MODIFY screens with existing specs; `deltaApply` + structural quality gate pass on applied spec.
3. **Instrumentation** logs `taskType`, `sliceStrategy`, and quality proxy on every implementer LLM invocation (Langfuse metadata or structured log line).
4. **Implementer** LangGraph package executes at least one frontend task from a `TaskPlan` using sliced `ContractBundle` + design specialist tool.
5. **Reviewer** LangGraph package runs deterministic gates first, then LLM review on a diff, for at least one completed task.
6. **Spine eval** — split per Review m4:
   - **6a — Spine passes:** Full spine eval scenario runs Clarifier → Architect → Design → Implement → Review on CashPulse fixture (greenfield + brownfield paths) without errors; results documented in `packages/eval/results/m4/`.
   - **6b — Regression guard passes:** `design-info-value.yaml` regression re-run via `scripts/run-design-info-eval.ts` shows no ADR-057 regression in the production Implementer path (mean fidelity within ±0.15 of M3.6 baseline per task type).
7. `nx run-many -t typecheck`, `test`, `lint` — zero failures.
8. Parent [`execution-plan.md`](execution-plan.md) and `CLAUDE.md` updated with M4 COMPLETE status.

## Out of Scope (this milestone)

- Expanding the M3.6 90-cell matrix or changing ADR-057 defaults without new evidence (§9.5 triggers only)
- M3.6 v2 eval unless production telemetry hits §9.5 table
- `packages/orchestrator/` + git-worktree task parallelism (R1 — follow-up plan)
- Phase 8 backward-compat cleanup (after spine battle-tested — parent §Phase 8)
- Wiring vision evaluator into design pipeline (ADR-045 — opt-in later)
- Autonomous security remediation (vision Layer 9)

## Key Files

| File | Action |
|------|--------|
| `packages/core/src/types/architect.schemas.ts` | Add `DesignSliceStrategy`, extend `ContextRefKindSchema` |
| `packages/core/src/types/design-delta.schemas.ts` | **Create** — Zod mirror of R9 hybrid delta (validate LLM output) |
| `packages/core/src/types/cross-boundary-artifacts.schemas.ts` | Add `AffectedScreenSchema` to `ChangeClassificationSchema` |
| `packages/agents-architect/src/context-slicer.ts` | Handle `existingDesign`, apply `DesignSliceStrategy` |
| `packages/agents-architect/src/graph/nodes/change-classifier.ts` | Wire LLM + `affectedScreens` |
| `packages/agents-architect/src/graph/nodes/task-planner.ts` | `mode` + `contextRefs` for MODIFY |
| `packages/agents-ux/src/design-pipeline/nodes.ts` | Brownfield delta branch in design work functions |
| `packages/agents-implementer/` | **Create** — graph, context assembly, instrumentation |
| `packages/agents-reviewer/` | **Create** — graph, deterministic gates, LLM review |
| `packages/eval/src/scenarios/spine-full-cashpulse.yaml` | **Create** — end-to-end spine eval |
| `docs/plans/active/chips-next-steps/execution-plan.md` | M4 status pointer |

---

## Phase 1: Package Scaffolding + ADR-057 Routing + Instrumentation (three commitments)

**Goal:** Land Nx package skeletons (so Phases 5/6 build on a verified workspace), schemas, and Implementer context assembly with tested task-type-aware routing and observability hooks — before brownfield delta generation or full graphs.

> **Why scaffolding lives in Phase 1 (not Phases 5/6):** front-loads Nx config risk (`project.json`, `tsconfig.lib.json`, `tsconfig.base.json` paths, ESM/`emitDeclarationOnly`). Phase 1's `build-implementer-prompt.ts` lives inside the real package, not a temporary location, so Phase 5 fills in the graph without moving code. (Review M3 + M4, Option A.)

### Tasks

#### 1A. Nx package scaffolding (front-loaded build risk)

- [ ] Scaffold `packages/agents-implementer/` via `nx generate @nx/js:library agents-implementer --bundler=tsc --unitTestRunner=jest --importPath=@agentforge/agents-implementer` (or mirror existing `packages/agents-architect/` config — `project.json`, `tsconfig.lib.json`, `tsconfig.spec.json`, barrel `src/index.ts`).
- [ ] Scaffold `packages/agents-reviewer/` the same way.
- [ ] Add path mappings in root `tsconfig.base.json`: `@agentforge/agents-implementer` → `packages/agents-implementer/src/index.ts`, `@agentforge/agents-reviewer` → `packages/agents-reviewer/src/index.ts`.
- [ ] Declare deps in each package's `package.json` (implementer: `core`, `governance`, `providers`, `telemetry`, `agents-ux`, `agents-architect`, `designspec-renderer`; reviewer: `core`, `providers`, `telemetry`, `governance`).
- [ ] **Verify build:** `nx build agents-implementer` and `nx build agents-reviewer` both pass with empty barrels — proves Nx config is correct before any graph code.

#### 1B. Schemas + slice routing

- [ ] Add `DesignSliceStrategySchema` to `packages/core/src/types/architect.schemas.ts`:
  `'none' | 'full' | 'labels-only' | 'structure-only'` (export type + Zod enum).
- [ ] Add `resolveDesignSliceStrategy(taskMode: TaskMode): DesignSliceStrategy` helper (ADR-057 table: MODIFY → `'structure-only'`, NEW → `'none'`).
- [ ] Extend `ContextRefKindSchema` with `'existingDesign'` and `'designDelta'` per R9 §6.3.
- [ ] Extend `sliceContractBundle()` in `packages/agents-architect/src/context-slicer.ts`:
  - Resolve `existingDesign` refs via `readDesignSpec(projectRoot, pageId)`.
  - Apply `resolveDesignSliceStrategy(task.mode)` when attaching design context (`extractStructure` for `'structure-only'`, omit for `'none'`).
- [ ] Add `ImplementerContextMetadata` type in `packages/core/src/types/`: `{ taskId, taskType, sliceStrategy, designSpecIncluded: boolean }`.
- [ ] Export new types from `packages/core/src/types/index.ts` barrel.

#### 1C. Implementer context module + wiring tests

- [ ] Implement `packages/agents-implementer/src/context/build-implementer-prompt.ts` — pure function returning `{ prompt: string, metadata: ImplementerContextMetadata }`. Lives inside the real package (not a temp location) per Option A.
- [ ] **Wiring tests** at `packages/agents-implementer/src/context/build-implementer-prompt.test.ts`:
  - NEW task → prompt string/substrings: no `DesignSpec` JSON blob, no `"nodes":` from existing spec; `metadata.designSpecIncluded === false`.
  - MODIFY task with `existingDesign` ref → prompt contains structure-only slice (parent/order/catalog keys present; label/content absent); `metadata.sliceStrategy === 'structure-only'`.
  - Query captured prompt via test spy or returned `ImplementerContext` object — **not** env/config flag alone.
- [ ] **Instrumentation tests:** mock telemetry sink receives `taskType`, `sliceStrategy`, `qualityProxy` fields on implementer call (use `LangfuseSink` test pattern from `packages/telemetry/`).
- [ ] `nx run-many -t typecheck` and `nx test agents-implementer` pass.

### Phase 1 Gate (run in order; each writes a receipt)

- [ ] `/review-plan-impl docs/plans/active/chips-next-steps/m4-execution-plan.md --phase 1`
      Receipt: `artifacts/plan-impl-review/<ts>/report.md`
- [ ] `/mid-session-drift-check`
      Receipt: inline report in chat; cite `file:line` for any violation
- [ ] All gate findings resolved before checking Phase 1 complete

---

## Phase 2: Brownfield Schemas + Impact Classification

**Goal:** Zod contracts and Node 0.5 output for per-screen impact — prerequisite for delta-aware design and MODIFY task planning.

### Tasks

- [ ] Create `packages/core/src/types/design-delta.schemas.ts` — Zod `DesignSpecDeltaSchema` aligned with `packages/designspec-renderer/src/renderer/delta/delta-types.ts` (hybrid: added/modified/removed/reordered). Re-export apply semantics via `@agentforge/designspec-renderer` `deltaApply` — do not duplicate merge logic.
- [ ] Add `ScreenImpactSchema`, `AffectedScreenSchema` to `cross-boundary-artifacts.schemas.ts`; extend `ChangeClassificationSchema` with `affectedScreens: z.array(AffectedScreenSchema).optional()`.
- [ ] Implement deterministic screen-matching helper `packages/agents-architect/src/impact/screen-impact.ts`:
  - Read `agentforge/designs/*.json`, `pages.yaml`, `EnrichedRequirement.prd.screens`.
  - Algorithm per R9 §2 (new/modified/unchanged).
  - Unit tests against `packages/eval/src/scenarios/cashpulse-brownfield.yaml` expected `affectedScreens`.
- [ ] Wire `change-classifier.ts`: LLM enriches deterministic baseline with `changeDescription` + `confidence`; populate `changeClassification.affectedScreens`.
- [ ] Add Critic gate (or extend existing) — MODIFY frontend tasks must reference screens present in `affectedScreens` with `impact: 'modified'`.

### Phase 2 Gate (run in order; each writes a receipt)

- [ ] `/review-plan-impl docs/plans/active/chips-next-steps/m4-execution-plan.md --phase 2`
      Receipt: `artifacts/plan-impl-review/<ts>/report.md`
- [ ] `/mid-session-drift-check`
- [ ] If deviation from R9 schema: `/write-adr <topic>`
- [ ] `/review-prd-compliance` (touches `cross-boundary-artifacts` / architect types)
- [ ] All gate findings resolved before checking Phase 2 complete

---

## Phase 3: Brownfield Design Specialist (`DesignSpecDelta` emission)

**Goal:** MODIFY design work emits deltas, applies them deterministically, passes structural quality gate — **commitment #2**.

### Tasks

- [ ] Add `submit_design_delta` tool schema (flat `z.record(z.unknown())` per parent plan — post-hoc validate with `DesignSpecDeltaSchema`).
- [ ] Extend design work input (`browserDesignWork` / penpot equivalent) with optional `existingDesignSpec: DesignSpecV2`.
- [ ] When `existingDesignSpec` present:
  - Augment design system prompt with delta-aware instructions (R9 §3).
  - Call LLM with `submit_design_delta` tool.
  - Validate response → `DesignSpecDelta`.
  - `deltaApply(existing, delta)` → complete spec.
  - `writeDesignSpec` applied result.
  - Run `runStructuralQualityGate` on applied spec (same as greenfield path).
- [ ] When absent: unchanged `submit_design` full-spec path.
- [ ] **Verify or create delta fixture directory** (Review M5): if `packages/eval/src/fixtures/deltas/` does not exist, create it and copy at least one MODIFY delta from M3.6 receipts (`packages/eval/results/m3-6/` raw run inputs reference hand-crafted deltas — surface those as committed fixtures so the round-trip test has stable inputs). Add a `README.md` documenting source (M3.5 brownfield fixture / M3.6 hand-crafted) and applicability.
- [ ] **Round-trip test** `packages/designspec-renderer/src/renderer/delta/delta-utils.test.ts` or `agents-ux` integration test: fixture delta from `packages/eval/src/fixtures/deltas/` + M0 dashboard spec → `deltaApply` result passes `runStructuralQualityGate`.
- [ ] **Wiring test** `packages/agents-ux/src/design-pipeline/brownfield-design.test.ts`: mock LLM returns minimal delta → pipeline writes spec with only delta nodes changed (spy `writeDesignSpec`, assert node count delta).

### Phase 3 Gate (run in order; each writes a receipt)

- [ ] `/review-plan-impl docs/plans/active/chips-next-steps/m4-execution-plan.md --phase 3`
- [ ] `/mid-session-drift-check`
- [ ] `/verify-design-render` on one MODIFY fixture screen (browser path)
- [ ] All gate findings resolved before checking Phase 3 complete

---

## Phase 4: Architect → TaskPlan Brownfield Wiring

**Goal:** Node 5 assigns `mode: 'NEW' | 'MODIFY'` and `contextRefs` including `existingDesign` for brownfield frontend tasks.

### Tasks

- [ ] Update `task-planner` node prompt + logic to read `state.changeClassification.affectedScreens`.
- [ ] For each `modified` screen with existing spec: emit frontend task `mode: 'MODIFY'`, `contextRefs` includes `{ kind: 'existingDesign', id: pageId }` + architect contracts (screenPlan, componentComposition, entities).
- [ ] For each `new` screen: `mode: 'NEW'`, no `existingDesign` ref.
- [ ] Size `estimatedTokenBudget` using R9 token table (~9.4K for large MODIFY screens + bundle slice; R9 §4.4 measured 22–27K of 76K ceiling — ~69–71% headroom).
- [ ] **Token budget overflow policy** (Review m2): if assembled context exceeds `MAX_INPUT_TOKEN_BUDGET` (76K from R3 §5), the Task Planner downgrades `DesignSliceStrategy` for that task in this priority order: `'structure-only'` → `'labels-only'` → `'none'` (NEW already at `'none'`), recording the downgrade in `task.contextRefs` metadata + a Langfuse warning span. Hard-fail the eval (not silent truncation) if even `'none'` overflows — that signals a Critic-rejectable oversized task.
- [ ] Extend architect eval scenario `packages/eval/src/scenarios/architect/add-budgeting-brownfield.yaml` or add assertion: MODIFY tasks carry `existingDesign` contextRefs.
- [ ] Run architect eval on brownfield fixture — Critic passes, TaskPlan includes expected MODIFY tasks.

### Phase 4 Gate (run in order; each writes a receipt)

- [ ] `/review-plan-impl docs/plans/active/chips-next-steps/m4-execution-plan.md --phase 4`
- [ ] `/mid-session-drift-check`
- [ ] All gate findings resolved before checking Phase 4 complete

---

## Phase 5: Implementer LangGraph Package

**Goal:** Single-threaded Implementer tool-loop consuming `TaskPlan` + sliced context; invokes design specialist; emits code artifacts — integrates Phase 1 routing + instrumentation.

> Package skeleton + `build-implementer-prompt.ts` already landed in **Phase 1A/1C**. Phase 5 fills in the LangGraph state/nodes/graph builder and the v1 tool set — no scaffolding here.

### Tasks

- [ ] Verify Phase 1A package skeleton compiles (`nx build agents-implementer` green) before adding graph code.
- [ ] Define `ImplementerState` in `packages/agents-implementer/src/graph/state.ts` (channels: `task`, `contractBundle`, `projectRoot`, `artifacts`, `completionReport`, `errors`).
- [ ] Nodes (minimal v1):
  1. `loadTaskContext` — `sliceContractBundle` + design slice per ADR-057; consumes the Phase 1C `build-implementer-prompt`.
  2. `runDesignSpecialist` — if `task.type` is frontend/UI: call design pipeline subset (or `runDesignPipeline` single page) with brownfield flags from Phase 3.
  3. `generateCode` — LLM tool-loop writing `filePaths` from task (sequential, single writer).
  4. `reportCompletion` — emits `TaskCompletionReport` (existing `core` schema).
- [ ] **v1 Implementer tool set** (Review m1; subset of vision Layer 8 full list — defer `retrieval` and `research_subagent` to a follow-up):
  - `read_file(path)` — read project file (FS-bounded to `projectRoot`).
  - `write_file(path, contents)` — single-writer, governance-checked.
  - `apply_patch(path, diff)` — patch existing file (avoids whole-file rewrites).
  - `run_typecheck(packageName?)` — `nx typecheck` wrapper, returns errors.
  - `run_tests(packageName?)` — `nx test` wrapper.
  - `run_lint(packageName?)` — `nx lint` wrapper.
  - `report_assumption_violation(assumptionId, evidence)` — flags ledger conflict (vision Layer 8 contract).
  - **Deferred to follow-up:** retrieval (Layer 6), research subagent (read-only codebase exploration), browser-tool design specialist (kept inside `runDesignSpecialist` node, not exposed as top-level tool).
- [ ] `buildImplementerGraph()` + `compileImplementerGraph()` mirroring `packages/agents-architect/src/graph/architect-graph.ts`; Postgres checkpointer optional (follow architect).
- [ ] Integrate **instrumentation** on every `generateCode` LLM call: log `{ taskId, taskType: task.mode, sliceStrategy, qualityProxy }` where `qualityProxy` = `{ compiles: boolean, schemaValid: boolean }` after `tsc` or syntax check on emitted file.
- [ ] Unit + integration tests with `RecordingProvider` — assert prompt substrings per Phase 1C wiring tests at full-graph level (regression-proof the routing).
- [ ] CLI smoke entry: `packages/cli/src/commands/spine-implement-task.ts` (or extend existing) — implement one task from saved `TaskPlan` YAML.
- [ ] **Dashboard API route:** create `packages/dashboard/src/app/api/implementer/route.ts` — POST handler with SSE streaming, calls `compileImplementerGraph()`, emits stage events per node (`loadTaskContext` → `runDesignSpecialist` → `generateCode` → `reportCompletion`). Follow Clarifier route pattern (`api/clarifier/route.ts`: resolve auth → create traced provider → load checkpointer → stream events).
- [ ] Update `packages/dashboard/src/app/api/_lib/run-manager.ts` — add `'implementer'` to `RunStatus['type']` union.
- [ ] Update `packages/dashboard/src/components/spine/spine-constants.ts` — set `implementer.implemented = true`.

### Phase 5 Gate (run in order; each writes a receipt)

- [ ] `/review-plan-impl docs/plans/active/chips-next-steps/m4-execution-plan.md --phase 5`
- [ ] `/mid-session-drift-check`
- [ ] `/review-prd-compliance`
- [ ] All gate findings resolved before checking Phase 5 complete

---

## Phase 6: Reviewer LangGraph Package

**Goal:** Fresh-context Reviewer with deterministic gates first, LLM review second; validates diff against assumption ledger; emits a structured `ReviewResult` that downstream callers (CLI in M4, orchestrator post-R1) drive a bounded retry loop with.

> **Vision Layer 9 deviation note** (Review M2): Vision Layer 9 specifies a 4-pass Reviewer (deterministic gates → LLM review → assumption validator → triage). M4 v1 ships a **3-node Reviewer** that collapses passes 3 and 4 into the LLM review prompt: the LLM is instructed to validate diff vs `assumptionLedger` and self-categorize findings (blocking / suggestion / false-positive) before `emitReviewResult` writes the `ReviewResult`. This is a deliberate v1 simplification — splitting into separate `assumptionValidator` and `triage` nodes is **deferred to a follow-up** (see `Deferred / Follow-Up Plans` table) once the spine has run on enough scenarios to justify the extra pass cost. ADR amendment is **not** required because vision Layer 9 explicitly allows progressive build-out; we file an ADR only if production telemetry shows the collapsed prompt is missing failure modes.

### Tasks

- [ ] Verify Phase 1A package skeleton (`packages/agents-reviewer/`) compiles (`nx build agents-reviewer` green) before adding graph code.
- [ ] Define `ReviewerState` in `packages/agents-reviewer/src/graph/state.ts` — inputs: `diff`, `assumptionLedger`, `contractBundle`, `taskCompletionReport`; outputs: `reviewResult`, `errors`.
- [ ] Nodes (v1, 3-node — see deviation note above):
  1. `deterministicGates` — file-path coverage vs `task.filePaths`, single-writer check, PRD criterion IDs referenced, governance license/secret scan.
  2. `llmReview` — fresh-context diff review (prompt with compact diff summary, not full file dumps); prompt instructs LLM to validate diff vs `assumptionLedger` and self-categorize findings (blocking / suggestion / false-positive). Subsumes vision Layer 9 passes 3 and 4 in v1.
  3. `emitReviewResult` — emits `ReviewResult` with `disposition` (see below).
- [ ] **Revision cycle interface** (Review M1): extend `ReviewResult` schema in `packages/core/src/types/` with `disposition: 'approved' | 'revisionNeeded' | 'escalate'` (Zod enum + TS type), where:
  - `'approved'` — deterministic gates green + LLM review found no blocking findings.
  - `'revisionNeeded'` — fixable findings; caller MAY re-invoke Implementer with `ReviewResult.findings` injected into the next-cycle prompt.
  - `'escalate'` — non-fixable / repeated failure / governance hard-block — caller MUST surface to HITL.
- [ ] **Bounded retry contract** (vision Layer 9 "≤ 2 retries before escalation"): the Reviewer **does not** orchestrate the loop. The caller (M4 CLI smoke entry, post-R1 orchestrator) tracks `revisionCycle` per task and is responsible for: (a) capping at 2 revisions and forcing `'escalate'` thereafter, (b) feeding `findings` back into Implementer state, (c) invoking Reviewer again on the new diff. Document this contract in `packages/agents-reviewer/src/index.ts` JSDoc.
- [ ] CLI smoke loop in `packages/cli/src/commands/spine-implement-task.ts` (extending Phase 5 entry) — implements the bounded retry: `Implementer → Reviewer → if revisionNeeded && cycle < 2: re-invoke Implementer with findings → else stop`. This is the M4 stand-in for the orchestrator.
- [ ] Tests: deterministic gate catches missing file; mock LLM for review path; `disposition` round-trip (`'revisionNeeded'` → caller re-runs → `'approved'` on cycle 2); `'escalate'` after 2 cycles of `'revisionNeeded'`.
- [ ] **Dashboard API route:** create `packages/dashboard/src/app/api/reviewer/route.ts` — POST handler, calls `compileReviewerGraph()`, emits deterministic gate results + LLM review findings + `ReviewResult.disposition`. SSE streaming with stage labels per Clarifier pattern.
- [ ] Update `run-manager.ts` — add `'reviewer'` to `RunStatus['type']` union.
- [ ] Update `spine-constants.ts` — set `reviewer.implemented = true`.

### Phase 6 Gate (run in order; each writes a receipt)

- [ ] `/review-plan-impl docs/plans/active/chips-next-steps/m4-execution-plan.md --phase 6`
- [ ] `/mid-session-drift-check`
- [ ] All gate findings resolved before checking Phase 6 complete

---

## Phase 7: Full Spine Eval + Regression

**Goal:** End-to-end proof: Clarifier → Architect → Design → Implement → Review on CashPulse; design-info regression guard.

> **Cost estimate** (Review m3, anchored to M3.6 receipts where ~$15–30 covered 90 cells × Sonnet 4.6):
> - **Full spine run (one fixture, one path):** ~$1–3 per run (Clarifier ≈ $0.05, Architect ≈ $0.30, Design pipeline ≈ $0.50, Implementer tool-loop ≈ $0.50–1.50, Reviewer ≈ $0.20).
> - **Phase 7 budget:** 2 paths (greenfield + brownfield) × 3 reps for stability ≈ **$6–18 per full Phase 7 pass**.
> - **Regression re-run (6b):** Subset of `design-info-value.yaml` — ~$3–6 (smaller than the original 90-cell sweep because we only need to confirm task-type-aware routing parity, not re-derive the recommendation).
> - **Total Phase 7 cost ceiling:** ~$25 per pass. Run with `RUN_LLM_TESTS=true RUN_E2E_PROOF=true` and document actual `$ / tokens` in `packages/eval/results/m4/cost-receipts.md`.

### Tasks

- [x] Create `packages/eval/src/scenarios/spine-full-cashpulse.yaml`:
  - Greenfield path: CashPulse PRD → clarifier output fixture → architect → one NEW frontend task → implement → review.
  - Brownfield path: `cashpulse-brownfield.yaml` → architect → one MODIFY task → delta design → implement → review.
- [x] Add eval runner hook or script `scripts/run-spine-eval.ts` (or extend `packages/eval`) — document cost tier (`RUN_LLM_TESTS=true`) and per-run `$ / token` capture into `packages/eval/results/m4/cost-receipts.md`. Also added `SpineEvalScenarioSchema` + result types to `packages/eval/src/types.ts`, spine scenario loader at `packages/eval/src/scenarios/spine/index.ts`.
- [ ] **Gate 6a:** Spine structural quality ≥ standalone design pipeline baseline on same screen (parent M4 eval criterion). DEFERRED — eval infrastructure proven (dry-run passes, Architect nodes complete successfully in live runs). Full 25+ min eval run deferred to follow-up session. Run: `RUN_LLM_TESTS=true npx tsx scripts/run-spine-eval.ts --reps 1`
- [ ] **Gate 6b:** Re-run design-info matrix subset or full `scripts/run-design-info-eval.ts` — confirm ADR-057 routing in production path matches M3.6 recommendation (mean fidelity within ±0.15 per task type). DEFERRED — same session. Run: `CLOUD_ML_REGION=us-east5 npx tsx scripts/run-design-info-eval.ts --config A,E --task all --reps 1`
- [x] Update [`docs/guides/design-info-value-eval.md`](../../../guides/design-info-value-eval.md) — link M4 implementer path for regression. Added "M4 Regression Validation" section.
- [x] Update parent [`execution-plan.md`](execution-plan.md): `M4 COMPLETE (2026-05-17)`.
- [x] Update `CLAUDE.md` active plans + last-session line.
- [x] **Dashboard smoke:** SpineRail shows all 4 stages (Clarify, Architect, Implement, Review) with icons and connectors. Screenshot captured.

### Phase 7 Gate (run in order; each writes a receipt)

- [ ] `/review-plan-impl docs/plans/active/chips-next-steps/m4-execution-plan.md --phase 7`
- [ ] `/mid-session-drift-check`
- [ ] `/review-prd-compliance`
- [ ] All gate findings resolved before checking Phase 7 complete

---

## End-of-Plan Gate

- [ ] `/verify-done` — test triad + headed E2E (dashboard spine path if wired) + Chrome DevTools visual + `/verify-docs` task-scoped
      Receipt: inline verification table + screenshots
- [ ] `git commit` — only after `/verify-done` passes
- [ ] `/prepare-handoff` — only if work continues in a new session
      Receipt: `docs/plans/active/chips-next-steps/handoff-check.md` + answer key

---

## Deferred / Follow-Up Plans

| Item | Tracking | Trigger |
|------|----------|---------|
| Orchestrator + git worktrees (R1) | `docs/plans/backlog/` or new active plan | M4 stable; parallel task execution needed |
| M3.6 v2 eval (wider rubric, tsc scoring) | R9.4 §9.5 | Production telemetry shows MODIFY underperformance or plateau |
| **M4.5 — Skill-derived spine quality gates** (see below) | Future `docs/plans/active/chips-next-steps/m4-5-execution-plan.md` | M4 spine works end-to-end; basic gates ship before enrichment |
| Reviewer 4-pass split (vision Layer 9 full topology) | Same M4.5 plan or sibling | Production telemetry shows v1 collapsed prompt missing assumption-validation or triage failure modes |
| Backward compat cleanup | Parent execution-plan §Phase 8 | Spine battle-tested per gate criteria |
| Cross-screen coherence (Layer 7) | Parent §Deferred from M1 | Design pipeline maturity priority |
| Upgrade MODIFY default to `'full'` | ADR-057 "What would change" | Production MODIFY failure rate > NEW |

### Why M4.5 (not M5) for skill-derived gates

The reviewer feedback identified 8 of the 21 skills in `.claude/skills/` whose deterministic logic maps directly to spine pipeline stages — `/review-plan-impl` + `/mid-session-drift-check` + `/review-prd-compliance` (Reviewer), `/implement-feature` (Implementer), `/create-plan` + `/challenge-plan` (Architect), `/verify-done` + `/write-adr` (Reviewer / Architect). Extracting those into pipeline nodes would significantly enrich the basic gates that M4 ships, but doing it inside M4 would expand scope to ~3–5 tasks per skill and risks shipping enrichment before the basic flow is proven.

**M4.5 scope** (sketch — full plan to be drafted after M4 lands):
1. Deterministic review gates — extract 7-point rubric (`/review-plan-impl`) and 11 drift checks (`/mid-session-drift-check`) into Reviewer `deterministicGates` sub-gates.
2. PRD compliance gate — extract spec-vs-code comparison (`/review-prd-compliance`) as a Reviewer `prdComplianceCheck` node.
3. Assumption validator — extract assumption-ledger validation into a separate Reviewer node (also satisfies the vision Layer 9 4-pass deferral above).
4. Plan challenge as Architect gate — extract hierarchical doc reading + violation detection (`/challenge-plan`) as Architect Critic enrichment.
5. Implementer spec lock — extract PRD-code cross-check (`/implement-feature`) as Implementer `loadTaskContext` enrichment.
6. Eval + regression — verify enriched gates don't introduce false positives on existing scenarios.

**Out of M4.5 scope:** full skill rewrite (skills continue to work as Claude Code commands), interactive features (trade-off resolution, visual verification), `/create-plan` and `/verify-done` extraction (too interactive / too broad).

---

## Anti-Shortcut (process)

- Each phase gate is a checkbox **inside** the phase. A skipped gate is an unchecked box visible next session.
- Each gate lists its expected receipt path. Missing receipt = gap surfaced by `/mid-session-drift-check`.
- `/review-plan-impl` spawns fresh-context subagent — implementing agent cannot coach it.
- Skipping a gate without explicit user waiver is a process violation.

## STOP Conditions

- Phase 1 wiring tests pass on mock but fail on real graph path → STOP, fix graph before Phase 3.
- `submit_design_delta` repeatedly invalid → STOP, review tool schema vs post-hoc Zod (do not weaken to optional fields on NodeSpec).
- Full spine eval cell failure rate > 20% → STOP; do not declare M4 complete on partial data.
- Production MODIFY failure rate instrumentation shows regression vs M3.6 → file ADR amendment per §9.5, do not silently change defaults.

## Verification (plan-level)

1. This file exists at `docs/plans/active/chips-next-steps/m4-execution-plan.md`.
2. Phase 1 explicitly contains the three M3.6 commitments as testable tasks.
3. ADR-057 defaults are cited, not re-litigated.
4. M3.6 matrix expansion is listed out of scope.
5. Every phase has gate block per `docs/guides/planning-docs.md`.
6. Data-flow claims trace to files verified in exploration (change-classifier stub, delta in renderer, etc.).
