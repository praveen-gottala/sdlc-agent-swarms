# M2: Architect Foundation — Session Prompts

**Status:** ARCHIVED. M2 shipped on 2026-05-14; the execution plan now lives at `docs/plans/completed/chips-next-steps-m2/execution-plan.md`. Paths in the prompt bodies below still point to `docs/plans/active/chips-next-steps/m2-execution-plan.md` because they record the commands that were actually run during the M2 sessions. They are historical, not navigational.

Two sessions. Each prompt is self-contained — paste it at session start after `/session-start`.

---

## Session A: Phases 1 + 2 (R4 ADR + Architect Typed Contracts)

```
This session implements M2 Phases 1 + 2 of CHIP's Next Steps.

Plan: `docs/plans/active/chips-next-steps/m2-execution-plan.md`
Parent: `docs/plans/active/chips-next-steps/execution-plan.md`

## Phase 1: R4 Resolution — ADR for Styling Library as Architect Axis

Write `docs/adrs/ADR-054-styling-library-architect-axis.md`:
- Decision: Styling library is Architect Node 2 axis (not Clarifier, not pre-pipeline config)
- MUST cite the actual `ComponentLibraryId` union from `packages/cli/src/commands/component-library-presets.ts` — it's `'shadcn' | 'mui' | 'chakra' | 'antd' | 'radix' | 'mantine'`. The R4 brief at `docs/research/briefs/R4-styling-stack-decision.md` lists (shadcn, Mantine, MUI, Radix, Headless, Custom) which is WRONG — fix the brief to match code.
- In brownfield: detected from repo, `defaultToExistingPattern = true`
- In greenfield: Node 2 explores alternatives, Node 3 commits with ADR
- Component catalog shape depends on choice → must resolve before Node 4 runs
- Stack remains hardcoded (single-stack-per-project); multi-stack is future work
- Catalog remains library-specific (6 presets); library-agnostic adapter is premature

Then: update R4 brief preset list to match code, mark RESOLVED with pointer to ADR-054. Add ADR to `mkdocs.yml` nav.

Run Phase 1 gate: `/review-plan-impl docs/plans/active/chips-next-steps/m2-execution-plan.md --phase 1` then `/mid-session-drift-check`.

## Phase 2: Architect Typed Contracts

Create `packages/core/src/types/architect.schemas.ts` with ALL schemas listed in the plan. Key details:

1. **ContractBundle includes intermediate artifacts** (constraintSet, optionsBundle) for debug/eval trail — intentional divergence from research doc.
2. **Required fields:** `assumptionLedger: AssumptionLedger` (vision Layer 5) and `adrs: ADR[]` (research doc:680). Define minimal `ADRSchema` (id, title, status, decision, rationale).
3. **All scope-conditional optional fields:** `dataModel?: DataModelSpec`, `componentComposition?: ComponentComposition`, `designSystemDiff?: DesignSystemDiff`, `changeClassification?: ChangeClassification`. Define minimal placeholder types for the new ones.
4. **Naming:** Use `criticReport` (not `criticResult`) per research doc:684. Schema name `CriticReportSchema`.
5. **`ArchitectureSpec.migrations?: MigrationSpec[]`** — needed for Critic gate 8 in Phase 3.
6. **Modify `DataBindingSchema`** in `cross-boundary-artifacts.schemas.ts` — add `entityId: z.string()` as required field. Zero callers outside types — no migration work needed.
7. **CriticGateSchema + CriticReportSchema** go in this file too (not Phase 3).

Reference schemas: `packages/core/src/types/cross-boundary-artifacts.schemas.ts` (existing patterns), the execution plan Phase 2 section (exact field shapes).

Add all exports to `packages/core/src/types/index.ts`. Create `architect.schemas.test.ts` with parse tests (valid + invalid data).

Run: `nx run-many -t typecheck && nx run-many -t test && nx run-many -t lint` — zero failures.

Run Phase 2 gate: `/review-plan-impl docs/plans/active/chips-next-steps/m2-execution-plan.md --phase 2` then `/mid-session-drift-check`.
```

---

## Session B: Phases 3 + 4 (Critic + Eval Harness)

