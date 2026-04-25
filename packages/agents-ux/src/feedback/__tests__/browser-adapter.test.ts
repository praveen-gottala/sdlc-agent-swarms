/**
 * Unit tests for BrowserFeedbackAdapter.
 * Mock provider — no real LLM calls.
 */

import type { LLMProviderRef } from '@agentforge/core';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import { BrowserFeedbackAdapter } from '../browser-adapter.js';

function createMockProvider(response: string): LLMProviderRef {
  return {
    name: 'mock',
    complete: jest.fn().mockResolvedValue({
      ok: true,
      value: { content: response, usage: { inputTokens: 100, outputTokens: 50 }, cost: { totalCostUsd: 0, inputCostUsd: 0, outputCostUsd: 0 }, finishReason: 'end_turn' },
    }),
    stream: jest.fn(),
    estimateCost: jest.fn().mockReturnValue({ estimatedCostUsd: 0, inputTokens: 0, outputTokens: 0 }),
  };
}

const FIXTURE_SPEC: DesignSpecV2 = {
  screen: 'test',
  width: 1440,
  nodes: {
    'root': { id: 'root', type: 'page', name: 'Root', parent: null, width: 1440, height: 900, layout: { dir: 'column' } },
    'header': { id: 'header', type: 'header', name: 'Header', parent: 'root', width: 'fill', height: 64, background: 'surface-primary' },
    'card-1': { id: 'card-1', type: 'container', name: 'Card', parent: 'root', width: 300, height: 200, radius: 12 },
  } as unknown as DesignSpecV2['nodes'],
} as DesignSpecV2;

describe('BrowserFeedbackAdapter', () => {
  describe('reviewDesign', () => {
    it('returns validated patches from LLM response', async () => {
      const response = JSON.stringify({
        patches: { 'header': { background: 'cta-primary' } },
        reasoning: 'Changed header to blue',
      });
      const adapter = new BrowserFeedbackAdapter(createMockProvider(response));

      const result = await adapter.reviewDesign(FIXTURE_SPEC, 'Make header blue');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.patches['header']).toBeDefined();
        expect(result.value.reasoning).toContain('blue');
      }
    });

    it('handles markdown-fenced JSON responses', async () => {
      const response = '```json\n{"patches": {"card-1": {"radius": 24}}, "reasoning": "Rounded corners"}\n```';
      const adapter = new BrowserFeedbackAdapter(createMockProvider(response));

      const result = await adapter.reviewDesign(FIXTURE_SPEC, 'Round the corners more');

      expect(result.ok).toBe(true);
    });

    it('returns Err when userMessage is empty', async () => {
      const adapter = new BrowserFeedbackAdapter(createMockProvider(''));

      const result = await adapter.reviewDesign(FIXTURE_SPEC);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_STATE');
      }
    });

    it('returns Err when LLM response is not valid JSON', async () => {
      const adapter = new BrowserFeedbackAdapter(createMockProvider('not json at all'));

      const result = await adapter.reviewDesign(FIXTURE_SPEC, 'Change something');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('LLM_MALFORMED_OUTPUT');
      }
    });

    it('returns Err when response fails Zod schema validation', async () => {
      const response = JSON.stringify({ wrong_field: true });
      const adapter = new BrowserFeedbackAdapter(createMockProvider(response));

      const result = await adapter.reviewDesign(FIXTURE_SPEC, 'Change something');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('LLM_MALFORMED_OUTPUT');
      }
    });
  });

  describe('applyPatch', () => {
    it('shallow-merges patches into matching nodes', () => {
      const adapter = new BrowserFeedbackAdapter(createMockProvider(''));
      const patch = { patches: { 'header': { background: 'cta-primary', height: 80 } }, reasoning: 'test' };

      const result = adapter.applyPatch(FIXTURE_SPEC, patch);

      const header = (result.nodes as unknown as Record<string, Record<string, unknown>>)['header'];
      expect(header['background']).toBe('cta-primary');
      expect(header['height']).toBe(80);
    });

    it('deep-merges layout sub-object', () => {
      const adapter = new BrowserFeedbackAdapter(createMockProvider(''));
      const patch = { patches: { 'root': { layout: { gap: 24 } } }, reasoning: 'test' };

      const result = adapter.applyPatch(FIXTURE_SPEC, patch);

      const root = (result.nodes as unknown as Record<string, Record<string, unknown>>)['root'];
      const layout = root['layout'] as Record<string, unknown>;
      expect(layout['gap']).toBe(24);
      expect(layout['dir']).toBe('column');
    });

    it('is immutable — does not mutate input spec', () => {
      const adapter = new BrowserFeedbackAdapter(createMockProvider(''));
      const original = JSON.parse(JSON.stringify(FIXTURE_SPEC)) as DesignSpecV2;
      const patch = { patches: { 'header': { background: 'error' } }, reasoning: 'test' };

      adapter.applyPatch(FIXTURE_SPEC, patch);

      const header = (FIXTURE_SPEC.nodes as unknown as Record<string, Record<string, unknown>>)['header'];
      expect(header['background']).toBe('surface-primary');
      expect(JSON.stringify(FIXTURE_SPEC)).toBe(JSON.stringify(original));
    });

    it('silently skips patches for unknown node IDs', () => {
      const adapter = new BrowserFeedbackAdapter(createMockProvider(''));
      const patch = { patches: { 'nonexistent': { background: 'error' } }, reasoning: 'test' };

      const result = adapter.applyPatch(FIXTURE_SPEC, patch);

      expect(Object.keys(result.nodes)).toEqual(Object.keys(FIXTURE_SPEC.nodes));
    });
  });
});
