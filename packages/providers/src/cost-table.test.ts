import { getModelCost, calculateCost, setCostOverrides, resetCostTable } from './cost-table.js';

describe('cost-table', () => {
  afterEach(() => {
    resetCostTable();
  });

  describe('getModelCost', () => {
    it('returns known model costs', () => {
      const cost = getModelCost('claude-sonnet-4-6');
      expect(cost).toEqual({ input: 3.0, output: 15.0 });
    });

    it('returns zero for ollama models', () => {
      expect(getModelCost('ollama/codellama')).toEqual({ input: 0, output: 0 });
    });

    it('returns zero for unknown models', () => {
      expect(getModelCost('unknown-model')).toEqual({ input: 0, output: 0 });
    });
  });

  describe('calculateCost', () => {
    it('calculates cost correctly for claude-sonnet-4-6', () => {
      const result = calculateCost('claude-sonnet-4-6', 1_000_000, 1_000_000);
      expect(result.inputCostUsd).toBe(3.0);
      expect(result.outputCostUsd).toBe(15.0);
      expect(result.totalCostUsd).toBe(18.0);
    });

    it('calculates cost for small token counts', () => {
      const result = calculateCost('gpt-4o', 1000, 500);
      expect(result.inputCostUsd).toBeCloseTo(0.0025);
      expect(result.outputCostUsd).toBeCloseTo(0.005);
    });
  });

  describe('setCostOverrides', () => {
    it('overrides existing model costs', () => {
      setCostOverrides({ 'claude-sonnet-4-6': { input: 5.0, output: 20.0 } });
      expect(getModelCost('claude-sonnet-4-6')).toEqual({ input: 5.0, output: 20.0 });
    });

    it('adds new model costs', () => {
      setCostOverrides({ 'custom-model': { input: 1.0, output: 2.0 } });
      expect(getModelCost('custom-model')).toEqual({ input: 1.0, output: 2.0 });
    });
  });
});
