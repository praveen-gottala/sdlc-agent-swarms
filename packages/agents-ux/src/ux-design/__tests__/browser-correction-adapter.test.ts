/**
 * Unit tests for the browser correction adapter.
 * Uses mocked BrowserSession and LLMProvider.
 */
import { createBrowserCorrectionAdapter, sanitizePatches, validatePatchValues } from '../browser-correction-adapter.js';
import type { BrowserSession, DOMLayoutData, DesignSpecV2 } from '@agentforge/designspec-renderer';

// ─── Mock Setup ──────────────────────────────────────────

const CANNED_SCREENSHOT = Buffer.from('fake-png-data');
const CANNED_HTML = '<html><body>test</body></html>';

function makeMockSession(): BrowserSession {
  return {
    rerender: jest.fn().mockResolvedValue({
      screenshot: CANNED_SCREENSHOT,
      html: CANNED_HTML,
    }),
    extractDOM: jest.fn().mockResolvedValue({
      nodes: {
        root: {
          nodeId: 'root',
          dataCatalog: null,
          rect: { x: 0, y: 0, width: 1440, height: 900 },
          scrollWidth: 1440,
          clientWidth: 1440,
          scrollHeight: 900,
          clientHeight: 900,
          textContent: '',
          parentNodeId: null,
          childNodeIds: ['card-1'],
          computed: { overflow: 'visible', display: 'flex', position: 'static' },
        },
        'card-1': {
          nodeId: 'card-1',
          dataCatalog: 'card',
          rect: { x: 0, y: 0, width: 300, height: 200 },
          scrollWidth: 300,
          clientWidth: 300,
          scrollHeight: 200,
          clientHeight: 200,
          textContent: 'Card content',
          parentNodeId: 'root',
          childNodeIds: [],
          computed: { overflow: 'visible', display: 'flex', position: 'static' },
        },
      },
      viewportWidth: 1440,
      viewportHeight: 900,
    } as DOMLayoutData),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function makeMockProvider(patches: Record<string, Record<string, unknown>>, reasoning = 'test fix') {
  return {
    name: 'mock',
    models: ['test-model'],
    complete: jest.fn().mockResolvedValue({
      ok: true,
      value: {
        content: '',
        structured: { patches, reasoning },
        usage: { inputTokens: 100, outputTokens: 50 },
      },
    }),
    stream: jest.fn(),
    isAvailable: jest.fn().mockResolvedValue(true),
    estimateCost: jest.fn().mockReturnValue({ estimatedTokens: 0, estimatedCostUsd: 0 }),
  };
}

function makeSpec(): DesignSpecV2 {
  return {
    screen: 'test',
    width: 1440,
    nodes: {
      root: { parent: null, order: 0, type: 'page' as const, layout: { dir: 'column' as const } },
      'card-1': { parent: 'root', order: 0, catalog: 'card', width: 300 },
    },
  };
}

// ─── Tests ───────────────────────────────────────────────

describe('createBrowserCorrectionAdapter', () => {
  it('captureScreenshot returns base64 PNG', async () => {
    const session = makeMockSession();
    const spec = makeSpec();
    const adapter = createBrowserCorrectionAdapter(
      session,
      { value: spec },
      makeMockProvider({}),
      { nodes: {}, viewportWidth: 1440, viewportHeight: 900 },
    );

    const result = await adapter.captureScreenshot();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value).toBe('string');
      expect(result.value).toBe(CANNED_SCREENSHOT.toString('base64'));
    }
  });

  it('executeFixes applies patches from LLM response', async () => {
    const session = makeMockSession();
    const spec = makeSpec();
    const specRef = { value: spec };
    const patches = { 'card-1': { width: 'fill' as const, radius: 12 } };
    const provider = makeMockProvider(patches);

    const adapter = createBrowserCorrectionAdapter(
      session,
      specRef,
      provider,
      { nodes: {}, viewportWidth: 1440, viewportHeight: 900 },
    );

    const result = await adapter.executeFixes(
      [{ severity: 'major', component: 'card-1', description: 'Card too narrow', fix: 'Set width to fill' }],
      'base64screenshot',
      [],
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fixed).toBe(1);
      expect(result.value.failed).toBe(0);
    }

    // Verify spec was mutated
    expect(specRef.value.nodes['card-1'].width).toBe('fill');
    expect((specRef.value.nodes['card-1'] as any).radius).toBe(12);

    // Verify session.rerender was called with patched spec
    expect(session.rerender).toHaveBeenCalled();
  });

  it('executeFixes handles null patches (field removal)', async () => {
    const session = makeMockSession();
    const spec = makeSpec();
    const specRef = { value: spec };
    // Include a non-null property alongside null so the patch isn't dropped as all-null
    const patches = { 'card-1': { width: null, radius: 8 } };
    const provider = makeMockProvider(patches as Record<string, Record<string, unknown>>);

    const adapter = createBrowserCorrectionAdapter(
      session,
      specRef,
      provider,
      { nodes: {}, viewportWidth: 1440, viewportHeight: 900 },
    );

    await adapter.executeFixes(
      [{ severity: 'major', component: 'card-1', description: 'Badge too wide', fix: 'Remove width' }],
      'base64screenshot',
      [],
    );

    // width should be deleted
    expect(specRef.value.nodes['card-1'].width).toBeUndefined();
    // radius should be applied
    expect((specRef.value.nodes['card-1'] as any).radius).toBe(8);
  });

  it('executeFixes reports failure for unknown node IDs', async () => {
    const session = makeMockSession();
    const spec = makeSpec();
    const specRef = { value: spec };
    const patches = { 'nonexistent-node': { width: 100 } };
    const provider = makeMockProvider(patches);

    const adapter = createBrowserCorrectionAdapter(
      session,
      specRef,
      provider,
      { nodes: {}, viewportWidth: 1440, viewportHeight: 900 },
    );

    const result = await adapter.executeFixes(
      [{ severity: 'major', component: 'test', description: 'test', fix: 'test' }],
      'base64screenshot',
      [],
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.failed).toBe(1);
      expect(result.value.fixed).toBe(0);
    }
  });

  it('includes user tags and mechanical issues in prompt', async () => {
    const session = makeMockSession();
    const spec = makeSpec();
    const provider = makeMockProvider({});

    const adapter = createBrowserCorrectionAdapter(
      session,
      { value: spec },
      provider,
      { nodes: {}, viewportWidth: 1440, viewportHeight: 900 },
      [{ nodeId: 'card-1', feedback: 'Too small' }],
      [{ nodeId: 'sib-a', rule: 'overlap', autoFixable: false, description: 'Siblings overlap', suggestedFix: null }],
    );

    await adapter.executeFixes(
      [{ severity: 'major', component: 'card-1', description: 'test', fix: 'test' }],
      'base64screenshot',
      [],
    );

    // Verify the LLM was called with all context blocks
    expect(provider.complete).toHaveBeenCalledTimes(1);
    const call = provider.complete.mock.calls[0];
    const messages = call[0].messages;
    expect(messages).toHaveLength(1);
    const content = messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    // Should have 5 content blocks: image, DOM, user tags, spec, issues
    expect(content).toHaveLength(5);
    expect(content[0].type).toBe('image');
    expect(content[1].type).toBe('text');
    expect(content[2].type).toBe('text');
    expect(content[2].text).toContain('Too small');
    expect(content[3].type).toBe('text');
    expect(content[4].type).toBe('text');
    expect(content[4].text).toContain('overlap');
  });

  it('preserves original fields not in patch', async () => {
    const session = makeMockSession();
    const spec = makeSpec();
    const specRef = { value: spec };
    // Only patch radius, not width
    const patches = { 'card-1': { radius: 16 } };
    const provider = makeMockProvider(patches);

    const adapter = createBrowserCorrectionAdapter(
      session,
      specRef,
      provider,
      { nodes: {}, viewportWidth: 1440, viewportHeight: 900 },
    );

    await adapter.executeFixes(
      [{ severity: 'major', component: 'card-1', description: 'test', fix: 'test' }],
      'base64screenshot',
      [],
    );

    // Original width preserved
    expect(specRef.value.nodes['card-1'].width).toBe(300);
    // New field added
    expect((specRef.value.nodes['card-1'] as any).radius).toBe(16);
  });

  it('does not pass responseSchema to provider.complete()', async () => {
    const session = makeMockSession();
    const spec = makeSpec();
    const provider = makeMockProvider({});

    const adapter = createBrowserCorrectionAdapter(
      session,
      { value: spec },
      provider,
      { nodes: {}, viewportWidth: 1440, viewportHeight: 900 },
    );

    await adapter.executeFixes(
      [{ severity: 'major', component: 'card-1', description: 'test', fix: 'test' }],
      'base64screenshot',
      [],
    );

    const call = provider.complete.mock.calls[0];
    const options = call[1];
    expect(options.responseSchema).toBeUndefined();
    expect(options.model).toBeDefined();
    expect(options.maxTokens).toBeDefined();
    expect(options.temperature).toBe(0);
  });

  it('parses patches from wrapped response object', async () => {
    const session = makeMockSession();
    const spec = makeSpec();
    const specRef = { value: spec };
    // Provider returns text with { response: { patches: ... } } wrapper
    const provider = {
      name: 'mock',
      models: ['test-model'],
      complete: jest.fn().mockResolvedValue({
        ok: true,
        value: {
          content: JSON.stringify({
            response: {
              patches: { 'card-1': { radius: 10 } },
              reasoning: 'wrapped',
            },
          }),
          structured: null,
          usage: { inputTokens: 100, outputTokens: 50 },
        },
      }),
      stream: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
      estimateCost: jest.fn().mockReturnValue({ estimatedTokens: 0, estimatedCostUsd: 0 }),
    };

    const adapter = createBrowserCorrectionAdapter(
      session,
      specRef,
      provider,
      { nodes: {}, viewportWidth: 1440, viewportHeight: 900 },
    );

    const result = await adapter.executeFixes(
      [{ severity: 'major', component: 'card-1', description: 'test', fix: 'test' }],
      'base64screenshot',
      [],
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.fixed).toBe(1);
    expect((specRef.value.nodes['card-1'] as any).radius).toBe(10);
  });

  it('parses patches when top-level object is patches map', async () => {
    const session = makeMockSession();
    const spec = makeSpec();
    const specRef = { value: spec };
    // Provider returns text where top-level IS the patches map
    const provider = {
      name: 'mock',
      models: ['test-model'],
      complete: jest.fn().mockResolvedValue({
        ok: true,
        value: {
          content: JSON.stringify({
            'card-1': { layout: { dir: 'row', gap: 8 } },
            reasoning: 'direct map',
          }),
          structured: null,
          usage: { inputTokens: 100, outputTokens: 50 },
        },
      }),
      stream: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
      estimateCost: jest.fn().mockReturnValue({ estimatedTokens: 0, estimatedCostUsd: 0 }),
    };

    const adapter = createBrowserCorrectionAdapter(
      session,
      specRef,
      provider,
      { nodes: {}, viewportWidth: 1440, viewportHeight: 900 },
    );

    const result = await adapter.executeFixes(
      [{ severity: 'major', component: 'card-1', description: 'test', fix: 'test' }],
      'base64screenshot',
      [],
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.fixed).toBe(1);
    expect((specRef.value.nodes['card-1'] as any).layout).toEqual({ dir: 'row', gap: 8 });
  });

  it('handles both null and removeFields for field removal', async () => {
    const session = makeMockSession();
    const spec = makeSpec();
    // Add background to card-1 so we can test removal
    (spec.nodes['card-1'] as any).background = 'surface-primary';
    const specRef = { value: spec };
    const patches = { 'card-1': { width: null, removeFields: ['background'], radius: 8 } };
    const provider = makeMockProvider(patches as any);

    const adapter = createBrowserCorrectionAdapter(
      session,
      specRef,
      provider,
      { nodes: {}, viewportWidth: 1440, viewportHeight: 900 },
    );

    await adapter.executeFixes(
      [{ severity: 'major', component: 'card-1', description: 'test', fix: 'test' }],
      'base64screenshot',
      [],
    );

    // Both removal mechanisms work
    expect(specRef.value.nodes['card-1'].width).toBeUndefined();
    expect((specRef.value.nodes['card-1'] as any).background).toBeUndefined();
    expect((specRef.value.nodes['card-1'] as any).radius).toBe(8);
  });

  it('executeFixes strips CSS hallucinations via sanitizePatches', async () => {
    const session = makeMockSession();
    const spec = makeSpec();
    const specRef = { value: spec };
    // LLM returns CSS properties that don't exist in DesignSpec
    const patches = {
      'card-1': {
        width: 'fill' as const,
        position: 'fixed',
        positionX: 'center',
        transform: 'translate(-50%,-50%)',
        style: { marginLeft: 'auto' },
        top: '50%',
      },
    };
    const provider = makeMockProvider(patches as any);

    const adapter = createBrowserCorrectionAdapter(
      session,
      specRef,
      provider,
      { nodes: {}, viewportWidth: 1440, viewportHeight: 900 },
    );

    await adapter.executeFixes(
      [{ severity: 'major', component: 'card-1', description: 'test', fix: 'test' }],
      'base64screenshot',
      [],
    );

    // Valid property applied
    expect(specRef.value.nodes['card-1'].width).toBe('fill');
    // Invalid CSS properties NOT applied
    expect((specRef.value.nodes['card-1'] as any).position).toBeUndefined();
    expect((specRef.value.nodes['card-1'] as any).positionX).toBeUndefined();
    expect((specRef.value.nodes['card-1'] as any).transform).toBeUndefined();
    expect((specRef.value.nodes['card-1'] as any).style).toBeUndefined();
    expect((specRef.value.nodes['card-1'] as any).top).toBeUndefined();
  });
});

