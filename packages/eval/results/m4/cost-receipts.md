# M4 Spine Eval — Cost Receipts

Generated: 2026-05-18T05:06:06.170Z (brownfield), greenfield recovered from run logs.

## Per-Run Summary

| Scenario | Rep | Status | Outcome | Cost ($) | Duration (s) |
|----------|-----|--------|---------|----------|--------------|
| spine-cashpulse-greenfield | 1 | success | escalated | 6.2433 | 1497.6 |
| spine-cashpulse-brownfield | 1 | success | escalated | 3.9581 | 874.5 |

## Per-Stage Breakdown

| Scenario | Rep | Stage | Cost ($) | Input Tokens | Output Tokens | Duration (s) |
|----------|-----|-------|----------|-------------|--------------|--------------|
| spine-cashpulse-greenfield | 1 | clarifier | 0.0000 | 0 | 0 | 0.0 |
| spine-cashpulse-greenfield | 1 | architect | 6.1188 | 0 | 0 | 1486.0 |
| spine-cashpulse-greenfield | 1 | implementer | 0.1133 | 0 | 0 | 3.5 |
| spine-cashpulse-greenfield | 1 | reviewer | 0.0112 | 0 | 0 | 8.0 |
| spine-cashpulse-brownfield | 1 | clarifier | 0.0000 | 0 | 0 | 0.0 |
| spine-cashpulse-brownfield | 1 | architect | 3.8872 | 0 | 0 | 862.5 |
| spine-cashpulse-brownfield | 1 | implementer | 0.0585 | 0 | 0 | 3.0 |
| spine-cashpulse-brownfield | 1 | reviewer | 0.0125 | 0 | 0 | 9.0 |

## Totals

- **Total cost:** $10.2014
- **Total input tokens:** 0 (see note)
- **Total output tokens:** 0 (see note)
- **Runs:** 2
- **Model:** claude-opus-4-6

## Data Quality Note

Token counts are zero because this eval ran before commit `2f5d2d7` which fixed
`inputTokens`/`outputTokens` population in `CostRecord`. Cost totals ($USD) are
correct — they were computed from the provider's cost response, not from token
counts. A future re-run with the fixed provider will produce non-zero token
breakdowns. The zero values do not affect Gate 6a/6b pass criteria (which are
based on cost, duration, and structural quality — not token counts).
