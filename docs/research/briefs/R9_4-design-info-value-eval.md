# R9.4 — Design Info Value Eval

## 0. Scope

This document reports the results of M3.6, an empirical measurement of how design-stage
context affects implementer code-generation quality. Five context configurations (A–E)
were evaluated across six tasks (3 NEW, 3 MODIFY) with three repetitions each, producing
90 scored cells. The measurement determines which `DesignSliceStrategy` value M4 should
default to.

**Fixtures:** `packages/eval/src/scenarios/design-info-value.yaml` (six tasks).
**Raw data:** `packages/eval/results/m3-6/raw-results.json` (90 cells).
**Scored data:** `packages/eval/results/m3-6/scored-results.csv` (90 rows).
**Runner:** `scripts/run-design-info-eval.ts`.
**Scorer:** `scripts/run-design-info-reviewer.ts`.

---

## 1. Executive Summary

**Recommended default `DesignSliceStrategy`: split by task type.**

- **NEW tasks:** No design-stage context needed. Config A (task description + data model
  only) achieves the highest fidelity (1.89) among all configurations. Adding planning
  context or design specs *reduces* quality for greenfield tasks. Recommendation:
  `strategy: 'none'` for NEW tasks.

- **MODIFY tasks:** Structure-only slice recommended. Config E (`strategy: 'structure-only'`)
  achieves the same fidelity as Config C (`strategy: 'full'`) — both at 2.56 — while
  consuming 44% fewer input tokens (17.4K vs 31.2K). Config D (`strategy: 'labels-only'`)
  underperforms by 0.33 points.

**Confidence: MEDIUM.** The direction is clear — context helps for MODIFY but not for
NEW — but the effect sizes are modest (≤0.34 on a 0–3 scale) and the 6-task fixture set
is small. The recommendation would change if a larger fixture set shows design-spec
context reliably improves NEW task quality.

**Headline finding:** Config A (baseline, 746 input tokens) achieves 2.06 overall mean
fidelity. This challenges the assumption that design-stage context is always beneficial.
The LLM generates competent React components from task description + data model alone.
Design context helps only for brownfield (MODIFY) tasks where the implementer needs to
understand existing structure.

---

## 2. Methodology

### 2.1 Context Configurations

Five configurations progressively add design-stage context to the implementer prompt.
The `ContractBundle` slice (data model entities, field types) is included in all
configurations.

| Config | Name | Context included | Input tokens (mean) |
|--------|------|------------------|-------------------:|
| A | Baseline | Task description + ContractBundle | 746 |
| B | Planning | A + ScreenPlan + ComponentComposition | 4,187 |
| C | Full DesignSpec | B + complete DesignSpecV2 JSON | 23,623 |
| D | Labels-only | B + DesignSpec stripped to labels, content, bindings | 15,144 |
| E | Structure-only | B + DesignSpec stripped to parent/order/type/catalog | 13,944 |

Configs D and E use production slice functions from `packages/agents-architect/src/design-slice/`:
`extractLabelsAndBindings()` retains content fields (59% of full spec size),
`extractStructure()` retains only the tree skeleton (52% of full spec size).

### 2.2 Tasks

Three NEW tasks (greenfield, from M0 CashPulse baseline) and three MODIFY tasks
(brownfield, from M3.5 "Add recurring transactions" change request):

| Task ID | Type | Description | Design nodes |
|---------|------|-------------|-------------:|
| cashpulse-dashboard-summary-card | NEW | Dashboard spending summary card | 159 |
| cashpulse-transactions-list-page | NEW | Spending insights with categories | 161 |
| cashpulse-settings-form | NEW | Settings form with category management | 62 |
| cashpulse-dashboard-modify-add-recurring-card | MODIFY | Add recurring card to dashboard | 159→191 |
| cashpulse-add-expense-modify-recurrence-toggle | MODIFY | Add recurrence toggle to form | 157→176 |
| cashpulse-transactions-list-modify-recurring-badge | MODIFY | Add frequency badges to rows | 159→165 |

MODIFY tasks receive both the pre-change design spec and the post-change spec (derived
via `deltaApply(existingSpec, delta)` using hand-crafted `DesignSpecDelta` JSON fixtures
in `fixtures/personal-expense-tracker/agentforge/deltas/`).

