---
version: 1.0.0
purpose: Scoring rubric for M3.6 Design Info Value Eval
---

# Design Info Value Eval — Scoring Rubric

Three-axis scoring for the M3.6 eval matrix. Each cell (config × task × rep)
produces one score per axis.

## Axis 1: Visual Fidelity (0-3)

Scored by a fresh-context LLM reviewer using `design-info-reviewer-prompt.md`.
The reviewer receives only the generated code and the ground-truth DesignSpec —
NOT the configuration label or task type. Single-blind by construction.

| Score | Criterion |
|-------|-----------|
| **0** | Wrong components, wrong layout, missing major sections. The generated code does not resemble the target design. |
| **1** | Recognizable structure but multiple major fidelity issues. Some correct components placed in approximately the right location, but significant sections missing or duplicated. |
| **2** | Matches DesignSpec with minor issues. Correct component types and layout structure; deviations limited to spacing, label wording differences, or minor styling. |
| **3** | Faithful match. Components, layout, labels, and data bindings all match the DesignSpec. A visual diff would show only cosmetic differences. |

## Axis 2: Prop & Binding Correctness (0-3)

Deterministic scoring. Run TypeScript compilation against project tsconfig;
AST-extract prop usage; compare against entity field names from the contract
bundle slice.

| Score | Criterion |
|-------|-----------|
| **0** | Does not compile. TypeScript errors prevent analysis. |
| **1** | Compiles but ≥50% of expected props are missing or misnamed. Data bindings reference fields not present in the entity definitions. |
| **2** | Compiles, props mostly correct. At least one data binding uses the wrong entity field name (e.g., `expense.description` instead of `expense.merchantName`). |
| **3** | Compiles, all props match the component composition, all data bindings use the correct entity field names from the contract bundle slice. |

## Axis 3: Token Cost (raw)

Input tokens consumed by the configuration. Read directly from the API response
`usage.input_tokens` field. Reported as raw numbers — not scored on a 0-3 scale.

Used for the quality-per-token frontier analysis (Section 3.4 of the eval brief):
fidelity gained per 1K additional input tokens across configurations.

## How to Score

1. The reviewer prompt is fixed across all cells — never modified per-config.
2. The reviewer receives ONLY the generated code and the ground-truth DesignSpec.
   It does NOT receive: the configuration label (A/B/C/D/E), the task type
   (NEW/MODIFY), the task description, or any intermediate context.
3. Reviewer temperature is 0 for maximum consistency.
4. Each cell is scored independently — the reviewer has no memory between cells.
5. Prop scoring is deterministic: compile check + AST field extraction.
   No LLM involvement on this axis.

## Inter-Rater Reliability Check

During the Phase 3 pilot, run the reviewer twice on the same cell output.
If scores differ by >1 on the 0-3 scale, the rubric is too ambiguous — sharpen
the criterion definitions before running the full matrix. Expected variance: ≤0.5
across repeat invocations on identical input.