// ─── sanitizePatches unit tests ─────────────────────────

describe('sanitizePatches', () => {
  it('keeps valid NodeSpec properties', () => {
    const result = sanitizePatches({
      node1: { width: 100, height: 50, background: 'surface-primary', radius: 8 },
    });
    expect(result.node1).toEqual({ width: 100, height: 50, background: 'surface-primary', radius: 8 });
  });

  it('aliases positioning CSS properties to overrides', () => {
    const result = sanitizePatches({
      node1: { width: 100, position: 'fixed', zIndex: 10, top: '50%' },
    });
    expect(result.node1).toEqual({
      width: 100,
      overrides: { position: 'fixed', zIndex: 10, top: '50%' },
    });
    // Top-level CSS keys are gone — only in overrides
    expect(result.node1.position).toBeUndefined();
    expect(result.node1.zIndex).toBeUndefined();
    expect(result.node1.top).toBeUndefined();
  });

  it('maps CSS aliases to DesignSpec properties', () => {
    const result = sanitizePatches({
      node1: { backgroundColor: 'blue-500', borderRadius: 12, fontSize: 'heading-1', fontWeight: 700 },
    });
    expect(result.node1).toEqual({
      background: 'blue-500',
      radius: 12,
      typography: 'heading-1',
      weight: 700,
    });
  });

  it('maps CSS layout aliases to nested layout properties', () => {
    const result = sanitizePatches({
      node1: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    });
    expect(result.node1).toEqual({
      layout: { dir: 'row', align: 'center', justify: 'space-between', gap: 12 },
    });
  });

  it('aliases positioning to overrides, margins to layout, and strips unsupported CSS', () => {
    const result = sanitizePatches({
      node1: {
        width: 100,
        position: 'absolute',
        positionX: 'center',
        positionY: 'center',
        transform: 'translate(-50%)',
        margin: '0 auto',
        marginLeft: 10,
        display: 'flex',
        overflow: 'hidden',
        opacity: '0.5',
        style: { color: 'red' },
      },
    });
    expect(result.node1).toEqual({
      width: 100,
      overrides: { position: 'absolute', positionX: 'center', positionY: 'center' },
      layout: { display: 'flex', ml: 10 },
    });
    // transform, margin (shorthand), overflow, opacity, style are stripped
    expect(result.node1.overrides).not.toHaveProperty('transform');
    expect(result.node1).not.toHaveProperty('style');
  });

  it('sanitizes layout sub-object by stripping invalid keys but keeping display/columns/wrap', () => {
    const result = sanitizePatches({
      node1: {
        layout: {
          dir: 'row',
          gap: 8,
          align: 'center',
          flexWrap: 'wrap',
          display: 'flex',
          unknownKey: true,
        } as any,
      },
    });
    // display and wrap are now valid layout keys; flexWrap is not a valid layout key (use wrap)
    // but unknownKey should be stripped
    expect(result.node1.layout).toEqual({ dir: 'row', gap: 8, align: 'center', display: 'flex' });
    expect((result.node1.layout as any).flexWrap).toBeUndefined();
    expect((result.node1.layout as any).unknownKey).toBeUndefined();
  });

  it('preserves null values for property removal', () => {
    const result = sanitizePatches({
      node1: { width: null, height: 100 },
    });
    expect(result.node1).toEqual({ width: null, height: 100 });
  });

  it('drops nodes where all properties are null (no-change marker from constrained decoding)', () => {
    const result = sanitizePatches({
      node1: { width: null, height: null },
    });
    // All-null patch means no actual changes — node should be dropped
    expect(result.node1).toBeUndefined();
  });

  it('merges aliases into existing layout object', () => {
    const result = sanitizePatches({
      node1: {
        layout: { dir: 'column', gap: 16 },
        flexDirection: 'row',
      } as any,
    });
    // layout is processed first (valid key, sanitized), then flexDirection alias
    // overwrites layout.dir on the already-assigned layout object
    expect((result.node1.layout as any).dir).toBe('row');
    expect((result.node1.layout as any).gap).toBe(16);
  });

  it('handles all valid NodeSpec fields', () => {
    const result = sanitizePatches({
      node1: {
        parent: 'root',
        order: 1,
        type: 'container',
        catalog: 'card',
        label: 'Test',
        content: 'Hello',
        value: '42',
        placeholder: 'Enter...',
        helper: 'Help text',
        title: 'Title',
        width: 200,
        height: 100,
        typography: 'heading-1',
        color: 'text-primary',
        weight: 600,
        background: 'surface-primary',
        shadow: 'md',
        radius: 8,
        textAlign: 'center',
      },
    });
    expect(Object.keys(result.node1)).toHaveLength(19);
  });
});

