# Plan: Execute M3.6 — Design Info Value Eval

## Context

M3.5 (R9 Brownfield Design Delta Research Brief) is COMPLETE. The execution plan at `docs/plans/active/chips-next-steps/execution-plan.md` defines M3.6 as an empirical milestone — running a five-configuration measurement of code-generation quality across six representative tasks (3 NEW + 3 MODIFY). The output informs M4's default `DesignSliceStrategy` and produces a regression scenario for ongoing implementer evaluation.

M3.5 ships brownfield wiring (`AffectedScreen` impact classification, `DesignSpecDelta` hybrid schema, slice-aware `ContextRefKind` extension with `DesignSliceStrategy` enum of `'full' | 'labels-only' | 'structure-only'`). M4 will ship with `strategy: 'full'` as the conservative default. M3.6's measurement determines whether narrowing to `'labels-only'` or `'structure-only'` preserves quality at lower token cost.

This milestone is a measurement, not a brief. The "deterministic gates over LLM self-assessment" rule applies — the answer comes from running the matrix and reading the data, not from reasoning about plausible outcomes.

## Deliverables

1. `scripts/run-design-info-eval.ts` — eval runner driving the 5 × 2 × 3 × 3 matrix (~300-400 lines, throwaway)
2. `packages/agents-architect/src/design-slice/` — slice resolution functions (`extractLabelsAndBindings`, `extractStructure`) — production code, eventually consumed by M4
3. `packages/eval/src/scenarios/design-info-value.yaml` — six task fixtures plus eval scenario metadata
4. `packages/eval/src/scoring/design-info-rubric.md` — scoring rubric with explicit 0-3 scales
5. `packages/eval/src/scoring/design-info-reviewer-prompt.md` — fresh-context reviewer system prompt (single-blind)
6. `packages/eval/src/scoring/implementer-test-prompt.md` — fixed implementer prompt (frontmatter-versioned)
7. `packages/eval/results/m3-6/raw-results.json` — one entry per cell × rep
8. `packages/eval/results/m3-6/scored-results.csv` — pivoted scores across all axes
9. `docs/research/briefs/R9_4-design-info-value-eval.md` — eval brief (~400-600 lines)
10. Updated `docs/plans/active/chips-next-steps/execution-plan.md` status + M3.6 completion note
11. Updated `CLAUDE.md` last-session line and M3.6 status

## Phases

### Phase 1: Build the implementer test harness

Write `scripts/run-design-info-eval.ts`. The harness is a throwaway eval-purpose script — NOT the production M4 Implementer. Its job is to take a task fixture and a context configuration, assemble a fixed prompt, call the LLM, and capture the output.

**Harness interface:**

```typescript
async function runEvalCell(
  task: EvalTaskFixture,
  config: ContextConfigKey,
  rep: number,
  seed: number,
): Promise<EvalCellResult>;
```

**Five context configurations:**

| Code | Name | What enters the prompt beyond ContractBundle slice |
|------|------|------------------------------------------------------|
| A | Baseline | Nothing from design-stage outputs |
| B | Planning | + ScreenPlan + ComponentComposition |
| C | Full DesignSpec | B + complete DesignSpec JSON (`strategy: 'full'`) |
| D | Labels-only | B + DesignSpec restricted to labels, data bindings, regions (`strategy: 'labels-only'`) |
| E | Structure-only | B + DesignSpec restricted to layout structure: parent/order/type/catalog (`strategy: 'structure-only'`) |

The slice resolution functions (`extractLabelsAndBindings`, `extractStructure`) are written as production code at `packages/agents-architect/src/design-slice/` — the same functions M4 will consume. The harness imports them.

**Fixed prompt template.** The system prompt is fixed across configurations to isolate context as the only variable. Lives at `packages/eval/src/scoring/implementer-test-prompt.md` with frontmatter version. The prompt tells the LLM: "Generate a complete React/TypeScript component for this task. Use the provided context. Output only code in a single markdown code block."

**Determinism controls:**
- Same model across all runs — verify pin at run-start; abort if model identifier differs from expected
- Temperature 0.3 (low but allows variance across reps)
- Three reps per cell with different seeds, same prompt
- All inputs hashed and logged for reproducibility
- Total: 5 configs × 2 task types × 3 tasks × 3 reps = 90 runs

**Logging.** Each cell to `packages/eval/results/m3-6/raw-results.json` with fields: `taskId`, `taskType`, `config`, `rep`, `seed`, `promptHash`, `inputTokens`, `outputTokens`, `latencyMs`, `output` (the generated code), `modelId`, `timestamp`.

### Phase 2: Define and validate the six task fixtures

Three NEW tasks (from M0 CashPulse greenfield baseline) and three MODIFY tasks (from M3.5 brownfield fixture, the three screens most affected by "Add recurring transactions").

