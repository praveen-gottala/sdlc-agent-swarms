# ADR-008: CostRecord Token and Timing Fields Are Optional

## Date
2026-03-18

## Status
Accepted

## PRD Reference
Section 4.2 — "Every agent call tracks token usage, API cost, and wall-clock time."
Section 19.4 — "Per-agent: Maximum tokens/cost per individual task. Prevents runaway loops via circuit breaker."

## What the Implementation Does
The `CostRecord` interface adds `inputTokens`, `outputTokens`, and `wallClockMs` as optional fields (with `?`). Additionally, `agentId`, `taskId`, and `phase` were added as optional fields to support per-agent cost breakdown queries via the new `getCostBreakdown()` method on `BudgetTracker`. The `MonthlyCostReport`, `PhaseCostBreakdown`, and `AgentCostBreakdown` types were added for structured cost querying.

## Reasoning
Making these fields required would break 16+ existing files across 6 packages (providers, agents-code, agents-cicd, governance, e2e-test, integration-tests) that construct `CostRecord` objects without these fields. The provider implementations (`claude-provider.ts`, `openai-provider.ts`) construct `CostRecord` by spreading the output of `calculateCost()`, which returns only `{ inputCostUsd, outputCostUsd, totalCostUsd }`. A breaking change across the entire codebase would require updating every provider, every agent, and every test simultaneously — a scope explosion inappropriate for a single validation prompt. The optional approach preserves backward compatibility while enabling incremental adoption.

## Downstream Impact
- **P11 Agent Runtime:** Should populate `inputTokens`, `outputTokens`, `wallClockMs`, `agentId`, `taskId`, and `phase` on every `CostRecord` it produces. Providers should be updated to include these fields.
- **P31 Event Catalog:** BudgetAlert events already carry cost data. The `getCostBreakdown()` API provides the structured query capability needed for cost dashboards.
- Consumers of `getCostBreakdown()` should handle zero values gracefully when token counts are not populated.

## Decision
Accept deviation and update PRD to acknowledge incremental adoption path.

## PRD Update Required
Yes — Section 4.2 should note that token tracking fields are present on the CostRecord type and should be populated by all providers, with optional typing for backward compatibility during migration.