```
This session implements M2 Phases 3 + 4 of CHIP's Next Steps.

Plan: `docs/plans/active/chips-next-steps/m2-execution-plan.md`
Parent: `docs/plans/active/chips-next-steps/execution-plan.md`

Prerequisite: Phases 1 + 2 are COMPLETE. All Architect Zod schemas exist in `packages/core/src/types/architect.schemas.ts`.

## Phase 3: Architect Critic — 9 Deterministic Gates

Create `packages/core/src/architect/critic.ts` with:

```typescript
function validateContractBundle(bundle: ContractBundle, enrichedReq: EnrichedRequirement): CriticReport
```

9 gates (from `docs/research/architect-codebase-grounded-design.md:366` + extensions):

1. **Schema validation** — all ContractBundle fields parse against Zod schemas
2. **DAG acyclic** — TaskPlan.tasks dependency graph has no cycles (topological sort)
3. **Single-writer** — no two TaskNodes share a filePath
4. **PRD criterion coverage** — every must-have feature has at least one task. **Features without explicit `priority` default to `must-have`** (PRDSchema.features[].priority is optional).
5. **Entity reference integrity** — every `ScreenPlan.dataBindings[].entityId` references an entity in `enrichedReq.prd.dataEntities[]` by ID
6. **Gap resolution completeness** — every Gap in ConstraintSet has `resolvedValue` or is in optionsBundle with `recommendation`
7. **OpenAPI lint** — valid HTTP method, path matches `/^\/[A-Za-z0-9/_{}-]+$/`, no duplicate `(method, path)` tuples across additions/modifications/removals. Inline check only.
8. **Migration SQL parses** — if `ArchitectureSpec.migrations` non-empty, each `sql` non-empty and contains a SQL verb (`CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT`). No real SQL parser.
9. **ADR completeness** — every `ArchitectureDecision` whose `chosenAlternativeId` resolves to an `Alternative` with `blastRadius` of `high` or `critical` must have non-empty `adrId`.

Create barrel at `packages/core/src/architect/index.ts`.
Create `critic.test.ts` — one test per gate (valid passes, each invalid case triggers the right gate failure).

Run: `nx run-many -t typecheck && nx run-many -t test` — zero failures.

Run Phase 3 gate: `/review-plan-impl docs/plans/active/chips-next-steps/m2-execution-plan.md --phase 3` then `/mid-session-drift-check`.

## Phase 4: Architect Eval Harness

Two task blocks.

### Task Block A: Generic-ify Eval Primitives

Current state (MUST read before changing):
- `packages/eval/src/types.ts` — `MetricDefinition` typed to `ClarifierMetrics`
- `packages/eval/src/baseline/compare.ts` — `compareToBaseline()` typed to `ClarifierMetrics`, has hard-coded `prdHashEqualAcrossRounds` boolean check at lines 49-60
- `packages/eval/src/metrics/clarifier-metrics.ts` — `METRIC_DEFINITIONS`

Changes:
1. `MetricDefinition` → `MetricDefinition<TMetrics>` (generic). Add compat alias: `type ClarifierMetricDefinition = MetricDefinition<ClarifierMetrics>`
2. Move `prdHashEqualAcrossRounds` check OUT of `compareToBaseline()` into `METRIC_DEFINITIONS` as a `MetricDefinition<ClarifierMetrics>` entry (normalize boolean to 0/1)
3. `compareToBaseline<TMetrics>()` — generic, remove default `metricDefs` param (callers must pass explicitly)
4. Rename `EvalScenarioSchema` → `ClarifierEvalScenarioSchema`. Keep deprecated alias `EvalScenario = ClarifierEvalScenario`.
5. Update ALL callers:
   - `packages/eval/src/` internal (5 files)
   - `packages/cli/src/commands/eval.ts:23` — `EvalScenario` → `ClarifierEvalScenario`
   - `packages/cli/src/commands/eval.ts:89` — pass `CLARIFIER_METRIC_DEFINITIONS` explicitly
6. Run `nx run-many -t test` — all existing tests pass

### Task Block B: Architect Scenarios + Runner

1. Add `ArchitectExpectedBehaviorSchema`, `ArchitectEvalScenarioSchema`, `ArchitectMetricsSchema` to `packages/eval/src/types.ts`
2. Create `packages/eval/src/scenarios/architect/` with 3 golden YAML fixtures:
   - `correct-cashpulse.yaml` — valid bundle, all 9 gates pass. Must include `assumptionLedger`, `adrs` (1+ entries), `constraintSet`, `optionsBundle`. Derive from CashPulse enriched requirement.
   - `missing-field.yaml` — fails gates 4 + 5 + 9 (missing feature tasks, dangling entityId, high-blast-radius without adrId)
   - `contradictory.yaml` — fails gates 2 + 3 + 6 + 7 + 9 (cyclic DAG, duplicate filePaths, unresolved gaps, duplicate API routes, missing adrId)
3. Create `packages/eval/src/scenarios/architect/index.ts` — `loadArchitectScenarios()`, `ARCHITECT_SCENARIO_IDS`
4. Create `packages/eval/src/metrics/architect-metrics.ts` — `computeArchitectMetrics()` + `ARCHITECT_METRIC_DEFINITIONS: MetricDefinition<ArchitectMetrics>[]`
5. Create `packages/eval/src/architect-runner.ts` — loads bundle, runs Critic, computes metrics
6. Tests: `architect-runner.test.ts`, `architect-metrics.test.ts`, `scenarios/architect/index.test.ts`
7. Update `packages/eval/src/index.ts` barrel

Run: `nx run-many -t typecheck && nx run-many -t test && nx run-many -t lint` — zero failures.

Run Phase 4 gate: `/review-plan-impl docs/plans/active/chips-next-steps/m2-execution-plan.md --phase 4` then `/mid-session-drift-check`.

## End-of-Plan Gate

After both phases pass:
1. `/verify-done`
2. Update parent plan M2 status to COMPLETE
3. Update CLAUDE.md active plans entry
4. `git commit`
5. `/prepare-handoff` if M3 continues in a new session
```
