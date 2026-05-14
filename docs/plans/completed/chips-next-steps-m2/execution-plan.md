# M2: Architect Foundation — Execution Plan

## Status: COMPLETE (2026-05-14)

## Related Documents

- **Parent plan:** `docs/plans/active/chips-next-steps/execution-plan.md` (M2 outline)
- **Vision:** `docs/vision.md` Layer 3 (Agent Taxonomy), Layer 5 (State Persistence), Layer 8 (Implementation)
- **Roadmap:** `docs/roadmap.md` — spans Phases 3, 5, 8 (change classification, implementation spine, evaluation)
- **ADRs:** ADR-038 (TypeScript as contract truth), ADR-043 (TypeScript LangGraph sole runtime), ADR-053 (structured PRD source)
- **Research:** `docs/research/briefs/R4-styling-stack-decision.md`, `docs/research/architect-codebase-grounded-design.md`
- **Guide:** `docs/guides/planning-docs.md`

## Context

M1 (Connect) shipped the Clarifier→Design bridge: enriched-requirement.yaml flows through the pipeline, producing 1,086x improvement in PRD content (14 chars → 15,201 chars). M2 lays the Architect's foundation: typed Zod schemas for all Architect outputs, a standalone Critic validation function (9 deterministic gates), and an eval harness with golden bundles to measure Critic accuracy. M2 introduces new files only; no existing code paths are modified. The legacy `packages/agents-ux/src/design-pipeline/pipeline.ts` 4-stage loop is untouched.

**Parent plan inconsistency resolved:** The milestone table includes "Critic (Node 6)" in M2, but the phase breakdown puts it in M3. This plan builds the Critic as a standalone validation function. M3 Phase 5 wraps it as a LangGraph node.

**R5 status:** R5 (Design System Bootstrapping Order) was a P1 M1 blocker. Resolved implicitly during M1: `agentforge init` remains the bootstrap mechanism for design tokens and component catalogs in greenfield mode. The Clarifier consumes them if they exist but does not create them. The Architect (M3+) will eventually replace init as the bootstrap path.

**Naming decision:** The research doc (`architect-codebase-grounded-design.md:684`) uses `criticReport: ArchitectCriticReport`. This plan follows that naming: `CriticReportSchema` for the type, `criticReport` for the `ContractBundleSchema` field. M3 must use the same names.

## Patterns to Reuse

| Pattern | Location | Usage |
|---------|----------|-------|
| Cross-boundary Zod schemas | `packages/core/src/types/cross-boundary-artifacts.schemas.ts` | Same file-level pattern for Architect schemas |
| Eval scenario loader | `packages/eval/src/scenarios/index.ts` | Parallel `loadArchitectScenarios()` with YAML + Zod parse |
| `MetricDefinition` interface | `packages/eval/src/types.ts:67-71` | Generic-ified to `MetricDefinition<TMetrics>` in this plan (Phase 4), then instantiated with `ArchitectMetrics` |
| Baseline comparison | `packages/eval/src/baseline/compare.ts` | Generic-ified in this plan (Phase 4), then reused for Architect regression detection |
| Component library presets | `packages/cli/src/commands/component-library-presets.ts` | R4 reference: 6 presets (`ComponentLibraryId` union) shaping the styling-library axis |

## Exit Criteria

1. All Architect Zod schemas (`ConstraintSet`, `OptionsBundle`, `ArchitectureSpec`, `TaskPlan`, `ContractBundle`, `ADR`, `DataModelSpec`, `ComponentComposition`, `DesignSystemDiff`) + two Critic types (`CriticGate`, `CriticReport`) parse valid and invalid inputs correctly
2. Critic function (9 deterministic gates) passes a valid golden bundle and rejects both invalid ones (missing-field, contradictory)
3. Architect eval harness runs all 3 golden scenarios, computes false-positive and false-negative metrics, and regression comparison works via generic-ified `compareToBaseline<TMetrics>()`
4. ADR-054 documents styling library as Architect Node 2 axis, citing `ComponentLibraryId` from code
5. `EvalScenarioSchema` renamed to `ClarifierEvalScenarioSchema`; all callers updated
6. `nx run-many -t typecheck`, `nx run-many -t test`, `nx run-many -t lint` — zero failures

## Key Files