### 2.3 Scoring

**Fidelity (0–3).** Single-blind LLM reviewer (Claude Sonnet 4.6 on Vertex AI, temperature 0).
The reviewer receives only the generated code and the ground-truth reference — not the
configuration label or task type. Consistency validated during pilot: max divergence = 0
across 10 repeat scoring calls.

| Score | Meaning |
|------:|---------|
| 0 | Wrong components, wrong layout, missing major sections |
| 1 | Recognizable structure but multiple major fidelity issues |
| 2 | Matches design with minor issues (spacing, label wording) |
| 3 | Faithful match — components, layout, labels, bindings all correct |

**Props (0–3).** Reviewer-assessed prop and data-binding correctness.

| Score | Meaning |
|------:|---------|
| 0 | Does not compile or no props declared |
| 1 | Compiles but ≥50% of expected props missing or misnamed |
| 2 | Compiles, props mostly correct, ≥1 data binding uses wrong field name |
| 3 | All props match, all data bindings use correct field names |

**Token cost.** Raw input token count from the Vertex AI response metadata.

### 2.4 Determinism Controls

- **Model pin:** Claude Sonnet 4.6 (`claude-sonnet-4-6` on Vertex AI). Verified at run start.
- **Temperature:** 0.3 (low but allows variance across reps for stability estimation).
- **Reps:** 3 per cell with different seeds.
- **Checkpointing:** Runner saves after each cell; resumable on failure.
- **Prompt hash:** SHA-256 logged per cell for reproducibility.
- **Reviewer isolation:** Fresh context per scoring call; temperature 0.

---

## 3. Results

### 3.1 Overall Config Comparison

| Config | n | Fidelity (mean ± sd) | Props (mean ± sd) | Input tokens (mean) |
|--------|--:|---------------------:|-------------------:|--------------------:|
| A | 18 | 2.06 ± 0.54 | 2.61 ± 0.70 | 746 |
| B | 18 | 1.83 ± 0.71 | 2.50 ± 0.51 | 4,187 |
| C | 18 | 1.94 ± 0.80 | 2.56 ± 0.70 | 23,623 |
| D | 18 | 1.78 ± 0.65 | 2.44 ± 0.70 | 15,144 |
| E | 18 | 1.94 ± 0.80 | 2.61 ± 0.61 | 13,944 |

Config A achieves the highest mean fidelity (2.06) at the lowest token cost (746).
Configs C and E tie at 1.94. Config D is the lowest at 1.78. The overall pattern
suggests that adding context has diminishing — and sometimes negative — returns.

### 3.2 NEW vs MODIFY Split

**NEW tasks (greenfield):**

| Config | n | Fidelity | Props | Input tokens |
|--------|--:|--------:|------:|------------:|
| A | 9 | 1.89 | 2.44 | 720 |
| B | 9 | 1.33 | 2.33 | 5,103 |
| C | 9 | 1.33 | 2.11 | 16,000 |
| D | 9 | 1.33 | 2.11 | 11,123 |
| E | 9 | 1.33 | 2.22 | 10,464 |

For NEW tasks, Config A is the clear winner. All other configs score identically at
1.33 fidelity — a 0.56-point drop from baseline. Adding planning context, design specs,
or any slice *hurts* greenfield code generation. The LLM appears to over-constrain its
output when given design specifications for a screen it needs to build from scratch.

**MODIFY tasks (brownfield):**

| Config | n | Fidelity | Props | Input tokens |
|--------|--:|--------:|------:|------------:|
| A | 9 | 2.22 | 2.78 | 772 |
| B | 9 | 2.33 | 2.67 | 3,271 |
| C | 9 | 2.56 | 3.00 | 31,245 |
| D | 9 | 2.22 | 2.78 | 19,165 |
| E | 9 | 2.56 | 3.00 | 17,424 |

For MODIFY tasks, design-spec context helps. Configs C and E tie at 2.56 fidelity and
3.00 props — the highest scores in the entire matrix. Config E achieves this at 44%
fewer tokens than C (17.4K vs 31.2K). Config D underperforms (2.22), matching the
baseline — the labels-only slice loses structural information that matters for
understanding existing layout when making modifications.

### 3.3 Token Cost by Config

