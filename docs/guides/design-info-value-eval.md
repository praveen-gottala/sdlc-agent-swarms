# Design Info Value Eval

!!! info "TL;DR"

    For **NEW** tasks (building from scratch), skip design context — the LLM writes better code from just the task description. For **MODIFY** tasks (changing existing screens), include only the component tree skeleton — same quality as the full design spec at 44% fewer tokens.

> Authoritative source: [R9.4 Eval Brief](../research/briefs/R9_4-design-info-value-eval.md)

## The question

CHIP's Implementer generates React components from a prompt. Earlier pipeline stages produce design artifacts: screen layouts, component trees, full visual specifications. The question: **does feeding these artifacts to the Implementer actually improve the code it writes?**

## What we tested

We ran six CashPulse tasks through five configurations, each adding more design context to the LLM's prompt. Three repetitions per cell = 90 total LLM calls.

### What every config receives (the fixed part)

Every config gets the same **system prompt** — this tells the LLM which component library and language to use. It's not part of the experiment; it's the constant:

```
You are implementing a React/TypeScript component for a frontend task.

Requirements:
- Use TypeScript with React functional component syntax
- Import from shadcn/ui for UI primitives (button, input, card, badge, etc.)
- Use the data bindings and prop names specified in the context exactly
- Do not invent fields, props, or API shapes not present in the context
```

So the LLM always knows: React, TypeScript, shadcn/ui. What **varies** across configs is how much design context appears in the user message alongside the task description.

### What varies: the five context configurations

Each config below shows exactly what the LLM receives in addition to the system prompt, using real values from the "Build a dashboard summary card" task.

### Config A — Baseline (746 tokens)

The LLM gets the task description and a **ContractBundle** — a list of data entities with their typed fields. This is the minimum: the LLM knows which data exists but makes all layout and component decisions itself.

```yaml
# ContractBundle: data model entities
entities:
  - name: MonthSummary
    fields:
      - { name: totalSpent, type: number }
      - { name: budgetStatus, type: enum }
      - { name: remainingAmount, type: number }
      - { name: dailyAverage, type: number }
  - name: Expense
    fields:
      - { name: amount, type: number }
      - { name: categoryId, type: reference }
      - { name: date, type: date }
```

### Config B — Planning (4,187 tokens)

Adds two artifacts from the Architect stage:

**ScreenPlan** — which components belong on this screen and how they bind to API data:

```json
{
  "id": "screen-001",
  "screenType": "page",
  "route": "/",
  "components": ["budget-summary-card", "category-donut-chart-card",
                  "recent-expenses-list", "expense-row"],
  "dataBindings": [{
    "entityId": "entity-month-summary",
    "field": "totalSpent",
    "source": "/api/month-summary/{month}"
  }]
}
```

**ComponentComposition** — the component tree with TypeScript prop types:

```json
{
  "screenId": "screen-001",
  "componentTree": [{
    "id": "budget-summary-card",
    "type": "BudgetSummaryCard",
    "children": ["budget-amount-display", "budget-progress-bar"],
    "props": {
      "totalSpent": "number",
      "budgetLimit": "number",
      "budgetStatus": "BudgetStatus"
    }
  }]
}
```

Now the LLM knows `BudgetSummaryCard` takes `totalSpent: number` and has two children. But it still doesn't know the visual layout.

### Config C — Full DesignSpec (23,623 tokens)

Adds the complete **DesignSpecV2** — a flat map of every UI node on the screen (159 nodes for the dashboard). Each node has its tree position, layout rules, and visual properties:

```json
"budget-summary-card": {
  "parent": "left-column",
  "order": 0,
  "catalog": "Section",
  "label": "Monthly Budget",
  "width": "fill",
  "background": "surface-primary",
  "shadow": "sm",
  "radius": 16,
  "layout": { "dir": "column", "gap": 16, "px": 24, "py": 24 }
}
```

This is the most expensive config — the LLM sees every pixel-level detail.

### Config D — Labels-only (15,144 tokens)

Same DesignSpec, but `extractLabelsAndBindings()` strips visual properties. The LLM knows **what things say** but not how they look:

```json
"budget-summary-card": {
  "parent": "left-column",
  "order": 0,
  "catalog": "Section",
  "label": "Monthly Budget"
}
```

Dropped: `width`, `background`, `shadow`, `radius`, `layout`.

### Config E — Structure-only (13,944 tokens)

`extractStructure()` strips everything except the tree skeleton. The LLM knows **where things are** but not what they say or how they look:

```json
"budget-summary-card": {
  "parent": "left-column",
  "order": 0,
  "catalog": "Section"
}
```

Dropped: everything except `parent`, `order`, `type`, `catalog`.

### Summary table