**NEW tasks:**
1. `cashpulse-dashboard-summary-card` — spending summary card
2. `cashpulse-transactions-list-page` — full transactions list with filter chips
3. `cashpulse-settings-form` — settings form with category management

**MODIFY tasks:**
1. `cashpulse-dashboard-modify-add-recurring-card` — add "Upcoming Recurring" card to existing dashboard
2. `cashpulse-add-expense-modify-recurrence-toggle` — add recurrence weekly/monthly/yearly toggle to existing add-expense form
3. `cashpulse-transactions-list-modify-recurring-badge` — add recurring badge to existing transaction rows

**Per-fixture content:**
- `taskDescription` — natural-language statement
- `taskType` — `'NEW' | 'MODIFY'`
- `contractBundleSlice` — sliced ContractBundle (dataModel.entity, apiChangeSet, pattern)
- `screenPlan` — ScreenPlan for this screen
- `componentComposition` — ComponentComposition for this screen
- `designSpec` — full DesignSpec (M0 baseline for NEW; M3.5 post-change for MODIFY)
- `existingDesignSpec` — only for MODIFY tasks; the pre-change DesignSpec
- `groundTruthExpected` — human-written reference implementation describing correct output; serves as scoring anchor

The `groundTruthExpected` is critical and must be written manually — fabricating it from another LLM call would invalidate the scoring.

**STOP condition for Phase 2:** if any fixture's ContractBundle slice cannot be assembled from M0/M3.5 outputs without fabrication, STOP and report. Fabrication invalidates the experiment.

### Phase 3: Write the scoring rubric and pilot

Three-axis scoring:

**Axis 1: Visual fidelity (0-3).** Fresh-context LLM reviewer with the `design-info-reviewer-prompt.md` system prompt. Reviewer receives only the generated code and the ground-truth DesignSpec — NOT the configuration label or task type. Single-blind by construction. Scale:
- 0: Wrong components, wrong layout, missing major sections
- 1: Recognizable but multiple major fidelity issues
- 2: Matches DesignSpec with minor issues (spacing, label wording)
- 3: Faithful rendering match

**Axis 2: Prop & binding correctness (0-3).** Deterministic. Run TypeScript compilation against project tsconfig; AST-extract prop usage; compare against `componentComposition.componentProps` and `screenPlan.dataBindings`. Scale:
- 0: Doesn't compile
- 1: Compiles but ≥50% of declared props missing or misnamed
- 2: Compiles, props correct, ≥1 data binding wrong
- 3: Compiles, all props match composition, all bindings match plan

**Axis 3: Token cost (raw).** Input tokens consumed by the configuration. Read from API response. Reported but not scored on a scale.

**Pilot run.** Before the full 90-cell matrix, run one cell per config (5 runs) on a single NEW task. Manually inspect outputs. Verify:
- Harness produces clean code, not preamble + code blocks
- Reviewer scoring is consistent on repeat invocations (run the reviewer twice on the same cell; scores should differ by ≤1 on the 0-3 scale)
- Token counts match R9.3's predicted ~25-35K for full-DesignSpec config on MODIFY
- Config E (structure-only) doesn't produce nonsense — if it does, that's a finding to surface in Section 4, not a reason to abort

Adjust prompts if the pilot surfaces issues. Re-pilot until clean.

### Phase 4: Run the full eval matrix

Execute 90 cells. Cost estimate at ~12K avg input + ~2K avg output × 90 ≈ 1.3M tokens. Single-digit dollars.

Batch with checkpointing. If a cell fails (rate limit, transient), retry with exponential backoff up to 3 attempts; if still failing, mark the cell `failed` and continue. Don't let one transient kill 89 good cells.

Raw results to `packages/eval/results/m3-6/raw-results.json`.

Run the reviewer over each output to produce visual-fidelity scores. Reviewer temperature 0, fresh context per cell, independent scoring calls. Scores to `packages/eval/results/m3-6/reviewer-scores.json`.

Deterministic axes (compilation, prop matching) scored programmatically with `packages/eval/src/scoring/score-deterministic.ts`.

Pivot all axes into `packages/eval/results/m3-6/scored-results.csv` with columns: `taskId, taskType, config, rep, fidelity_0_3, props_0_3, input_tokens, output_tokens, latency_ms`.

### Phase 5: Analyze results and write the eval brief

Target: `docs/research/briefs/R9_4-design-info-value-eval.md`, 400-600 lines.