| File | Action |
|------|--------|
| `packages/core/src/types/architect.schemas.ts` | CREATE — Architect Zod schemas (ConstraintSet, OptionsBundle, ArchitectureSpec, TaskPlan, ContractBundle, ADR, DataModelSpec, ComponentComposition, DesignSystemDiff, MigrationSpec) + 2 Critic types |
| `packages/core/src/types/cross-boundary-artifacts.schemas.ts` | MODIFY — add `entityId` to `DataBindingSchema` (C3) |
| `packages/core/src/types/index.ts` | MODIFY — add Architect schema exports |
| `packages/core/src/architect/critic.ts` | CREATE — standalone Critic validation function (9 gates) |
| `packages/core/src/architect/index.ts` | CREATE — barrel export |
| `packages/core/src/architect/critic.test.ts` | CREATE — Critic unit tests (9 gates) |
| `packages/eval/src/types.ts` | MODIFY — generic `MetricDefinition<T>`, rename `EvalScenarioSchema` → `ClarifierEvalScenarioSchema`, add `ArchitectEvalScenarioSchema`, `ArchitectMetricsSchema` |
| `packages/eval/src/baseline/compare.ts` | MODIFY — generic `compareToBaseline<T>()`, extract `prdHashEqualAcrossRounds` to Clarifier metrics |
| `packages/eval/src/index.ts` | MODIFY — barrel exports for renamed + new types |
| `packages/eval/src/scenarios/index.ts` | MODIFY — update `ClarifierEvalScenarioSchema` reference |
| `packages/eval/src/runner.ts` | MODIFY — update `ClarifierEvalScenarioSchema` reference |
| `packages/eval/src/report.ts` | MODIFY — update type references |
| `packages/cli/src/commands/eval.ts` | MODIFY — `EvalScenario` → `ClarifierEvalScenario`, pass `CLARIFIER_METRIC_DEFINITIONS` to `compareToBaseline()` explicitly |
| `packages/eval/src/scenarios/architect/correct-cashpulse.yaml` | CREATE — valid golden bundle |
| `packages/eval/src/scenarios/architect/missing-field.yaml` | CREATE — invalid (missing fields) |
| `packages/eval/src/scenarios/architect/contradictory.yaml` | CREATE — invalid (internal contradictions) |
| `packages/eval/src/scenarios/architect/index.ts` | CREATE — loader for Architect scenarios |
| `packages/eval/src/architect-runner.ts` | CREATE — eval runner for Architect scenarios |
| `packages/eval/src/metrics/architect-metrics.ts` | CREATE — Critic accuracy metrics |
| `docs/adrs/ADR-054-styling-library-architect-axis.md` | CREATE — R4 resolution |

---

## Phase 1: R4 Resolution — Styling Library as Architect Axis

R4 research brief exists with settled decisions. This phase produces the ADR and marks R4 resolved.

### Tasks

- [x] Read R4 brief (`docs/research/briefs/R4-styling-stack-decision.md`) and current component-library-presets (`packages/cli/src/commands/component-library-presets.ts`)
- [x] Write `docs/adrs/ADR-054-styling-library-architect-axis.md`:
  - Decision: Styling library is Architect Node 2 axis (not Clarifier, not pre-pipeline config)
  - **Cite the actual `ComponentLibraryId` union from code** (`'shadcn' | 'mui' | 'chakra' | 'antd' | 'radix' | 'mantine'`), not the R4 brief's incorrect list. Per `docs/lessons-learned-rules.md` §"ADRs Must Describe Reality, Not Intent" — the ADR describes what IS in code.
  - In brownfield: detected from repo, `defaultToExistingPattern = true`
  - In greenfield: Node 2 explores alternatives, Node 3 commits with ADR
  - Component catalog shape depends on choice → must resolve before Node 4 runs
  - Stack (React/Node/PostgreSQL) remains hardcoded for now (single-stack-per-project); multi-stack is future work
  - Catalog remains library-specific (6 presets pattern); library-agnostic adapter is premature abstraction
- [x] Update R4 brief: fix preset list to match code (`ComponentLibraryId`: shadcn, mui, chakra, antd, radix, mantine), then mark RESOLVED with pointer to ADR-054
- [x] Add `docs/adrs/ADR-054-styling-library-architect-axis.md` to `mkdocs.yml` nav

