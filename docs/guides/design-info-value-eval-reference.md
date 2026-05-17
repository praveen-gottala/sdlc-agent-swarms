# Design Info Value Eval — Configuration Reference

What each eval configuration feeds to the LLM, shown with real values from the CashPulse dashboard task. All examples come from the "Build a dashboard summary card" task (`cashpulse-dashboard-summary-card`).

> Back to main guide: [Design Info Value Eval](design-info-value-eval.md)

## Config A: Baseline (746 tokens)

The LLM receives the task description and a data model — entity names with typed fields. Nothing about how the screen looks or which components to use.

**Task description (verbatim):**

> Build a React/TypeScript dashboard summary card component for CashPulse, a personal expense tracker. The card displays the current month's spending summary: total spent, budget remaining, daily average, and budget status indicator. Uses MonthSummary entity data and renders inside the dashboard layout's left column.

**Data model (from `contractBundleSlice.dataModel`):**

```yaml
entities:
  - name: Expense
    fields:
      - { name: id, type: string }
      - { name: amount, type: number }
      - { name: description, type: string }
      - { name: categoryId, type: reference }
      - { name: date, type: date }
      - { name: paymentMethod, type: enum }

  - name: MonthSummary
    fields:
      - { name: month, type: string }
      - { name: totalSpent, type: number }
      - { name: transactionCount, type: number }
      - { name: dailyAverage, type: number }
      - { name: budgetLimit, type: number }
      - { name: budgetStatus, type: enum }
      - { name: remainingAmount, type: number }

  - name: Budget
    fields:
      - { name: id, type: string }
      - { name: monthlyLimit, type: number }
      - { name: currency, type: enum }
```

This is all Config A gets. The LLM knows the data shapes but makes its own decisions about layout, components, and visual design.

Source: `packages/eval/src/scenarios/design-info-value.yaml`

---

## Config B: Planning context (4,187 tokens)

Adds two artifacts produced by the Architect stage. These tell the LLM which components to build and what data they consume — but not how they should look.

**Screen Plan** — the list of components on this screen, with data-to-API bindings:

```json
{
  "id": "screen-001",
  "screenType": "page",
  "route": "/",
  "components": [
    "dashboard-page", "top-nav-bar", "cashpulse-logo",
    "nav-tabs", "month-navigator", "settings-trigger",
    "dashboard-layout", "budget-summary-card",
    "budget-status-badge", "budget-amount-display",
    "budget-progress-bar", "category-donut-chart-card",
    "recent-expenses-list", "expense-row"
  ],
  "dataBindings": [
    {
      "entityId": "entity-month-summary",
      "field": "totalSpent",
      "source": "/api/month-summary/{month}",
      "transform": "selectedMonth param injected from MonthNavigator state"
    }
  ]
}
```

**Component Composition** — the component tree with TypeScript prop signatures:

```json
{
  "screenId": "screen-001",
  "componentTree": [
    {
      "id": "dashboard-page",
      "type": "DashboardPage",
      "children": ["top-nav-bar", "dashboard-layout"],
      "props": {
        "selectedMonth": "string",
        "onMonthChange": "(month: string) => void"
      }
    },
    {
      "id": "budget-summary-card",
      "type": "BudgetSummaryCard",
      "children": ["budget-amount-display", "budget-progress-bar", "budget-status-badge"],
      "props": {
        "totalSpent": "number",
        "budgetLimit": "number",
        "remainingAmount": "number",
        "budgetStatus": "BudgetStatus"
      }
    }
  ]
}
```

Now the LLM knows that `BudgetSummaryCard` takes `totalSpent: number` and has three children. But it still doesn't know the visual layout.

Source: `fixtures/personal-expense-tracker/agentforge/architect-output/screen-plans.json` and `component-compositions.json`

---

## Config C: Full design specification (23,623 tokens)

Adds the complete `DesignSpecV2` — a flat map of every UI node on the screen. Each node specifies its position in the tree, layout rules, colors, typography, and spacing. The dashboard spec has **159 nodes**.

**Three representative nodes:**

```json
{
  "root": {
    "parent": null,
    "order": 0,
    "type": "page",
    "width": 1440,
    "layout": { "dir": "column", "gap": 0 },
    "background": "background-primary"
  },

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
  },

  "home-tab-item": {
    "parent": "nav-tabs",
    "order": 0,
    "type": "text",
    "content": "Home",
    "typography": "label",
    "weight": 600,
    "color": "cta-primary",
    "overrides": {
      "borderBottom": "2px solid var(--cta-primary)",
      "paddingBottom": "8px"
    }
  }
}
```

Every node has `parent` (where it sits in the tree) and `order` (its position among siblings). Beyond that, nodes carry visual details: `background`, `shadow`, `radius`, `typography`, `color`, `weight`, `layout` (flex direction, gap, padding). This is the most expensive config — 23K tokens for one screen.

Source: `fixtures/personal-expense-tracker/agentforge/designs/dashboard.json`
Type definition: `packages/designspec-renderer/src/types/design-spec-v2.ts`

---

## Config D: Labels-only slice (15,144 tokens)

The `extractLabelsAndBindings()` function strips visual properties but keeps text content. The LLM knows WHAT things say but loses HOW they look.

**The same three nodes after slicing:**