| Config | What it adds | Key example | Tokens |
|--------|-------------|-------------|-------:|
| **A** | Data model | `MonthSummary.totalSpent: number` | 746 |
| **B** | Screen plan + component tree | `BudgetSummaryCard { totalSpent: number }` | 4,187 |
| **C** | Full visual spec (159 nodes) | `background: "surface-primary", shadow: "sm"` | 23,623 |
| **D** | Spec stripped to content | `label: "Monthly Budget"` | 15,144 |
| **E** | Spec stripped to tree skeleton | `parent: "left-column", order: 0` | 13,944 |

For expanded examples with more nodes, see the [Configuration Reference](design-info-value-eval-reference.md).

### The six tasks

| Task | Type | What the Implementer builds | Nodes |
|------|------|-----------------------------|------:|
| Dashboard summary card | NEW | Spending summary with 4 metrics | 159 |
| Transactions list page | NEW | Category breakdown with filters | 161 |
| Settings form | NEW | Currency, budget, category management | 62 |
| Add recurring card | MODIFY | New card into existing dashboard | 159 → 191 |
| Recurrence toggle | MODIFY | Toggle + date fields into existing form | 157 → 176 |
| Recurring badge | MODIFY | Frequency pills into existing rows | 159 → 165 |

### How scoring works

A single-blind LLM reviewer (temperature 0) scores each output on two axes. The reviewer sees only the code and ground truth — not which config produced it.

- **Fidelity (0-3):** Does the layout match? 0 = wrong layout, 1 = recognizable but flawed, 2 = minor issues, 3 = faithful match.
- **Props (0-3):** Are bindings correct? 0 = won't compile, 1 = most props missing, 2 = mostly right, 3 = all correct.

??? info "Detailed scoring rubric"

    **Fidelity (0-3)** — visual match to the design:

    | Score | Meaning |
    |------:|---------|
    | 0 | Wrong components, wrong layout, missing major sections |
    | 1 | Recognizable structure but multiple major fidelity issues |
    | 2 | Matches design with minor issues (spacing, label wording) |
    | 3 | Faithful match — components, layout, labels, bindings all correct |

    **Props (0-3)** — data binding correctness:

    | Score | Meaning |
    |------:|---------|
    | 0 | Does not compile or no props declared |
    | 1 | Compiles but >=50% of expected props missing or misnamed |
    | 2 | Compiles, props mostly correct, >=1 data binding uses wrong field |
    | 3 | All props match, all data bindings use correct field names |

    Source: `packages/eval/src/scoring/design-info-reviewer-prompt.md`

## Results

### NEW tasks: less context = better code

| Config | Fidelity (0-3) | Props (0-3) | Input tokens |
|--------|---------------:|------------:|-------------:|
| **A** Baseline | **1.89** | **2.44** | **720** |
| **B** Planning | 1.33 | 2.33 | 5,103 |
| **C** Full spec | 1.33 | 2.11 | 16,000 |
| **D** Labels-only | 1.33 | 2.11 | 11,123 |
| **E** Structure-only | 1.33 | 2.22 | 10,464 |

Adding **any** design context drops fidelity by 0.56 points. The LLM generates better React components from the task description alone than when constrained by a prescribed design structure. The likely mechanism: design specs force the LLM to translate a visual layout into code patterns, and the translation introduces errors that wouldn't exist if the LLM used its own idiomatic patterns.

### MODIFY tasks: tree structure is what matters

| Config | Fidelity (0-3) | Props (0-3) | Input tokens |
|--------|---------------:|------------:|-------------:|
| **A** Baseline | 2.22 | 2.78 | 772 |
| **B** Planning | 2.33 | 2.67 | 3,271 |
| **C** Full spec | **2.56** | **3.00** | 31,245 |
| **D** Labels-only | 2.22 | 2.78 | 19,165 |
| **E** Structure-only | **2.56** | **3.00** | **17,424** |

For MODIFY tasks, the tree skeleton alone (Config E) matches the full spec (Config C) at **44% fewer tokens**. What matters is knowing WHERE components sit in the tree — not their visual styling. Labels-only (Config D) drops to baseline because it tells the LLM what things *say* but not where they *are*.

Consider this node from the dashboard — a tab labeled "Home":

| What the LLM sees | Config C (full) | Config D (labels) | Config E (structure) |
|--------------------|:-:|:-:|:-:|
| It's a text node under nav-tabs at position 0 | yes | yes | yes |
| Its content is "Home" | yes | yes | — |
| Its font weight is 600 | yes | — | — |
| Its color is cta-primary | yes | — | — |
| Its bottom border style | yes | — | — |

For MODIFY tasks, Config E (just the first row) tells the Implementer enough to place new components correctly. Config D adds the label (row 2) but that doesn't help with placement. Config C adds visual details (rows 3-5) that are irrelevant for code structure.

### Efficiency: baseline dominates