### Phase 1 Gate (run in order; each writes a receipt)

- [x] `/review-plan-impl docs/plans/active/chips-next-steps/m2-execution-plan.md --phase 1`
- [x] `/mid-session-drift-check`
- [x] All gate findings resolved before checking Phase 1 complete

---

## Phase 2: Architect Typed Contracts (Zod Schemas)

New schemas in `packages/core/src/types/architect.schemas.ts`. Each schema is informed by the execution plan's worked examples (greenfield expense tracker + brownfield budget addition) and the research doc's `ContractBundle` definition at `architect-codebase-grounded-design.md:674-686`.

**Challenge resolution:** ContractBundle includes intermediate artifacts (`constraintSet`, `optionsBundle`) for debug/eval trail — intentional divergence from research doc which treats these as node-level state. Also includes all scope-conditional optional fields (`dataModel`, `componentComposition`, `designSystemDiff`, `changeClassification`) from the research doc for schema completeness. `assumptionLedger` (required, vision Layer 5) and `adrs` (required) added per challenge finding.

### Tasks

- [x] Create `packages/core/src/types/architect.schemas.ts` with these schemas:

  **ConstraintSchema + ConstraintSetSchema** (Node 1 output):
  ```
  Constraint: { id, type: 'hard'|'soft', category: string, description, source }
  ConstraintSet: { projectId, constraints[], gaps: Gap[], mode: 'greenfield'|'brownfield' }
  Gap: { id, axis: string, description, defaultValue?, resolvedValue?, resolvedBy? }
  ```

  **OptionMemoSchema + OptionsBundleSchema** (Node 2 output):
  ```
  OptionMemo: { gapId, axis, alternatives: Alternative[], recommendation?, rationale }
  Alternative: { id, name, description, tradeoffs: string[], blastRadius: BlastRadius, references: string[] }
  OptionsBundle: { projectId, memos: OptionMemo[] }
  ```

  **ArchitectureDecisionSchema + ArchitectureSpecSchema** (Node 3 output):
  ```
  ArchitectureDecision: { gapId, chosenAlternativeId, rationale, adrId? }
  ArchitectureSpec: {
    projectId,
    decisions: ArchitectureDecision[],
    stackConfig: StackConfig,
    assumptionLedgerUpdates: AssumptionEntry[],
    migrations?: MigrationSpec[]    // C2 gate 8: { id: string, sql: string }
  }
  MigrationSpec: { id: string, sql: string }
  ```

  **TaskNodeSchema + TaskPlanSchema** (Node 5 output):
  ```
  TaskNode: { id, title, description, filePaths: string[], dependencies: string[], writeOrder: number, type: 'scaffold'|'backend'|'frontend'|'test'|'integration' }
  TaskPlan: { projectId, tasks: TaskNode[], featureCoverage: Record<string, string[]> }
  ```

  **ADRSchema** (Architect-generated ADRs — minimal for M2, expanded in M3):
  ```
  ADR: { id, title, status: 'proposed'|'accepted'|'superseded', decision, rationale, alternatives?: string[] }
  ```

  **Placeholder types for scope-conditional fields** (minimal definitions — M3 populates fully):
  ```
  DataModelSpec: { projectId, entities: DataModelEntity[] }
  DataModelEntity: { id, name, fields: DataModelField[], tableName?, relationships?: string[] }
  DataModelField: { name, type, required: boolean, description? }
  ComponentComposition: { screenId, componentTree: ComponentTreeNode[] }
  ComponentTreeNode: { id, type, catalogId?, children?: string[], props?: Record<string, unknown> }
  DesignSystemDiff: { addedTokens: string[], modifiedTokens: string[], removedTokens: string[], themeStrategy? }
  ```

  **ContractBundleSchema** (full Architect output — matches research doc `architect-codebase-grounded-design.md:674-686` + intermediate artifacts for debugging/eval):
  ```
  ContractBundle: {
    projectId,
    constraintSet: ConstraintSet,             // intermediate (Node 1) — included for debug/eval trail
    optionsBundle: OptionsBundle,              // intermediate (Node 2) — included for debug/eval trail
    architectureSpec: ArchitectureSpec,         // required (Node 3)
    adrs: ADR[],                               // required (Node 3) — empty array in M2 fixtures
    dataModel?: DataModelSpec,                 // optional (scope-conditional)
    apiChangeSets: APIChangeSet[],             // required (existing schema)
    componentComposition?: ComponentComposition, // optional (scope-conditional)
    screenPlans: ScreenPlan[],                 // required (existing schema)
    designSystemDiff?: DesignSystemDiff,        // optional (scope-conditional)
    taskPlan: TaskPlan,                        // required (Node 5)
    assumptionLedger: AssumptionLedger,         // required (vision Layer 5 — merged: Clarifier original + Architect updates)
    criticReport?: CriticReport,               // optional in M2 (bundle created before Critic runs); M3 makes required
    changeClassification?: ChangeClassification, // optional (brownfield only, existing schema)
    version: string
  }
  ```

  **CriticGateSchema + CriticReportSchema** (Node 6 output — moved here from Phase 3 per M1):
  ```
  CriticGate: { name, passed: boolean, findings: string[] }
  CriticReport: { gates: CriticGate[], passed: boolean, summary: string }
  ```