// ─── validatePatchValues unit tests ─────────────────────

describe('validatePatchValues', () => {
  it('strips CSS unit values and coerces to numbers', () => {
    const result = validatePatchValues({ gap: '16px', radius: '8rem', height: '100pt' });
    expect(result).toEqual({ gap: 16, radius: 8, height: 100 });
  });

  it('coerces string numbers', () => {
    const result = validatePatchValues({ radius: '8', weight: '600', height: '200' });
    expect(result).toEqual({ radius: 8, weight: 600, height: 200 });
  });

  it('rejects invalid enum values', () => {
    const result = validatePatchValues({ type: 'flex-row', textAlign: 'justify' });
    expect(result).toEqual({});
  });

  it('preserves valid enum values', () => {
    const result = validatePatchValues({ type: 'container', textAlign: 'center' });
    expect(result).toEqual({ type: 'container', textAlign: 'center' });
  });

  it('preserves valid dimension keywords', () => {
    const result = validatePatchValues({ width: 'fill' });
    expect(result).toEqual({ width: 'fill' });
  });

  it('strips non-numeric non-keyword dimensions', () => {
    const result = validatePatchValues({ width: '100%' });
    expect(result).toEqual({});
  });

  it('coerces numeric string dimensions', () => {
    const result = validatePatchValues({ width: '200px' });
    expect(result).toEqual({ width: 200 });
  });

  it('preserves null for field removal', () => {
    const result = validatePatchValues({ background: null, width: null, radius: null });
    expect(result).toEqual({ background: null, width: null, radius: null });
  });

  it('strips non-string values for string fields', () => {
    const result = validatePatchValues({ label: 42, color: true, title: 'OK' });
    expect(result).toEqual({ title: 'OK' });
  });

  it('validates layout sub-object enum fields', () => {
    const result = validatePatchValues({
      layout: { dir: 'row', align: 'flex-start', justify: 'space-between', gap: '12px' },
    });
    expect(result).toEqual({
      layout: { dir: 'row', justify: 'space-between', gap: 12 },
    });
  });

  it('validates layout sub-object numeric fields', () => {
    const result = validatePatchValues({
      layout: { dir: 'column', px: '24px', py: '16', mt: 'auto' },
    });
    expect(result).toEqual({
      layout: { dir: 'column', px: 24, py: 16 },
    });
  });

  it('passes through non-validated fields like removeFields and options', () => {
    const result = validatePatchValues({
      removeFields: ['width'],
      options: [{ label: 'A', selected: true }],
    });
    expect(result).toEqual({
      removeFields: ['width'],
      options: [{ label: 'A', selected: true }],
    });
  });
});

// ─── sanitizePatches value validation integration ───────

describe('sanitizePatches with value validation', () => {
  it('coerces CSS units through full sanitize pipeline', () => {
    const result = sanitizePatches({
      node1: { gap: '16px', radius: '8rem' },
    });
    // gap goes through alias map → layout.gap, radius stays as top-level
    // Actually gap is a valid alias that maps to layout.gap
    expect(result.node1.layout).toEqual({ gap: 16 });
    expect(result.node1.radius).toBe(8);
  });

  it('strips invalid enum values through full pipeline', () => {
    const result = sanitizePatches({
      node1: { type: 'invalid-type', textAlign: 'center', width: 100 },
    });
    expect(result.node1.type).toBeUndefined();
    expect(result.node1.textAlign).toBe('center');
    expect(result.node1.width).toBe(100);
  });

  it('strips percentage width through full pipeline', () => {
    const result = sanitizePatches({
      node1: { width: '100%', height: 200 },
    });
    expect(result.node1.width).toBeUndefined();
    expect(result.node1.height).toBe(200);
  });
});