| Config | Input tokens (mean) | Output tokens (mean) | Latency (mean ms) |
|--------|-------------------:|--------------------:|------------------:|
| A | 746 | 4,723 | 53,009 |
| B | 4,187 | 6,269 | 64,327 |
| C | 23,623 | 6,917 | 73,832 |
| D | 15,144 | 6,488 | 67,038 |
| E | 13,944 | 6,330 | 67,074 |

Output tokens are relatively stable across configs (4.7K–6.9K), suggesting the LLM
generates similarly-sized components regardless of input context. Latency scales with
input size as expected. Config A is 40% faster than C.

### 3.4 Quality-per-Token Frontier

| Config | Fidelity / 1K input tokens |
|--------|---------------------------:|
| A | 2.755 |
| B | 0.438 |
| E | 0.139 |
| D | 0.117 |
| C | 0.082 |

Config A dominates the efficiency frontier by a factor of 6× over the nearest
competitor (B). Among the design-spec configs (C/D/E), E has the best ratio —
structure-only achieves equivalent fidelity to full-spec at 41% lower token cost.

---

## 4. Findings

### 4.1 Does design-stage context help at all? (A vs B)

**No, not universally.** Config A (baseline) outperforms Config B (planning context)
by 0.22 fidelity points overall. The planning-stage artifacts (ScreenPlan,
ComponentComposition) add 3.4K tokens but *reduce* quality. Two possible explanations:

1. **Context dilution:** The LLM's task description is already sufficient for component
   generation. Adding structural planning artifacts forces the model to reconcile two
   descriptions of the same screen, and any inconsistency between the natural-language
   task and the structured plan confuses the output.

2. **Prompt length sensitivity:** Longer prompts may reduce the model's focus on the
   core task instruction. The task description alone is a clear, concise directive.

### 4.2 Is full DesignSpec worth the tokens? (B vs C)

**Marginally, for MODIFY tasks.** B→C improves fidelity by 0.11 overall, but at 5.6×
the token cost. For MODIFY tasks specifically, the improvement is 0.23 points (2.33→2.56).
For NEW tasks, B and C are identical at 1.33 — the full design spec adds 11K tokens
with zero benefit.

### 4.3 Do narrowed slices preserve quality? (C vs D vs E)

**E (structure-only) preserves quality; D (labels-only) does not for MODIFY.**

- C→E gap: 0.00 overall, 0.00 for both NEW and MODIFY. Structure-only is equivalent
  to full DesignSpec everywhere, at 41% fewer tokens.
- C→D gap: 0.17 overall (≤0.3, within tolerance). But for MODIFY tasks specifically,
  the C→D gap is 0.33 (>0.3), exceeding the decision threshold. Labels-only loses
  critical structural information (parent/child relationships, layout nesting) that
  the implementer needs to understand existing component hierarchy when making
  modifications.

This finding is counterintuitive: structure-only (just parent/order/type/catalog)
outperforms labels-only (which additionally includes label, content, value, placeholder,
options). For brownfield tasks, knowing *where* a node lives in the tree matters more
than knowing *what* it says.

### 4.4 Does the answer differ between NEW and MODIFY?

**Yes, fundamentally.** The optimal strategy is task-type-dependent:

| Task type | Best config | Fidelity | Tokens | Recommendation |
|-----------|-------------|--------:|-------:|----------------|
| NEW | A (baseline) | 1.89 | 720 | No design context |
| MODIFY | C or E (tied) | 2.56 | 17,424 (E) | Structure-only |

For NEW tasks, every form of design context reduces quality. For MODIFY tasks, design
context (specifically the tree structure) improves quality by 0.34 fidelity points over
baseline. The implementer needs to understand existing layout to place new components
correctly but doesn't benefit from seeing what existing labels say.

---

## 5. Recommendation

**M4 should implement task-type-aware context routing:**

1. **`DesignSliceStrategy` for NEW tasks: `'none'`.** Do not include DesignSpec in the
   implementer prompt for greenfield tasks. The task description + ContractBundle slice
   (data model) is sufficient. This saves 10K–23K input tokens per call with no quality loss.