- [x] **Modify `DataBindingSchema`** in `packages/core/src/types/cross-boundary-artifacts.schemas.ts` — add `entityId: z.string()` as a new required field (Option A per C3). Keep `source` as free-form annotation. Note: no external code constructs `DataBinding` objects — the schema is defined in types but unused outside `ScreenPlanSchema`. Typecheck confirms zero callers affected.
- [x] Add all new schema exports to `packages/core/src/types/index.ts`
- [x] Create `packages/core/src/types/architect.schemas.test.ts` — parse tests with valid data + invalid data (missing required fields, wrong types)
- [x] Run `nx run-many -t typecheck` — zero errors across all packages (including DataBindingSchema callers)

### Phase 2 Gate (run in order; each writes a receipt)

- [x] `/review-plan-impl docs/plans/active/chips-next-steps/m2-execution-plan.md --phase 2`
- [x] `/mid-session-drift-check`
- [x] All gate findings resolved before checking Phase 2 complete

---

## Phase 3: Architect Critic (Standalone Validation — 9 Deterministic Gates)

Pure function, no LangGraph dependency. Takes a `ContractBundle` + `EnrichedRequirement` and returns a `CriticReport` with per-gate pass/fail + findings. M3 Phase 5 wraps this as a LangGraph node. Gate list matches `docs/research/architect-codebase-grounded-design.md:366`.

### Tasks

- [x] Create `packages/core/src/architect/critic.ts` with `validateContractBundle(bundle: ContractBundle, enrichedReq: EnrichedRequirement): CriticReport` implementing 9 deterministic gates:

  1. **Schema validation** — all ContractBundle fields parse against their Zod schemas
  2. **DAG acyclic** — TaskPlan.tasks dependency graph has no cycles (topological sort)
  3. **Single-writer** — no two TaskNodes share a filePath
  4. **PRD criterion coverage** — every must-have feature in `EnrichedRequirement.prd.features` has at least one task in TaskPlan. **Features without an explicit `priority` default to `must-have` for coverage purposes** (since `PRDSchema.features[].priority` is optional per `cross-boundary-artifacts.schemas.ts:129`).
  5. **Entity reference integrity** — every `ScreenPlan.dataBindings[].entityId` (added in Phase 2) references an entity that exists in `enrichedReq.prd.dataEntities[]` by ID
  6. **Gap resolution completeness** — every Gap in ConstraintSet either has a `resolvedValue` or is in optionsBundle with a `recommendation`
  7. **OpenAPI lint** — every entry in `APIChangeSet.{additions,modifications,removals}` has a valid HTTP method (`GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS`) and a path matching `/^\/[A-Za-z0-9/_{}-]+$/`. No duplicate `(method, path)` tuples across the three arrays. Inline check — no full OpenAPI linter for M2.
  8. **Migration SQL parses** — if `ArchitectureSpec.migrations` is non-empty, each `sql` must be non-empty and contain at least one SQL verb (`CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT`). Real SQL parsing is out of scope for M2.
  9. **ADR completeness** — every `ArchitectureDecision` whose `chosenAlternativeId` resolves to an `Alternative` with `blastRadius` of `high` or `critical` must have a non-empty `adrId`.

