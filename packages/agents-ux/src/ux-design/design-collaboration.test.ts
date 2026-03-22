/**
 * @module design-collaboration.test
 *
 * Unit tests for design collaboration and design system context.
 */

import { Ok } from '@agentforge/core';
import {
  buildDesignSystemContext,
  applyDesignFeedback,
  createDesignCollaborationSession,
} from './design-collaboration.js';
import type { UXDashboardDesignOutput } from './ux-dashboard-design.js';

// ============================================================================
// Helpers
// ============================================================================

const SAMPLE_DESIGN_SYSTEM_MD = `# Design System

## Color palette (use these exact values)
- Page background: \`{ r: 0.97, g: 0.97, b: 0.96 }\` (warm gray)
- Card background: \`{ r: 1, g: 1, b: 1 }\` (white)
- Header text: \`{ r: 0.12, g: 0.16, b: 0.23 }\` (slate-800)
- Body text: \`{ r: 0.4, g: 0.45, b: 0.53 }\` (slate-500)
- Accent/primary: \`{ r: 0.15, g: 0.39, b: 0.92 }\` (blue-600)
- Success: \`{ r: 0.13, g: 0.72, b: 0.35 }\` (green-500)
- Warning: \`{ r: 0.96, g: 0.62, b: 0.04 }\` (amber-500)
- Danger: \`{ r: 0.94, g: 0.27, b: 0.27 }\` (red-500)
`;

const SAMPLE_PLANNING_OUTPUT = {
  componentTree: [
    { name: 'DashboardLayout', props: ['width', 'height'], children: [{ name: 'Header' }, { name: 'MetricsRow' }] },
    { name: 'Header', props: ['title'], children: [] },
  ],
  tokenBindings: {
    'Header.fill': 'color.surface.header',
    'MetricCard.fill': 'color.surface.card',
  } as Record<string, string>,
};

const SAMPLE_DESIGN: UXDashboardDesignOutput = {
  figmaFileId: 'file-123',
  figmaPageId: 'page-123',
  figmaNodeIds: { Header: 'node-1', MetricsRow: 'node-2' },
  moduleId: 'test-module',
  breakpoints: ['1440'],
};

const createMockMCPClient = () => ({
  callTool: jest.fn().mockResolvedValue(Ok({})),
});

const createMockProvider = (response: string) => ({
  complete: jest.fn().mockResolvedValue(Ok({ content: response })),
});

// ============================================================================
// Tests
// ============================================================================

describe('buildDesignSystemContext', () => {
  it('parses color palette entries from markdown', () => {
    const ctx = buildDesignSystemContext(SAMPLE_PLANNING_OUTPUT, SAMPLE_DESIGN_SYSTEM_MD);

    expect(ctx.colorPalette.length).toBeGreaterThanOrEqual(5);

    const headerText = ctx.colorPalette.find(c => c.usage === 'Header text');
    expect(headerText).toBeDefined();
    expect(headerText?.rgb).toEqual({ r: 0.12, g: 0.16, b: 0.23 });
    expect(headerText?.family).toBe('slate');
    expect(headerText?.shade).toBe('800');
  });

  it('includes shade scales for all color families', () => {
    const ctx = buildDesignSystemContext(SAMPLE_PLANNING_OUTPUT, SAMPLE_DESIGN_SYSTEM_MD);

    expect(ctx.shadeScales.slate).toBeDefined();
    expect(ctx.shadeScales.blue).toBeDefined();
    expect(ctx.shadeScales.green).toBeDefined();
    expect(ctx.shadeScales.amber).toBeDefined();
    expect(ctx.shadeScales.red).toBeDefined();

    // Slate should have the full range
    expect(ctx.shadeScales.slate.length).toBe(11);
    // Others should have at least 4 shades
    expect(ctx.shadeScales.blue.length).toBeGreaterThanOrEqual(4);
  });

  it('includes typography scale', () => {
    const ctx = buildDesignSystemContext(SAMPLE_PLANNING_OUTPUT, SAMPLE_DESIGN_SYSTEM_MD);

    expect(ctx.typographyScale.length).toBeGreaterThanOrEqual(4);

    const body = ctx.typographyScale.find(t => t.role === 'body');
    expect(body).toEqual({ role: 'body', fontSize: 14, fontWeight: 400 });

    const metric = ctx.typographyScale.find(t => t.role === 'metric-value');
    expect(metric).toEqual({ role: 'metric-value', fontSize: 32, fontWeight: 700 });
  });

  it('includes spacing scale', () => {
    const ctx = buildDesignSystemContext(SAMPLE_PLANNING_OUTPUT, SAMPLE_DESIGN_SYSTEM_MD);

    expect(ctx.spacingScale.length).toBeGreaterThanOrEqual(4);

    const pagePadding = ctx.spacingScale.find(s => s.role === 'page-padding');
    expect(pagePadding).toEqual({ role: 'page-padding', value: 32 });

    const cardGap = ctx.spacingScale.find(s => s.role === 'card-gap');
    expect(cardGap).toEqual({ role: 'card-gap', value: 16 });
  });

  it('passes through component tree and token bindings', () => {
    const ctx = buildDesignSystemContext(SAMPLE_PLANNING_OUTPUT, SAMPLE_DESIGN_SYSTEM_MD);

    expect(ctx.componentTree).toBe(SAMPLE_PLANNING_OUTPUT.componentTree);
    expect(ctx.tokenBindings).toBe(SAMPLE_PLANNING_OUTPUT.tokenBindings);
    expect(ctx.tokenBindings['Header.fill']).toBe('color.surface.header');
  });

  it('stores the full design system prompt text', () => {
    const ctx = buildDesignSystemContext(SAMPLE_PLANNING_OUTPUT, SAMPLE_DESIGN_SYSTEM_MD);

    expect(ctx.designSystemPrompt).toBe(SAMPLE_DESIGN_SYSTEM_MD);
  });
});