2. **`DesignSliceStrategy` for MODIFY tasks: `'structure-only'`.** Include
   `extractStructure(existingDesignSpec)` in the implementer prompt. This provides the
   tree skeleton (parent/order/type/catalog) which the implementer needs to understand
   where to place new components. Achieves equivalent quality to full DesignSpec at 44%
   lower token cost (17.4K vs 31.2K mean).

3. **Do not use `'labels-only'` for any task type.** Config D underperforms for MODIFY
   tasks and matches the lower-performing configs for NEW tasks. The labels-only slice
   strips structural information while retaining content that doesn't help code generation.

**Implementation in M4:**

```typescript
// In the M4 Implementer's context assembly
const sliceStrategy: DesignSliceStrategy =
  task.taskType === 'MODIFY' ? 'structure-only' : 'none';
```

The `ContextRefKind` extension from R9.3 already supports this — the `existingDesign`
context ref routes through `sliceContractBundle()` which accepts a `DesignSliceStrategy`.
M4 sets the strategy based on `taskType` rather than using a fixed default.

Formal decision record: [ADR-057](../../adrs/ADR-057-task-type-aware-design-slice-strategy.md).
Open caveats and M4 commitments: §9 below.

**Confidence: MEDIUM.** The effect direction is clear but effect sizes are modest.
Confidence would increase to HIGH with:
- A larger fixture set (15+ tasks across 3+ domains)
- Multi-model evaluation (Opus, GPT-4o, Gemini) to check model sensitivity
- Human reviewer calibration against LLM reviewer

**What would change this recommendation:**
- If a larger eval shows design context reliably improves NEW task fidelity above
  baseline, switch NEW to `'structure-only'` as well.
- If E and C diverge on more complex screens (>200 nodes), upgrade MODIFY to `'full'`.

---

## 6. Threats to Validity

1. **Small fixture set.** Six tasks (3 NEW, 3 MODIFY) from a single domain (personal
   expense tracker). Results may not generalize to dashboards, admin panels, or
   data-heavy applications with more complex component hierarchies.

2. **Single-model evaluation.** All cells run on Claude Sonnet 4.6 (Vertex AI). Other
   models may respond differently to design-spec context — some models may extract more
   value from labels-only slices, or may not suffer the context dilution observed in
   NEW tasks.

3. **LLM reviewer as ground truth.** The fidelity axis is scored by an LLM reviewer
   (same model family). This creates a potential circularity: the scorer and generator
   share training biases. Human scoring would provide an independent calibration point.
   Reviewer consistency was validated (max divergence = 0 across pilot repeat-scoring),
   but consistency is not the same as accuracy.

4. **Brownfield design pipeline limitation.** The MODIFY task delta fixtures were
   hand-crafted, not generated by the design pipeline. During R10 Phase A fixture
   preparation, the LLM regenerated entire screens instead of producing deltas when
   given brownfield change requests. This surfaced the need for M4's brownfield-aware
   design specialist — the eval's MODIFY results assume a correct delta is available,
   which is not yet the production reality.

5. **No deterministic compilation scoring.** The execution plan called for TypeScript
   compilation and AST prop extraction as a deterministic scoring axis. This was omitted
   due to the overhead of setting up a compilation environment for generated components
   that import from project-specific modules. The props axis relies solely on the LLM
   reviewer. A future iteration should add compilation verification.

6. **Context-dilution hypothesis is untested.** The finding that design context hurts
   NEW task quality is attributed to context dilution, but this is a hypothesis — not a
   measured mechanism. The actual cause could be prompt-length sensitivity, instruction
   interference from JSON blobs, or a reviewer artifact. Testing would require varying
   prompt length with content-free padding to isolate the length effect.

---

## 7. M4 Implementation Implications

1. **`DesignSliceStrategy` enum gains a `'none'` value.** Current enum is
   `'full' | 'labels-only' | 'structure-only'`. Add `'none'` to skip design-spec
   inclusion entirely. The Implementer checks `taskType` and selects strategy
   accordingly.

2. **`extractStructure()` is the production slice function.** Already implemented at
   `packages/agents-architect/src/design-slice/index.ts`. M4 imports it directly.
   `extractLabelsAndBindings()` is retained for future evaluation but not used in
   the default pipeline.