- [x] Create `packages/core/src/architect/index.ts` — barrel export
- [x] Create `packages/core/src/architect/critic.test.ts` — test each gate independently:
  - Valid bundle → all 9 gates pass
  - Cyclic DAG → gate 2 fails
  - Duplicate filePaths → gate 3 fails
  - Missing feature coverage (must-have feature with no task) → gate 4 fails
  - Feature with `priority: undefined` → treated as must-have, gate 4 checks coverage
  - Dangling entity reference (entityId not in prd.dataEntities) → gate 5 fails
  - Unresolved gap without recommendation → gate 6 fails
  - Invalid HTTP method or duplicate (method, path) → gate 7 fails
  - Empty migration SQL or missing SQL verb → gate 8 fails
  - High/critical blast radius decision with empty adrId → gate 9 fails
- [x] Run `nx run-many -t typecheck && nx run-many -t test` — zero failures

### Phase 3 Gate (run in order; each writes a receipt)

- [x] `/review-plan-impl docs/plans/active/chips-next-steps/m2-execution-plan.md --phase 3`
- [x] `/mid-session-drift-check`
- [x] All gate findings resolved before checking Phase 3 complete

---

## Phase 4: Architect Eval Harness

Extends `packages/eval/` with Architect-specific scenarios, runner, and metrics. Uses the Critic from Phase 3 as the scoring function. **First task block**: generic-ify eval primitives so Architect metrics can reuse the baseline comparison infrastructure.

### Task Block A: Generic-ify Eval Primitives (C1)

- [x] Refactor `MetricDefinition` in `packages/eval/src/types.ts` to `MetricDefinition<TMetrics>`:
  ```typescript
  export interface MetricDefinition<TMetrics> {
    readonly name: string;
    readonly direction: MetricDirection;
    readonly compute: (metrics: TMetrics) => number | null;
  }
  ```
  Add backward-compat alias: `export type ClarifierMetricDefinition = MetricDefinition<ClarifierMetrics>;`
- [x] Move the `prdHashEqualAcrossRounds` boolean check OUT of `compareToBaseline()` (`packages/eval/src/baseline/compare.ts:49-60`) into Clarifier-specific metric definitions in `packages/eval/src/metrics/clarifier-metrics.ts`. The check becomes a `MetricDefinition<ClarifierMetrics>` entry that normalizes the boolean to 0/1.
- [x] Update `compareToBaseline()` in `packages/eval/src/baseline/compare.ts` to be generic:
  ```typescript
  export function compareToBaseline<TMetrics>(
    baseline: TMetrics,
    current: TMetrics,
    thresholdPct: number = DEFAULT_THRESHOLD_PCT,
    metricDefs: readonly MetricDefinition<TMetrics>[],
  ): readonly RegressionResult[]
  ```
  Remove the default `metricDefs = METRIC_DEFINITIONS` — callers must pass metric definitions explicitly.
- [x] Rename `EvalScenarioSchema` → `ClarifierEvalScenarioSchema` in `packages/eval/src/types.ts`. Update type alias: `export type ClarifierEvalScenario = z.infer<typeof ClarifierEvalScenarioSchema>;`. Keep `EvalScenario` as a deprecated alias pointing to `ClarifierEvalScenario` for one release.
- [x] Update all callers of old names:
  - `packages/eval/src/scenarios/index.ts` — `ClarifierEvalScenarioSchema`
  - `packages/eval/src/runner.ts` — `ClarifierEvalScenario`
  - `packages/eval/src/report.ts` — type references
  - `packages/eval/src/index.ts` — barrel exports (export both old deprecated + new names)
  - `packages/cli/src/commands/eval.ts:23` — `EvalScenario` → `ClarifierEvalScenario`
  - `packages/cli/src/commands/eval.ts:89` — pass `CLARIFIER_METRIC_DEFINITIONS` explicitly (default removed from generic `compareToBaseline<T>()`)
- [x] Run `nx run-many -t test` — all existing eval + CLI tests pass

### Task Block B: Architect Eval Scenarios + Runner

- [x] Add to `packages/eval/src/types.ts`:
  ```typescript
  ArchitectExpectedBehaviorSchema: { criticShouldPass: boolean, expectedFailedGates?: string[] }
  ArchitectEvalScenarioSchema: { id, name, description, contractBundle: ContractBundleSchema, enrichedRequirement: EnrichedRequirementSchema, expectedBehavior: ArchitectExpectedBehaviorSchema }
  ArchitectMetricsSchema: { scenarioId, criticPassed, expectedPass, isCorrectVerdict: boolean, gateResults: CriticGate[], falsePositive: boolean, falseNegative: boolean }
  ```