describe('applyDesignFeedback', () => {
  it('includes design system in prompt when context is provided', async () => {
    const mcpClient = createMockMCPClient();
    const llmResponse = JSON.stringify({
      steps: [{ tool: 'set_fill_color', params: { nodeId: 'node-1', color: { r: 0.06, g: 0.09, b: 0.16, a: 1 } }, componentRef: '', description: 'Darken header' }],
      breakpoints: [],
    });
    const provider = createMockProvider(llmResponse);
    const ctx = buildDesignSystemContext(SAMPLE_PLANNING_OUTPUT, SAMPLE_DESIGN_SYSTEM_MD);

    await applyDesignFeedback('make header darker', SAMPLE_DESIGN, mcpClient, provider, ctx);

    const systemPrompt = provider.complete.mock.calls[0][0].system as string;
    expect(systemPrompt).toContain('Color Palette');
    expect(systemPrompt).toContain('Shade Scales');
    expect(systemPrompt).toContain('Typography Scale');
    expect(systemPrompt).toContain('Spacing Scale');
    expect(systemPrompt).toContain('Token Bindings');
    expect(systemPrompt).toContain('Header.fill');
    expect(systemPrompt).toContain('darker');
    // Change 5: color-aware rules
    expect(systemPrompt).toContain('Color-Aware Modification Rules');
    expect(systemPrompt).toContain('SAME family');
  });

  it('works without design system context (backward compat)', async () => {
    const mcpClient = createMockMCPClient();
    const llmResponse = JSON.stringify({
      steps: [{ tool: 'set_fill_color', params: { nodeId: 'node-1', color: { r: 0, g: 0, b: 0, a: 1 } }, componentRef: '', description: 'Make black' }],
      breakpoints: [],
    });
    const provider = createMockProvider(llmResponse);

    const result = await applyDesignFeedback('make it black', SAMPLE_DESIGN, mcpClient, provider);

    expect(result.ok).toBe(true);

    const systemPrompt = provider.complete.mock.calls[0][0].system as string;
    // Should NOT contain design system sections
    expect(systemPrompt).not.toContain('Shade Scales');
    expect(systemPrompt).not.toContain('Typography Scale');
    // Should still contain tool reference
    expect(systemPrompt).toContain('set_fill_color');
  });

  it('returns updated design output with executed steps', async () => {
    const mcpClient = createMockMCPClient();
    mcpClient.callTool.mockResolvedValue(Ok({ nodeId: 'new-node' }));
    const llmResponse = JSON.stringify({
      steps: [{ tool: 'set_fill_color', params: { nodeId: 'node-1', color: { r: 0.5, g: 0.5, b: 0.5, a: 1 } }, componentRef: 'Header', description: 'Update header' }],
      breakpoints: [],
    });
    const provider = createMockProvider(llmResponse);

    const result = await applyDesignFeedback('change header', SAMPLE_DESIGN, mcpClient, provider);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.figmaNodeIds.Header).toBe('new-node');
    }
  });

  it('resolves ref: placeholders in feedback steps (Change 1)', async () => {
    const mcpClient = createMockMCPClient();
    mcpClient.callTool.mockResolvedValue(Ok({}));
    const llmResponse = JSON.stringify({
      steps: [{
        tool: 'set_fill_color',
        params: { nodeId: 'ref:Header', color: { r: 0.06, g: 0.09, b: 0.16, a: 1 } },
        componentRef: '',
        description: 'Darken header',
      }],
      breakpoints: [],
    });
    const provider = createMockProvider(llmResponse);

    await applyDesignFeedback('make header darker', SAMPLE_DESIGN, mcpClient, provider);

    // The MCP call should use the resolved node ID, not the ref: placeholder
    const toolCalls = mcpClient.callTool.mock.calls;
    // First call is get_document_info, second is the set_fill_color
    const setFillCall = toolCalls.find(
      (c: [string, string, Record<string, unknown>]) => c[1] === 'set_fill_color',
    );
    expect(setFillCall).toBeDefined();
    expect(setFillCall![2].nodeId).toBe('node-1'); // resolved from Header → node-1
  });

  it('wraps hex color strings in feedback steps (Change 2)', async () => {
    const mcpClient = createMockMCPClient();
    mcpClient.callTool.mockResolvedValue(Ok({}));
    const llmResponse = JSON.stringify({
      steps: [{
        tool: 'set_fill_color',
        params: { nodeId: 'node-1', color: '#1e293b' },
        componentRef: '',
        description: 'Set dark color',
      }],
      breakpoints: [],
    });
    const provider = createMockProvider(llmResponse);

    await applyDesignFeedback('make it dark', SAMPLE_DESIGN, mcpClient, provider);

    const setFillCall = mcpClient.callTool.mock.calls.find(
      (c: [string, string, Record<string, unknown>]) => c[1] === 'set_fill_color',
    );
    expect(setFillCall).toBeDefined();
    const color = setFillCall![2].color as { r: number; g: number; b: number; a: number };
    expect(typeof color.r).toBe('number');
    expect(typeof color.g).toBe('number');
    expect(typeof color.b).toBe('number');
    expect(color.a).toBe(1);
  });

  it('uses maxTokens of 8000 (Change 7)', async () => {
    const mcpClient = createMockMCPClient();
    const provider = createMockProvider(JSON.stringify({ steps: [], breakpoints: [] }));

    await applyDesignFeedback('test', SAMPLE_DESIGN, mcpClient, provider);

    const opts = provider.complete.mock.calls[0][1] as { maxTokens: number };
    expect(opts.maxTokens).toBe(8000);
  });

  it('accumulates conversation history across rounds (Change 4)', async () => {
    const mcpClient = createMockMCPClient();
    const llmResponse = JSON.stringify({
      steps: [{ tool: 'set_fill_color', params: { nodeId: 'node-1', color: { r: 0.06, g: 0.09, b: 0.16, a: 1 } }, componentRef: '', description: 'Darken header' }],
      breakpoints: [],
    });
    const provider = createMockProvider(llmResponse);
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // First round
    await applyDesignFeedback('make header darker', SAMPLE_DESIGN, mcpClient, provider, undefined, history);

    expect(history.length).toBe(2);
    expect(history[0].role).toBe('user');
    expect(history[0].content).toBe('make header darker');
    expect(history[1].role).toBe('assistant');
    expect(history[1].content).toContain('Applied 1 change');

    // Second round — history should be passed to LLM
    await applyDesignFeedback('make it even darker', SAMPLE_DESIGN, mcpClient, provider, undefined, history);

    // The second call should include prior messages
    const secondCallMessages = provider.complete.mock.calls[1][0].messages as Array<{ role: string; content: string }>;
    // 2 prior + 1 new = 3 messages
    expect(secondCallMessages.length).toBe(3);
    expect(secondCallMessages[0].role).toBe('user');
    expect(secondCallMessages[0].content).toBe('make header darker');
    expect(secondCallMessages[1].role).toBe('assistant');
  });
});

describe('createDesignCollaborationSession', () => {
  it('maintains conversation history across applyFeedback rounds (Change 4)', async () => {
    const mcpClient = createMockMCPClient();
    const llmResponse = JSON.stringify({
      steps: [{ tool: 'set_fill_color', params: { nodeId: 'node-1', color: { r: 0.06, g: 0.09, b: 0.16, a: 1 } }, componentRef: '', description: 'Darken header' }],
      breakpoints: [],
    });
    const provider = createMockProvider(llmResponse);

    const session = createDesignCollaborationSession(mcpClient, provider, SAMPLE_DESIGN);

    // First feedback
    await session.applyFeedback('make header darker');

    // Second feedback — LLM should receive prior messages
    await session.applyFeedback('make it even darker');

    const secondCallMessages = provider.complete.mock.calls[1][0].messages as Array<{ role: string; content: string }>;
    // Should have prior user + assistant messages + current user message
    expect(secondCallMessages.length).toBe(3);
  });
});
