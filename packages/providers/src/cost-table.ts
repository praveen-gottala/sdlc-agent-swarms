/**
 * @module @agentforge/providers/cost-table
 *
 * Cost per million tokens for supported models.
 * Configurable — update when provider pricing changes.
 */

export interface ModelCost {
  /** Cost per 1M input tokens in USD. */
  readonly input: number;
  /** Cost per 1M output tokens in USD. */
  readonly output: number;
}

/** Default cost table. Prices in USD per million tokens. */
const DEFAULT_COST_TABLE: Record<string, ModelCost> = {
  // Claude
  'claude-opus-4': { input: 15.0, output: 75.0 },
  'claude-sonnet-4': { input: 3.0, output: 15.0 },
  'claude-haiku-4': { input: 0.25, output: 1.25 },
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

/** Mutable cost table — starts with defaults, can be overridden. */
let costTable: Record<string, ModelCost> = { ...DEFAULT_COST_TABLE };

/** Get cost entry for a model. Returns zero-cost for ollama/* or unknown models. */
export function getModelCost(model: string): ModelCost {
  if (model.startsWith('ollama/')) {
    return { input: 0, output: 0 };
  }
  return costTable[model] ?? { input: 0, output: 0 };
}

/** Override or add cost entries. */
export function setCostOverrides(overrides: Record<string, ModelCost>): void {
  costTable = { ...costTable, ...overrides };
}

/** Reset to default cost table. */
export function resetCostTable(): void {
  costTable = { ...DEFAULT_COST_TABLE };
}

/** Calculate cost in USD from token counts and model. */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): { inputCostUsd: number; outputCostUsd: number; totalCostUsd: number } {
  const cost = getModelCost(model);
  const inputCostUsd = (inputTokens / 1_000_000) * cost.input;
  const outputCostUsd = (outputTokens / 1_000_000) * cost.output;
  return {
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd,
  };
}