| Config | Fidelity per 1K input tokens |
|--------|-----------------------------:|
| A | 2.76 |
| B | 0.44 |
| E | 0.14 |
| D | 0.12 |
| C | 0.08 |

Config A produces 6x more quality per token than the nearest competitor.

## Recommendation

Task-type-aware routing for M4's Implementer:

- **NEW tasks:** `DesignSliceStrategy = 'none'` — skip design-spec context entirely
- **MODIFY tasks:** `DesignSliceStrategy = 'structure-only'` — include tree skeleton of existing spec

```typescript
const sliceStrategy: DesignSliceStrategy =
  task.taskType === 'MODIFY' ? 'structure-only' : 'none';
```

This uses `extractStructure()` from `packages/agents-architect/src/design-slice/index.ts`. The `ContextRefKind` extension from R9.3 already supports this routing — the Implementer reads `taskType` and selects strategy.

## Challenging the results

**Confidence: MEDIUM.** The direction is clear but four challenges could narrow or shift the findings.

### 1. The 1.33 plateau suggests rubric coarseness

For NEW tasks, configs B-E all score exactly 1.33. Per-task breakdown shows zero variance in 24 of 36 cells:

| NEW task | B | C | D | E |
|----------|---|---|---|---|
| Dashboard (3 reps) | 2, 2, 2 | 2, 2, 2 | 2, 2, 2 | 2, 2, 2 |
| Transactions (3 reps) | 1, 1, 1 | 1, 1, 1 | 1, 1, 1 | 1, 1, 1 |
| Settings (3 reps) | 1, 1, 1 | 1, 1, 1 | 1, 1, 1 | 1, 1, 1 |

The 0-3 scale can't distinguish between 4K and 24K tokens of context. A finer rubric (0-10) might reveal differences hidden by coarseness.

### 2. Ground truth and reviewer bias

The `groundTruthExpected` descriptions may align more closely with how Sonnet naturally writes unconstrained React (Config A) than plan-constrained output — penalizing B-E for being *different*, not worse. Additionally, Sonnet 4.6 both generates and scores the output, potentially preferring its own unconstrained patterns.

### 3. Simplest MODIFY task contradicts the trend

The recurring-badge task (adding 6 nodes) scores A=2.67 vs B/C/D/E=2.00. Baseline *wins* for the simplest brownfield change. The "MODIFY benefits from context" finding is carried by the two more complex tasks (+32 and +19 nodes).

### 4. No compilation + small sample

The props axis is LLM-assessed, not `tsc`-verified. And with 9 cells per (config x taskType) — all CashPulse, all Sonnet 4.6 — confidence intervals on 0.34-0.56 effect sizes are wide.

## How to reproduce

### Prerequisites

- Vertex AI credentials: `ANTHROPIC_VERTEX_PROJECT_ID` and `CLOUD_ML_REGION=us-east5`
- Packages built: `nx run-many -t build`
- Fixture YAML: `packages/eval/src/scenarios/design-info-value.yaml` (6 tasks with `groundTruthExpected`)

### 1. Run the 90-cell matrix

```bash
CLOUD_ML_REGION=us-east5 npx tsx scripts/run-design-info-eval.ts \
  --config all --task all --reps 3
```

~93 minutes, ~$5-10 on Vertex AI. Checkpoints after each cell — restart the same command to resume.

### 2. Score outputs

```bash
CLOUD_ML_REGION=us-east5 npx tsx scripts/run-design-info-reviewer.ts
```

~8 minutes. Add `--consistency` to validate reviewer agreement first.

### 3. Generate analysis

```bash
npx tsx scripts/analyze-design-info-eval.ts
```

Outputs `packages/eval/results/m3-6/scored-results.csv` plus `raw-results.json` and `reviewer-scores.json`.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| 404 on Vertex AI | Wrong model ID | Use `claude-sonnet-4-6`, not `claude-sonnet-4-20250514` |
| Auth failure | Missing Vertex config | Set `ANTHROPIC_VERTEX_PROJECT_ID` + `CLOUD_ML_REGION=us-east5` |
| Reviewer scores diverge | Stale results | Re-run reviewer with `--consistency` flag |
| Matrix fails mid-run | Transient API error | Re-run same command — checkpointing skips completed cells |

## What's next

- [Configuration Reference](design-info-value-eval-reference.md) — what each config contains, with JSON examples
- [R9.4 Eval Brief](../research/briefs/R9_4-design-info-value-eval.md) — full data tables, per-task breakdowns, §9 open caveats and M4 follow-throughs
- [ADR-057](../adrs/ADR-057-task-type-aware-design-slice-strategy.md) — accepted default: `'none'` for NEW, `'structure-only'` for MODIFY
- [CHIP's Next Steps M4 plan](../plans/active/chips-next-steps/execution-plan.md) — implements task-type-aware routing