3. **Token budget is lower than projected.** R9.3 estimated 25–35K input ceiling for
   full DesignSpec. The recommended strategy uses 17.4K for MODIFY and 0.7K for NEW,
   well within the 76K ceiling with room for other context (task plan, code files, etc.).

4. **Regression scenario.** The six tasks in `design-info-value.yaml` serve as a
   regression suite. As the M4 Implementer evolves, re-running this scenario verifies
   no quality regression. The `groundTruthExpected` fields provide stable scoring
   anchors.

---

## 9. Open Caveats and M4 Follow-Throughs

This section records interpretive analysis and implementation commitments that
extend §6 (Threats to validity) and §7 (M4 implementation implications). Canonical
design decision: [ADR-057](../../adrs/ADR-057-task-type-aware-design-slice-strategy.md).

### 9.1 Mechanism hypothesis for the NEW-task surprise

Config A (baseline) scores 1.89 fidelity on NEW tasks; configs B–E all score 1.33 —
a 0.56-point regression on a 0–3 scale. Three mechanisms were considered:

1. **Constraint over-fitting (dominant hypothesis).** When unconstrained, the LLM
   produces React in patterns it is most fluent in. When given ScreenPlan +
   ComponentComposition (or beyond), it must translate prescribed structure into code;
   translation errors dominate. The Architect's plans are coherent enough that pure
   noise is unlikely, but prescribed structure may not be the most natural code structure.

2. **Noisy planning artifacts.** ScreenPlan and ComponentComposition may contain
   inconsistencies — components that do not map cleanly to the data model, conventions
   that conflict with shadcn idioms. Following an incoherent plan could produce worse
   code than ignoring it. Worth monitoring as the Architect matures.

3. **Scoring artifact.** Ground-truth descriptions may align more closely with how
   Sonnet writes unconstrained React than with plan-constrained output — penalizing
   B–E for being *different*, not worse. Human calibration would discriminate this
   from a real quality gap.

The context-dilution hypothesis in §4.1 is related but not measured directly. A future
M3.6 v2 could vary prompt length with content-free padding to isolate length effects.

### 9.2 The 1.33 plateau — do not over-read B/C/D/E ordering for NEW

For NEW tasks, configs B, C, D, and E all hit exactly 1.33 mean fidelity despite
very different context shapes (planning-only vs full spec vs labels-only vs
structure-only). Per-task breakdown shows zero variance in 24 of 36 cells for B–E.

**Implication:** The headline finding — A beats B–E for NEW — is robust. The
*relative ordering* of B/C/D/E for NEW is not informative. Do not infer that
structure-only is "less bad" than full-spec for NEW; all design context configs
appear to hit the same constraint-over-fitting failure mode.

Possible causes: 0–3 rubric coarseness, reviewer anchoring, or a real plateau once
any planning context is added. See [lessons-learned-rules.md](../../lessons-learned-rules.md)
(2026-05-17 entry on rubric plateaus).

### 9.3 MODIFY finding confidence

Structure-only (Config E) matching full DesignSpec (Config C) at 2.56 fidelity with
44% fewer tokens is the highest-confidence result in this eval. The mechanism is
intuitive: MODIFY tasks need to fit new code into existing structure; parent/order/type/catalog
signal placement without visual noise.

**Caveat:** The simplest MODIFY task (`cashpulse-transactions-list-modify-recurring-badge`,
+6 nodes) scores A=2.67 vs B/C/D/E=2.00 — baseline wins for trivial brownfield changes.
The MODIFY recommendation is carried by the two more complex tasks (+32 and +19 nodes).
Larger modifications (whole-section replacement, layout restructure) are unprobed;
those may need more than structure-only. M4 should ship structure-only as default but
instrument for underperformance (see §9.5).

### 9.4 M4 commitments (non-negotiable follow-throughs)

These three items must appear in the M4 execution plan as Phase-1 commitments:

1. **Routing must be explicit and tested.** Unit tests must assert: given a NEW task,
   no design-spec context appears in the implementer prompt; given a MODIFY task,
   `extractStructure(existingDesignSpec)` output is present. Without tests, a single
   config default can silently revert task-type-aware routing.

