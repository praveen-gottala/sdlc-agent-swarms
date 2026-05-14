# Option 1: Validate Scenarios Against Real Pipeline Data

## The Problem This Solves

The worked examples in `chips-next-steps/execution-plan.md` show handwritten pipeline output — what we *assumed* the pipeline produces for an expense tracker app. But we already have real pipeline output in `fixtures/personal-expense-tracker/` that we should use instead.

**Real data already available:**
- `agentforge/spec/pages.yaml` — 5 real screens (dashboard, add-expense, spending-insights, settings, confirm-delete) with routes, 14+ components each, navigation targets, screen types
- `agentforge/spec/models.yaml` — 8 real entities (Expense 10 fields, Category 9, Budget 7, etc.)
- `agentforge/spec/api.yaml` — 19 real API endpoints
- `agentforge/designs/dashboard/research-brief.json` — real Research stage output (24 design constraints, 12 reference patterns, 17 a11y requirements)
- `agentforge/designs/dashboard/planning-spec.json` — real Planning stage output (34 component nodes, 99 token bindings)
- `agentforge/designs/dashboard/scripts/designspec-v2.json` — real Design stage output
- `docs/prd.md` — the original PRD string that started it all ("CashPulse")

The scenarios should be grounded in this real data, not in invented examples. The additional question is: what would the Clarifier add on top of what the existing pipeline already produces?

## How It Works

### Step 1: Run the Clarifier on the actual prompt

```bash
# From monorepo root, invoke the Clarifier pipeline with the expense tracker prompt
npx tsx packages/cli/dist/bin.js clarifier:run \
  --input "I want an app to track daily expenses, split bills with roommates, set monthly budgets, and see spending reports" \
  --mode bootstrap \
  --max-rounds 2 \
  --output /tmp/clarifier-expense-tracker
```

This produces real `EnrichedRequirement`, `FeaturePlan`, and `AssumptionLedger` JSON files.

### Step 2: Capture and diff against scenario claims

For each claim in Scenario 1, verify against actual output:

| Scenario claim | What to check in actual output | Verification command |
|---|---|---|
| "Screens: `[dashboard, expense-entry, split-detail, budget-overview, reports, settings]`" | `jq '.prd.screens[].name' output.json` | Do all 6 screens appear? Are names similar? |
| "Each with `screenType: 'page'`" | `jq '.prd.screens[].screenType' output.json` | Does every screen have a screenType, or are some null? |
| "Data entities: `[Expense{amount,category,date,paidBy}, ...]`" | `jq '.prd.dataEntities[] | {name, fields: [.fields[].name]}' output.json` | Do entity names match? Do field names match? |
| "Features: 8 features with must-have/should-have priorities" | `jq '.prd.features | length' output.json` and `jq '.prd.features[].priority' output.json` | How many features? What priority distribution? |
| "Gap Detector identifies: unequal shares, per-category budget" | Read the gap detector's output gaps | Did these specific gaps appear? |
| "FeaturePlan with feature DAG" | `jq '.features[].dependencies' featurePlan.json` | Are dependencies populated or empty arrays? |

### Step 3: Revise scenarios to match reality

For each mismatch, decide:

- **Minor name difference** (e.g., "expense-list" vs "expense-entry"): Update scenario to use actual names. No architectural impact.
- **Missing field** (e.g., `screenType` is null on some screens): This is an architectural finding — the Research stage or Architect Node 1 must handle missing screenType. Document the gap and add a backfill strategy.
- **Structural difference** (e.g., feature DAG has no dependencies): This changes the Architect's Task Planner design — it can't rely on the feature DAG for task ordering if the Clarifier doesn't produce one. Major finding worth a paragraph.

### Example: What a mismatch looks like

**Scenario says:**
```
Data entities: [Expense{amount, category, date, paidBy}, Category{name, icon, budget}]
```

**Actual Clarifier output:**
```json
{
  "dataEntities": [
    { "name": "Expense", "fields": [
      { "name": "amount", "type": "number", "required": true },
      { "name": "description", "type": "string" },
      { "name": "date", "type": "date", "required": true },
      { "name": "category", "type": "string" }
    ]},
    { "name": "User", "fields": [
      { "name": "name", "type": "string", "required": true },
      { "name": "email", "type": "string", "required": true }
    ]}
  ]
}
```

**Findings:**
1. `paidBy` field is missing — the Clarifier didn't infer bill-splitting from the prompt alone. The gap detector should ask about this.
2. `Category` entity is missing — the Clarifier put `category` as a string field on `Expense`, not as a separate entity. The Architect's data model specialist would need to normalize this.
3. `User` entity appeared that the scenario didn't predict. The Clarifier is more thorough than the scenario assumed.
4. `Budget` entity is missing — the Clarifier may not have produced it in round 1 (depends on gap detection).

**These findings are gold.** They show exactly where the Architect stage needs to do refinement work, not just pass-through work. The scenario gets rewritten to show the actual Clarifier output, and the Architect section explains how each gap is addressed.

## Incremental Implementation

| Step | What | Effort | Risk |
|------|------|--------|------|
| 1 | Run Clarifier on expense tracker prompt | 10 min | Low — may need API keys configured |
| 2 | Capture output, diff against scenario claims | 30 min | None — read-only analysis |
| 3 | Run Clarifier on brownfield prompt (budget addition) | 10 min | Low — needs existing project fixture |
| 4 | Revise Scenario 1 with actual data | 1-2 hours | Low — editorial changes |
| 5 | Revise Scenario 2 with actual evolution-mode output | 1-2 hours | Medium — evolution mode may have different gaps than assumed |
| 6 | Document mismatches as architectural findings | 1 hour | None — pure documentation |
| 7 | Update Architect node descriptions to handle real edge cases | 1-2 hours | Medium — may change Node 4 specialist design |

**Total: ~1 day. Can be split across sessions.**

## When to Use This Option

- When accuracy of the scenarios is more important than speed of delivery
- When you plan to use the scenarios as acceptance criteria for the Architect implementation
- When the document will be shown to leadership or external reviewers who will ask "did you actually test this?"

## When NOT to Use This Option

- If the scenarios are conceptual illustrations, not specifications
- If the Clarifier's output format is likely to change before the Architect is built (the verification would be stale)
- If API costs or environment setup make running the Clarifier impractical right now

## What This Option Does NOT Cover

- It validates the Clarifier's output but not the Architect's behavior (the Architect doesn't exist yet)
- It doesn't verify the brownfield design-delta concept (no existing DesignSpec v2 to modify against)
- It doesn't verify the orchestrator/task-dispatcher behavior (not built)

Those gaps are addressed by Options 2 and 3.
