/**
 * @module design-evaluator.test
 *
 * Unit tests for the design evaluation utility.
 */

import { evaluateDesign } from './design-evaluator.js';
import { Ok, Err } from '@agentforge/core';
import type { LLMProvider } from '@agentforge/providers';

// ============================================================================
// Mock provider factory
// ============================================================================

const createMockProvider = (response: string): LLMProvider => ({
  name: 'mock',
  models: ['mock-model'],
  complete: async () => Ok({
    content: response,
    toolCalls: [],
    usage: { inputTokens: 100, outputTokens: 50 },
    cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, model: 'mock', timestamp: new Date().toISOString() },
    model: 'mock',
    latencyMs: 100,
    finishReason: 'stop' as const,
  }),
  stream: async function* () { /* empty */ },
  isAvailable: async () => true,
  estimateCost: () => ({ estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: 0, confidence: 'medium' as const }),
});

const createFailingProvider = (): LLMProvider => ({
  name: 'mock',
  models: ['mock-model'],
  complete: async () => Err({ code: 'PROVIDER_DOWN' as const, status: 500, message: 'Server error' }),
  stream: async function* () { /* empty */ },
  isAvailable: async () => false,
  estimateCost: () => ({ estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: 0, confidence: 'medium' as const }),
});

// ============================================================================
// Tests
// ============================================================================

describe('evaluateDesign', () => {
  it('returns good quality for score >= 80', async () => {
    const provider = createMockProvider(JSON.stringify({
      score: 85,
      issues: [
        { severity: 'minor', component: 'Header', description: 'Slightly off color', fix: 'Adjust hue' },
      ],
    }));

    const result = await evaluateDesign('base64data', 'Design spec', provider);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.overallQuality).toBe('good');
      expect(result.value.score).toBe(85);
      expect(result.value.issues).toHaveLength(1);
    }
  });

  it('returns needs_fixes for score between 50 and 79', async () => {
    const provider = createMockProvider(JSON.stringify({
      score: 65,
      issues: [
        { severity: 'major', component: 'MetricCards', description: 'Missing text', fix: 'Add text nodes' },
        { severity: 'critical', component: 'Table', description: 'No data rows', fix: 'Add rows' },
      ],
    }));

    const result = await evaluateDesign('base64data', 'Design spec', provider);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.overallQuality).toBe('needs_fixes');
      expect(result.value.issues).toHaveLength(2);
    }
  });

  it('returns poor for score < 50', async () => {
    const provider = createMockProvider(JSON.stringify({
      score: 30,
      issues: [],
    }));

    const result = await evaluateDesign('base64data', 'Design spec', provider);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.overallQuality).toBe('poor');
    }
  });

  it('parses JSON from markdown fence', async () => {
    const provider = createMockProvider('```json\n{"score": 90, "issues": []}\n```');

    const result = await evaluateDesign('base64data', 'Design spec', provider);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(90);
      expect(result.value.overallQuality).toBe('good');
    }
  });

  it('returns Err on malformed JSON response', async () => {
    const provider = createMockProvider('This is not JSON at all');

    const result = await evaluateDesign('base64data', 'Design spec', provider);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('invalid JSON');
    }
  });

  it('returns Err when provider fails', async () => {
    const provider = createFailingProvider();

    const result = await evaluateDesign('base64data', 'Design spec', provider);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('failed');
    }
  });
});