**Document structure:**
- 0: Scope, methodology summary, fixture references (~30 lines)
- 1: Executive summary — recommended `DesignSliceStrategy` default with confidence level (~40 lines)
- 2: Methodology — five configs, scoring rubric, blinding controls, determinism, model pin (~60 lines)
- 3: Results — pivot tables and analysis (~140 lines)
  - 3.1: Per-axis scores by config, averaged across task types
  - 3.2: NEW vs MODIFY split — does the answer differ by task type
  - 3.3: Token cost per config (input/output averages)
  - 3.4: Quality-per-token frontier — fidelity gained per 1K additional input tokens
- 4: Findings (~80 lines)
  - 4.1: Does design-stage context help at all? (A vs B)
  - 4.2: Is full DesignSpec worth the tokens? (B vs C)
  - 4.3: Do narrowed slices preserve quality? (C vs D vs E)
  - 4.4: Does the answer differ between NEW and MODIFY?
- 5: Recommendation — which `DesignSliceStrategy` M4 defaults to. State confidence (HIGH/MEDIUM/LOW). State what would change it (~40 lines)
- 6: Threats to validity — sample size, reviewer-LLM bias, single-model dependence (~30 lines)
- 7: M4 implementation implications (~30 lines)
- 8: References (~20 lines)

**Decision rule for the recommendation.** If C and D are within rubric noise of each other (≤0.3 points avg across reps), default to D — cheaper for equivalent quality. If D underperforms C by >0.3, default to C. If A or B alone reliably produces fidelity ≥2, surface that as the headline finding in Section 1 — it would substantially change M4's prompt budget assumptions.

The eval scenario YAML at `packages/eval/src/scenarios/design-info-value.yaml` becomes the regression scenario. As the Implementer evolves post-M4, this scenario re-runs to confirm no regression.

### Phase 6: Update status artifacts

1. Update `docs/plans/active/chips-next-steps/execution-plan.md`:
   - Status line: `M3.6 COMPLETE (DATE) — M4 next (Full Spine)`
   - Add completion note to M3.6 section with recommended strategy + rubric averages
2. Update `CLAUDE.md`:
   - Last-session line
   - CHIP's Next Steps status: `M3.6 COMPLETE`
3. If recommendation requires changing M4's default slice strategy: do NOT edit the R9 brief retroactively. Note the recommendation in the M3.6 brief and let M4's execution plan absorb it when written.

## Verification

1. `scripts/run-design-info-eval.ts` exists and runs end-to-end on a single cell
2. `packages/agents-architect/src/design-slice/` exists with both resolution functions and unit tests
3. `packages/eval/src/scenarios/design-info-value.yaml` has 6 task fixtures, all configuration inputs populated, ground-truth references written manually
4. Rubric file has explicit 0-3 scales for fidelity and props axes
5. Reviewer prompt is single-blind — no config label or task type visible to reviewer
6. `packages/eval/results/m3-6/raw-results.json` has 90 cells or failure records for any incomplete
7. `packages/eval/results/m3-6/scored-results.csv` has one row per cell × rep
8. Eval brief is 400-600 lines with executive summary recommendation
9. Recommendation cites specific score deltas, not "C seems better" hand-waving
10. Threats to validity section explicitly acknowledges 6-task fixture limit and single-model dependence
11. Token cost per config reported as raw numbers
12. Status artifacts updated

## Critical files

- `docs/research/briefs/R9-brownfield-design-delta.md` — defines `DesignSliceStrategy` enum and slice semantics
- `docs/research/briefs/R9-brownfield-design-delta-review.md` — Section C M4 implementation implications
- `packages/eval/src/scenarios/cashpulse-brownfield.yaml` — M3.5 fixture, source for MODIFY task design specs
- `fixtures/personal-expense-tracker/agentforge/designs/*.json` — M0 baseline, source for NEW task design specs
- `fixtures/personal-expense-tracker/agentforge/clarifier-brownfield-output/` — M3.5 Clarifier outputs
- `packages/agents-architect/src/context-slicer.ts` — `sliceContractBundle()`, used by harness to assemble ContractBundle slice
- `packages/core/src/types/architect.schemas.ts` — `TaskNodeSchema`, `ContextRefKindSchema`
- `packages/designspec-renderer/src/types/design-spec-v2.ts` — `DesignSpecV2`, `NodeSpec`

## STOP conditions

- Phase 2 fixture assembly requires fabrication → STOP
- Phase 3 pilot reveals systematic harness issues (preamble defeating AST scoring, reviewer scores diverge by >1 on repeat invocations of same cell) → STOP, fix, re-pilot
- Phase 4 cell failure rate exceeds 20% (>18 of 90 cells) → STOP; do not write findings on incomplete data
- Reviewer inter-rater reliability fails (high variance across repeat invocations on same cell) → STOP, sharpen rubric, re-pilot
- The model pin verification fails at run-start (the API returns a different model identifier than expected) → STOP and report