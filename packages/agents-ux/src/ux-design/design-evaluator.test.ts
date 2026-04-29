/**
 * @module design-evaluator.test
 *
 * Unit tests for the design evaluation utility.
 */

import { evaluateDesign } from './design-evaluator.js';
import { Ok, Err, withEnv } from '@agentforge/core';
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

const createStructuredMockProvider = (structured: Record<string, unknown>): LLMProvider => ({
  name: 'mock',
  models: ['mock-model'],
  complete: async () => Ok({
    content: '',
    structured,
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
  const originalVisionFlag = process.env['AGENTFORGE_ENABLE_VISION_LLM'];
  beforeAll(() => { process.env['AGENTFORGE_ENABLE_VISION_LLM'] = 'true'; });
  afterAll(() => {
    if (originalVisionFlag === undefined) delete process.env['AGENTFORGE_ENABLE_VISION_LLM'];
    else process.env['AGENTFORGE_ENABLE_VISION_LLM'] = originalVisionFlag;
  });

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

  it('returns skip result when AGENTFORGE_ENABLE_VISION_LLM is false', async () => {
    await withEnv({ AGENTFORGE_ENABLE_VISION_LLM: 'false' }, async () => {
      const provider = createMockProvider('should not be called');
      const result = await evaluateDesign('base64data', 'Design spec', provider);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBe(0);
        expect(result.value.overallQuality).toBe('poor');
        expect(result.value.issues).toEqual([]);
      }
    });
  });

  it('deducts 10 points for monotonous container treatments', async () => {
    const monotonousSpec = {
      screen: 'test-page',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page' },
        section1: { parent: 'root', order: 0, type: 'section', shadow: 'sm', radius: 12 },
        section2: { parent: 'root', order: 1, type: 'section', shadow: 'sm', radius: 12 },
        section3: { parent: 'root', order: 2, type: 'section', shadow: 'sm', radius: 12 },
        section4: { parent: 'root', order: 3, type: 'section', shadow: 'sm', radius: 12 },
      },
    };

    const provider = createMockProvider(JSON.stringify({ score: 85, issues: [] }));
    const result = await evaluateDesign('base64data', JSON.stringify(monotonousSpec), provider);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(75);
      const diversityIssue = result.value.issues.find((i) => i.issueId === 'container-treatment-monotony');
      expect(diversityIssue).toBeDefined();
      expect(diversityIssue?.severity).toBe('major');
      expect(diversityIssue?.description).toContain('elevated');
      expect(diversityIssue?.description).toContain('4');
    }
  });

  it('caps structural deductions at MAX_STRUCTURAL_DEDUCTION (20)', async () => {
    const spec = {
      screen: 'test-page',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page' },
        s1: { parent: 'root', order: 0, type: 'container', shadow: 'sm', radius: 12 },
        h1: { parent: 's1', order: 0, type: 'text', typography: 'heading-2', content: 'Title' },
        c1: { parent: 's1', order: 1, type: 'text', content: 'Body' },
        s2: { parent: 'root', order: 1, type: 'container', shadow: 'sm', radius: 12 },
        h2: { parent: 's2', order: 0, type: 'text', typography: 'heading-2', content: 'Title' },
        c2: { parent: 's2', order: 1, type: 'text', content: 'Body' },
        s3: { parent: 'root', order: 2, type: 'container', shadow: 'sm', radius: 12 },
        h3: { parent: 's3', order: 0, type: 'text', typography: 'heading-2', content: 'Title' },
        c3: { parent: 's3', order: 1, type: 'text', content: 'Body' },
        s4: { parent: 'root', order: 3, type: 'container', shadow: 'sm', radius: 12 },
        h4: { parent: 's4', order: 0, type: 'text', typography: 'heading-2', content: 'Title' },
        c4: { parent: 's4', order: 1, type: 'text', content: 'Body' },
      },
    };

    const provider = createMockProvider(JSON.stringify({ score: 95, issues: [] }));
    const result = await evaluateDesign('base64data', JSON.stringify(spec), provider);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Monotony (-10) + low catalog adoption (-10) = 20 raw, capped at 20
      expect(result.value.score).toBe(75);
      const monotonyIssue = result.value.issues.find((i) => i.issueId === 'container-treatment-monotony');
      const adoptionIssue = result.value.issues.find((i) => i.issueId === 'low-catalog-adoption');
      expect(monotonyIssue).toBeDefined();
      expect(adoptionIssue).toBeDefined();
    }
  });

  it('unwraps nested {response:{...}} from structured output', async () => {
    const simpleSpec = { screen: 'test', nodes: { root: { type: 'page', parent: null, order: 0 } } };
    const provider = createStructuredMockProvider({
      response: {
        score: 82,
        issues: [{ severity: 'minor', component: 'Card', description: 'Rounded too much', fix: 'Reduce radius' }],
      },
    });

    const result = await evaluateDesign('base64data', JSON.stringify(simpleSpec), provider);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(82);
      expect(result.value.overallQuality).toBe('good');
      expect(result.value.issues).toHaveLength(1);
      expect(result.value.issues[0].component).toBe('Card');
    }
  });

  it('falls back to score 0 when structured output fails Zod parse', async () => {
    const simpleSpec = { screen: 'test', nodes: { root: { type: 'page', parent: null, order: 0 } } };
    const provider = createStructuredMockProvider({
      score: 'not-a-number',
      issues: 'invalid-array',
    });

    const result = await evaluateDesign('base64data', JSON.stringify(simpleSpec), provider);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(0);
      expect(result.value.overallQuality).toBe('poor');
    }
  });
});