2. **Brownfield design specialist is mandatory.** This eval's MODIFY cells used
   hand-crafted `DesignSpecDelta` fixtures (§6.4), not pipeline-generated deltas.
   M4 must build a brownfield-aware design path that emits deltas instead of
   regenerating full screens when an existing spec is present (R9 §3, R10).

3. **Production instrumentation.** Per implementer invocation, log `taskType`,
   `DesignSliceStrategy` applied, and a quality proxy (compilation success, schema
   validation). If MODIFY tasks show higher failure rates than NEW in production,
   that is signal to revisit the structure-only default.

### 9.5 Conditions that would warrant M3.6 v2 (before widening scope pre-M4)

Do not expand the current 90-cell matrix before M4 ships. Run a focused M3.6 v2 only
if production instrumentation surfaces a specific gap. Candidate follow-ups:

| Trigger | M3.6 v2 change |
|---------|----------------|
| B/C/D/E plateau persists in production | Widen fidelity rubric to 0–5 or 0–10; add structural-match metric vs ground-truth tree |
| MODIFY failures on large deltas | Add MODIFY tasks with >50 node changes; compare structure-only vs full |
| Model upgrade (Sonnet 4.7, Opus) | Re-run matrix on same fixtures; check constraint-over-fitting sensitivity |
| Domain expansion | 15+ tasks across 3+ domains (not only CashPulse-style expense tracker) |
| Props axis distrust | Add `tsc` compilation scoring instead of LLM-judged props (planned in M3.6 execution plan, omitted) |

---

## 8. References

- R9 — Brownfield Design Delta Research Brief: `docs/research/briefs/R9-brownfield-design-delta.md`
- R9 Review: `docs/research/briefs/R9-brownfield-design-delta-review.md`
- R10 — Visual Delta Rendering: `docs/research/briefs/R10-visual-delta-rendering.md`
- M3.6 Execution Plan: `docs/plans/completed/chips-next-steps-m3/m3-6-execution-plan.md`
- Design slice functions: `packages/agents-architect/src/design-slice/index.ts`
- Eval runner: `scripts/run-design-info-eval.ts`
- Reviewer scorer: `scripts/run-design-info-reviewer.ts`
- Analysis tool: `scripts/analyze-design-info-eval.ts`
- Fixture YAML: `packages/eval/src/scenarios/design-info-value.yaml`
- Raw results: `packages/eval/results/m3-6/raw-results.json`
- Scored CSV: `packages/eval/results/m3-6/scored-results.csv`
- Reviewer scores: `packages/eval/results/m3-6/reviewer-scores.json`

---

## Appendix A: Per-Task Breakdown

### NEW Tasks

**cashpulse-dashboard-summary-card** (159 nodes)

| Config | F0 | F1 | F2 | Mean F | P0 | P1 | P2 | Mean P |
|--------|---:|---:|---:|-------:|---:|---:|---:|-------:|
| A | 3 | 2 | 2 | 2.33 | 3 | 3 | 3 | 3.00 |
| B | 2 | 2 | 2 | 2.00 | 3 | 3 | 3 | 3.00 |
| C | 2 | 2 | 2 | 2.00 | 3 | 3 | 3 | 3.00 |
| D | 2 | 2 | 2 | 2.00 | 3 | 3 | 3 | 3.00 |
| E | 2 | 2 | 2 | 2.00 | 3 | 3 | 3 | 3.00 |

Dashboard summary card: A slightly outperforms (2.33 vs 2.00). Props perfect across
all configs — this is a simple, well-specified component.

**cashpulse-transactions-list-page** (161 nodes)

| Config | F0 | F1 | F2 | Mean F | P0 | P1 | P2 | Mean P |
|--------|---:|---:|---:|-------:|---:|---:|---:|-------:|
| A | 2 | 2 | 2 | 2.00 | 3 | 3 | 3 | 3.00 |
| B | 1 | 1 | 1 | 1.00 | 2 | 2 | 2 | 2.00 |
| C | 1 | 1 | 1 | 1.00 | 2 | 2 | 2 | 2.00 |
| D | 1 | 1 | 1 | 1.00 | 2 | 2 | 2 | 2.00 |
| E | 1 | 1 | 1 | 1.00 | 2 | 2 | 2 | 2.00 |

Transactions list: A dramatically outperforms (2.00 vs 1.00 fidelity). Design context
consistently hurts for this complex page — possibly because the 161-node spec
overwhelms the implementer with layout details that don't map to React component
structure.

