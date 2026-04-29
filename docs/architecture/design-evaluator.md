# Design Evaluator Architecture

## Overview

The design evaluator (Stage 5 in the design pipeline) scores generated designs against their specifications using a vision LLM. It's the feedback signal for the correction loop — when the score is below 80/100, the correction pipeline applies fixes and re-evaluates.

**Source:** `packages/agents-ux/src/ux-design/design-evaluator.ts`
**Model:** `claude-opus-4-7` (defined in `packages/core/src/constants.ts:11`)
**Max tokens:** 4096

## Scoring Algorithm

### 5-Dimension Anchored Rubric

The vision LLM scores each dimension 0-20, then sums for the total (0-100):

| Dimension | What it measures | 20 (best) | 10 (mid) | 0 (worst) |
|-----------|-----------------|-----------|----------|-----------|
| Layout Structure | Component presence, hierarchy | All present | Missing sections | Blank/broken |
| Visual Hierarchy | Heading/body/label scale | Clear 2+ levels | Flat (same size) | No differentiation |
| Content Completeness | Realistic text, no truncation | All populated | Multiple gaps | Mostly missing |
| Spacing & Density | Consistent gaps, no dead space | Appropriate padding | >200px dead space | Overlapping |
| Visual Treatment | Container treatment variety | Mixed treatments | All identical | No treatment |

### Structural Deductions (Capped at 20 points)

After the vision score, automatic structural checks apply deductions:

| Check | Max deduction | Source |
|-------|--------------|--------|
| navigateTo binding mismatch | 15 pts (3/gap) | `countPlanningNavigateTo` vs `countSpecNavigateTo` |
| Container treatment monotony | 10 pts | `assessContainerDiversity()` |
| Low catalog adoption | 10 pts | `assessCatalogAdoption()` |
| **Combined cap** | **20 pts** | Prevents a visually-good page from dropping below 60 |

**Formula:** `finalScore = max(0, visionScore - min(structuralDeductions, 20))`

## Model Configuration

Claude Opus 4.7 does **not** support `temperature`, `top_p`, or `top_k` — sending any value returns a 400 error. The provider at `packages/providers/src/claude/claude-provider.ts:40` (`modelSupportsTemperature()`) strips these parameters silently for 4.7+ models.

Determinism is achieved via the anchored rubric prompt, not API parameters. See `docs/lessons-learned.md:781` for the history of this constraint.

## Defensive Parsing

The evaluator handles malformed vision LLM output:

1. **JSON unwrapping:** If the LLM wraps output in `{"response":{...}}`, the evaluator unwraps before validation (matching the pattern in `browser-correction-adapter.ts:605-616`).
2. **Parse failure fallback:** If structured output validation fails, a warning is logged and the text parsing path is attempted. Silent `score:0` with empty issues no longer occurs without a log.
3. **Correction loop guard:** `correction-loop.ts` breaks immediately on `score=0 + empty issues` to prevent wasting a correction LLM call on parse failures.

## Correction Loop Interaction

The evaluator feeds the correction loop in `correction-loop.ts`:

```
evaluate → score < 80? → generate fixes → apply patches → re-evaluate
                 ↑                                              │
                 └──────────────────────────────────────────────┘
                                 (max 3 iterations)
```

**Stopping conditions (in order):**
1. Score >= 80 → threshold met
2. Score=0 + no issues → likely parse failure
3. Score regressed from previous → keep higher score
4. No improvement (improvement <= 0 or < 3 points) → plateau
5. No critical/major issues remaining
6. All fix attempts skipped validation

## Key Files

| File | Role |
|------|------|
| `packages/agents-ux/src/ux-design/design-evaluator.ts` | Scoring logic, system prompt |
| `packages/agents-ux/src/ux-design/correction-loop.ts` | Iteration loop, stopping conditions |
| `packages/agents-ux/src/ux-design/assess-container-diversity.ts` | Treatment variety check |
| `packages/agents-ux/src/ux-design/assess-catalog-adoption.ts` | Catalog usage check |
| `packages/agents-ux/src/ux-design/evaluation-context.ts` | Compact spec context builder |
| `packages/core/src/constants.ts` | EVALUATOR_MODEL constant |
