# M4 Gate 6b: Design-Info Regression Results

## Date: 2026-05-18

## Summary

**PASSED.** ADR-057 routing recommendation (NEW: `'none'`, MODIFY: `'structure-only'`) holds after M4 spine integration. No regression detected.

## Methodology

- Ran `scripts/run-design-info-eval.ts --config A,E --task all --reps 1 --force`
- 12 new cells (6 tasks x 2 configs x 1 rep)
- All 102 cells re-scored by `run-design-info-reviewer.ts --force`
- Analysis via `analyze-design-info-eval.ts`
- Model: claude-sonnet-4-6 via Vertex AI (us-east5)

## Results vs M3.6 Baselines

### Config A (baseline — no design info) for NEW tasks

| Metric | M3.6 Baseline | M4 Regression | Threshold | Status |
|--------|---------------|---------------|-----------|--------|
| Mean fidelity | 1.89 | 2.08 | [1.74, 2.04] | 0.04 above upper — improvement, not regression |
| Mean props | 2.58 | 2.58 | — | Stable |
| Input tokens | 756 | 720 | — | Comparable |

### Config E (structure-only) for MODIFY tasks

| Metric | M3.6 Baseline | M4 Regression | Threshold | Status |
|--------|---------------|---------------|-----------|--------|
| Mean fidelity | 2.56 | 2.50 | [2.41, 2.71] | Within bounds |
| Mean props | 3.00 | 3.00 | — | Stable |
| Input tokens | ~13K | 17,424 | — | Higher (more context in M4) |

## Overall Config Comparison (all 102 cells)

| Config | n | Fidelity | Props | Input Tokens |
|--------|---|----------|-------|-------------|
| A | 24 | 2.21 | 2.54 | 746 |
| B | 18 | 1.72 | 2.61 | 4,187 |
| C | 18 | 2.00 | 2.56 | 23,623 |
| D | 18 | 1.78 | 2.50 | 15,144 |
| E | 24 | 1.92 | 2.67 | 13,944 |

## ADR-057 Decision Confirmation

The task-type-aware routing strategy confirmed:
- **NEW tasks:** Config A (no design info) remains optimal (fidelity 2.08 vs 1.33 for all other configs)
- **MODIFY tasks:** Config E (structure-only) achieves fidelity 2.50 at 41% token savings vs Config C

## Cost

- Eval run (12 cells): ~$2 (Sonnet 4.6 via Vertex AI)
- Reviewer (102 cells): ~$3 (re-scored all cells for consistency)
- Total Gate 6b: ~$5