```json
{
  "root": {
    "parent": null,
    "order": 0,
    "type": "page"
  },

  "budget-summary-card": {
    "parent": "left-column",
    "order": 0,
    "catalog": "Section",
    "label": "Monthly Budget"
  },

  "home-tab-item": {
    "parent": "nav-tabs",
    "order": 0,
    "type": "text",
    "content": "Home"
  }
}
```

**What's kept:** `parent`, `order`, `type`, `catalog`, `label`, `content`, `value`, `placeholder`, `options`, `navigateTo`, `items`

**What's dropped:** `layout`, `width`, `height`, `typography`, `color`, `weight`, `background`, `shadow`, `radius`, `overrides`

Function: `extractLabelsAndBindings()` in `packages/agents-architect/src/design-slice/index.ts`

---

## Config E: Structure-only slice (13,944 tokens)

The `extractStructure()` function strips everything except the tree skeleton. The LLM knows WHERE things are but not WHAT they say or HOW they look.

**The same three nodes after slicing:**

```json
{
  "root": {
    "parent": null,
    "order": 0,
    "type": "page"
  },

  "budget-summary-card": {
    "parent": "left-column",
    "order": 0,
    "catalog": "Section"
  },

  "home-tab-item": {
    "parent": "nav-tabs",
    "order": 0,
    "type": "text"
  }
}
```

**What's kept:** `parent`, `order`, `type`, `catalog` — only four fields.

**What's dropped:** everything else, including `label` and `content`.

Function: `extractStructure()` in `packages/agents-architect/src/design-slice/index.ts`

---

## Side-by-side comparison

Using `budget-summary-card` — a card container labeled "Monthly Budget":

| Field | Full (C) | Labels (D) | Structure (E) |
|-------|:--------:|:----------:|:--------------:|
| `parent: "left-column"` | yes | yes | yes |
| `order: 0` | yes | yes | yes |
| `catalog: "Section"` | yes | yes | yes |
| `label: "Monthly Budget"` | yes | yes | — |
| `width: "fill"` | yes | — | — |
| `background: "surface-primary"` | yes | — | — |
| `shadow: "sm"` | yes | — | — |
| `radius: 16` | yes | — | — |
| `layout: { dir: "column", ... }` | yes | — | — |

Config D keeps 4 fields (tree position + label). Config E keeps 3 fields (tree position only). Config C keeps all 9.

The eval found that for MODIFY tasks, Configs C and E produce the same quality code. The label ("Monthly Budget") and visual details (shadow, radius, background) don't help the LLM generate correct React components — knowing where this card sits in the tree is what matters.

---

## MODIFY tasks: the design delta

MODIFY tasks additionally receive a `DesignSpecDelta` — a description of what changed from the pre-change to the post-change spec. The eval runner applies `deltaApply(existingSpec, delta)` to produce the post-change spec that configs C/D/E slice from.

**Example: adding a recurring expenses card to the dashboard**

```json
{
  "screenId": "dashboard",
  "baseWidth": 1440,
  "added": {
    "recurring-card": {
      "parent": "left-column",
      "order": 1,
      "type": "container",
      "width": "fill",
      "background": "surface-primary",
      "shadow": "sm",
      "radius": 16,
      "layout": { "dir": "column", "gap": 12, "px": 24, "py": 24 }
    },
    "recurring-card-title": {
      "parent": "recurring-card-header",
      "order": 0,
      "type": "text",
      "content": "Upcoming Recurring",
      "typography": "label",
      "weight": 600,
      "color": "text-primary"
    }
  },
  "modified": {},
  "removed": [],
  "reordered": [
    { "nodeId": "category-donut-card", "newOrder": 2 }
  ]
}
```

This delta adds 32 new nodes (recurring card with its rows) and shifts the donut chart card down to make room. The pre-change spec has 159 nodes; post-change has 191.

Source: `fixtures/personal-expense-tracker/agentforge/deltas/dashboard-add-recurring-card.delta.json`
Type: `packages/designspec-renderer/src/renderer/delta/delta-types.ts`

---

## File locations

| Artifact | Path |
|----------|------|
| Task definitions | `packages/eval/src/scenarios/design-info-value.yaml` |
| Dashboard design spec | `fixtures/personal-expense-tracker/agentforge/designs/dashboard.json` |
| Screen plans | `fixtures/personal-expense-tracker/agentforge/architect-output/screen-plans.json` |
| Component compositions | `fixtures/personal-expense-tracker/agentforge/architect-output/component-compositions.json` |
| Delta fixtures | `fixtures/personal-expense-tracker/agentforge/deltas/*.delta.json` |
| Slice functions | `packages/agents-architect/src/design-slice/index.ts` |
| DesignSpecV2 type | `packages/designspec-renderer/src/types/design-spec-v2.ts` |
| DesignSpecDelta type | `packages/designspec-renderer/src/renderer/delta/delta-types.ts` |
| Reviewer rubric | `packages/eval/src/scoring/design-info-reviewer-prompt.md` |
| Eval runner | `scripts/run-design-info-eval.ts` |
| Reviewer scorer | `scripts/run-design-info-reviewer.ts` |
| Analysis tool | `scripts/analyze-design-info-eval.ts` |
| Raw results | `packages/eval/results/m3-6/raw-results.json` |
| Scored CSV | `packages/eval/results/m3-6/scored-results.csv` |