- [x] Create `packages/eval/src/scenarios/architect/` directory
- [x] Create 3 golden fixtures as YAML files:
  - `correct-cashpulse.yaml` — valid ContractBundle derived from CashPulse enriched requirement. All 9 Critic gates pass. Tasks cover all 3 screens, DAG is acyclic, single-writer holds, all entities referenced correctly via `entityId`, all gaps resolved, API endpoints have valid methods/paths, migrations contain SQL verbs, high-blast-radius decisions have ADR IDs. Includes `assumptionLedger` (merged from Clarifier output + architect updates), `adrs` (1+ entries), `constraintSet`, `optionsBundle`.
  - `missing-field.yaml` — ContractBundle with: TaskPlan missing tasks for 2 must-have features, one ScreenPlan referencing nonexistent `entityId`, `assumptionLedger` present but `adrs` empty despite high-blast-radius decisions. Critic must fail gates 4 + 5 + 9.
  - `contradictory.yaml` — ContractBundle with: cyclic task dependencies (T3→T5→T3), two tasks writing same file, unresolved gap with no recommendation, duplicate `(POST, /api/expenses)` across additions and modifications, high-blast-radius decision with empty adrId. Critic must fail gates 2 + 3 + 6 + 7 + 9.
- [x] Create `packages/eval/src/scenarios/architect/index.ts` — `loadArchitectScenarios()`, `ARCHITECT_SCENARIO_IDS`
- [x] Create `packages/eval/src/metrics/architect-metrics.ts` — `computeArchitectMetrics(scenario, criticReport): ArchitectMetrics` + `ARCHITECT_METRIC_DEFINITIONS: MetricDefinition<ArchitectMetrics>[]`
- [x] Create `packages/eval/src/architect-runner.ts` — `runArchitectScenario(scenario): ArchitectMetrics` — loads bundle, runs Critic, computes metrics
- [x] Create `packages/eval/src/architect-runner.test.ts` — test runner against all 3 golden scenarios
- [x] Create `packages/eval/src/metrics/architect-metrics.test.ts` — unit tests for metric computation
- [x] Create `packages/eval/src/scenarios/architect/index.test.ts` — scenario loading + schema validation tests
- [x] Update `packages/eval/src/index.ts` barrel export with new Architect types and functions
- [x] Run `nx run-many -t typecheck && nx run-many -t test && nx run-many -t lint` — zero failures

### Phase 4 Gate (run in order; each writes a receipt)

- [x] `/review-plan-impl docs/plans/active/chips-next-steps/m2-execution-plan.md --phase 4`
- [x] `/mid-session-drift-check`
- [x] All gate findings resolved before checking Phase 4 complete

---

## End-of-Plan Gate

- [x] `/verify-done` — test triad (typecheck/test/lint zero failures, e2e-test excluded — pre-existing ESM config failure)
- [x] Update parent plan (`execution-plan.md`) M2 status to COMPLETE
- [x] Update CLAUDE.md active plans entry for CHIP's Next Steps
- [ ] `git commit` — only after `/verify-done` passes
- [ ] `/prepare-handoff` — only if M3 continues in a new session
      Receipt: `docs/plans/active/chips-next-steps/handoff-check.md` + answer key

---

## Deferred to M3 (with tracking)

These items are explicitly NOT in M2 scope. Each has a tracking artifact in the parent plan's M3 phases:

| Item | Why deferred | Tracked at |
|------|-------------|------------|
| LangGraph Architect graph definition | M3 builds Nodes 1-5 + wires Critic as Node 6 | Parent plan M3 Phase 6 |
| Shared module extraction (token validation, quality gate) | Copy-then-redirect requires Architect code to exist first | Parent plan M3 Phase 4 |
| LLM-based Critic review (`critic-system.md`) | Deterministic gates first; LLM review when eval shows structural checks insufficient | Parent plan M3 Phase 5 |
| End-to-end Architect eval (Clarifier → Architect → ContractBundle) | Requires Nodes 1-5 to exist | Parent plan M3 eval gate |