**cashpulse-settings-form** (62 nodes)

| Config | F0 | F1 | F2 | Mean F | P0 | P1 | P2 | Mean P |
|--------|---:|---:|---:|-------:|---:|---:|---:|-------:|
| A | 1 | 1 | 2 | 1.33 | 1 | 1 | 2 | 1.33 |
| B | 1 | 1 | 1 | 1.00 | 2 | 2 | 2 | 2.00 |
| C | 1 | 1 | 1 | 1.00 | 1 | 1 | 2 | 1.33 |
| D | 1 | 1 | 1 | 1.00 | 1 | 1 | 2 | 1.33 |
| E | 1 | 1 | 1 | 1.00 | 1 | 2 | 2 | 1.67 |

Settings form: Lowest scores overall. Even A only reaches 1.33. The category management
list with add/edit/delete is a complex interaction pattern that all configs struggle with.

### MODIFY Tasks

**cashpulse-dashboard-modify-add-recurring-card** (+32 nodes)

| Config | F0 | F1 | F2 | Mean F | P0 | P1 | P2 | Mean P |
|--------|---:|---:|---:|-------:|---:|---:|---:|-------:|
| A | 2 | 2 | 2 | 2.00 | 3 | 3 | 2 | 2.67 |
| B | 2 | 2 | 2 | 2.00 | 2 | 2 | 2 | 2.00 |
| C | 2 | 3 | 3 | 2.67 | 3 | 3 | 3 | 3.00 |
| D | 2 | 2 | 2 | 2.00 | 2 | 3 | 3 | 2.67 |
| E | 2 | 3 | 3 | 2.67 | 3 | 3 | 3 | 3.00 |

Recurring card: C and E outperform (2.67 vs 2.00 for A/B/D). The tree structure helps
the implementer understand where to insert the new card in the existing layout.

**cashpulse-add-expense-modify-recurrence-toggle** (+19 nodes)

| Config | F0 | F1 | F2 | Mean F | P0 | P1 | P2 | Mean P |
|--------|---:|---:|---:|-------:|---:|---:|---:|-------:|
| A | 2 | 2 | 2 | 2.00 | 3 | 3 | 2 | 2.67 |
| B | 3 | 3 | 3 | 3.00 | 3 | 3 | 3 | 3.00 |
| C | 3 | 3 | 3 | 3.00 | 3 | 3 | 3 | 3.00 |
| D | 2 | 3 | 3 | 2.67 | 2 | 3 | 3 | 2.67 |
| E | 3 | 3 | 3 | 3.00 | 3 | 3 | 3 | 3.00 |

Recurrence toggle: B, C, and E all achieve perfect 3.00 fidelity. Planning context
alone suffices here — the form extension is well-specified in the task description +
screen plan. D slightly underperforms (2.67).

**cashpulse-transactions-list-modify-recurring-badge** (+6 nodes)

| Config | F0 | F1 | F2 | Mean F | P0 | P1 | P2 | Mean P |
|--------|---:|---:|---:|-------:|---:|---:|---:|-------:|
| A | 3 | 3 | 2 | 2.67 | 3 | 3 | 3 | 3.00 |
| B | 2 | 2 | 2 | 2.00 | 3 | 3 | 3 | 3.00 |
| C | 2 | 2 | 2 | 2.00 | 3 | 3 | 3 | 3.00 |
| D | 2 | 2 | 2 | 2.00 | 3 | 3 | 3 | 3.00 |
| E | 2 | 2 | 2 | 2.00 | 3 | 3 | 3 | 3.00 |

Recurring badge: A outperforms (2.67 vs 2.00). This is the simplest MODIFY task —
adding a small badge to existing rows. The LLM handles it well from task description
alone; design context may over-specify the approach.

---

## Appendix B: Raw Token Statistics

Total input tokens consumed across all 90 cells: 1,037,583.
Total output tokens generated: 533,037.
Total wall clock time: 5,590 seconds (~93 minutes).
Mean latency per cell: 62.1 seconds.
Zero failures out of 90 cells.
Model: Claude Sonnet 4.6 (claude-sonnet-4-6, Vertex AI us-east5).
