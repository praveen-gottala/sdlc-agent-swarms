/**
 * @module design-fixer.test
 *
 * Unit tests for the design fix executor.
 */

import { executeDesignFixes } from './design-fixer.js';
import { Ok } from '@agentforge/core';
import type { MCPClient } from '@agentforge/core';
import type { LLMProvider } from '@agentforge/providers';
import type { DesignIssue } from './design-evaluator.js';

// ============================================================================
// Mock factories
// ============================================================================

const createMockMCPClient = (): MCPClient => ({
  callTool: async () => Ok({ nodeId: 'mock-node' }),
  listTools: async () => Ok([]),
  isAvailable: async () => true,
});

const createMockProvider = (fixSteps: unknown[]): LLMProvider => ({
  name: 'mock',
  models: ['mock-model'],
  complete: async () => Ok({
    content: JSON.stringify(fixSteps),
    toolCalls: [],
    usage: { inputTokens: 50, outputTokens: 25 },
    cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, model: 'mock', timestamp: new Date().toISOString() },
    model: 'mock',
    latencyMs: 50,
    finishReason: 'stop' as const,
  }),
  stream: async function* () { /* empty */ },
  isAvailable: async () => true,
  estimateCost: () => ({ estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: 0, confidence: 'medium' as const }),
});

// ============================================================================
// Tests
// ============================================================================

describe('executeDesignFixes', () => {
  const sampleIssues: DesignIssue[] = [
    {
      severity: 'critical',
      component: 'Header',
      description: 'Missing title text',
      fix: 'Add create_text node with title',
    },
    {
      severity: 'major',
      component: 'MetricCard',
      description: 'All white background',
      fix: 'Set fill color to warm gray',
    },
  ];

  const nodeMap = {
    Header: 'node-1',
    MetricCard: 'node-2',
  };

  it('executes fix commands for each issue', async () => {
    const fixSteps = [
      { tool: 'create_text', params: { text: 'Dashboard', parentId: 'ref:Header' }, componentRef: '', description: 'Add title' },
    ];

    const mcpClient = createMockMCPClient();
    const provider = createMockProvider(fixSteps);

    const result = await executeDesignFixes(sampleIssues, mcpClient, nodeMap, provider);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fixed).toBe(2);
      expect(result.value.failed).toBe(0);
    }
  });

  it('tracks fixed vs failed counts', async () => {
    let callCount = 0;
    const mcpClient: MCPClient = {
      callTool: async () => {
        callCount++;
        if (callCount === 1) {
          return Ok({ nodeId: 'ok' });
        }
        return Ok({ nodeId: 'ok' });
      },
      listTools: async () => Ok([]),
      isAvailable: async () => true,
    };

    const fixSteps = [
      { tool: 'set_fill_color', params: { nodeId: 'ref:Header', color: { r: 0.97, g: 0.97, b: 0.96, a: 1 } }, componentRef: '', description: 'Fix color' },
    ];
    const provider = createMockProvider(fixSteps);

    const result = await executeDesignFixes(sampleIssues, mcpClient, nodeMap, provider);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fixed + result.value.failed).toBe(2);
    }
  });

  it('handles empty issues array', async () => {
    const mcpClient = createMockMCPClient();
    const provider = createMockProvider([]);

    const result = await executeDesignFixes([], mcpClient, nodeMap, provider);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fixed).toBe(0);
      expect(result.value.failed).toBe(0);
    }
  });

  it('resolves $step:N references to created node IDs', async () => {
    const fixSteps = [
      { tool: 'create_text', params: { text: 'Title', parentId: 'ref:Header' }, componentRef: 'Header', description: 'Create title' },
      { tool: 'set_text_content', params: { nodeId: '$step:0', text: 'Cost Dashboard' }, componentRef: 'Header', description: 'Set title text' },
    ];

    const capturedParams: Record<string, unknown>[] = [];
    const mcpClient: MCPClient = {
      callTool: async (_server: string, _method: string, params: Readonly<Record<string, unknown>>) => {
        capturedParams.push({ ...params });
        return Ok({ id: 'new-text-node-123' });
      },
      listTools: async () => Ok([]),
      isAvailable: async () => true,
    };

    const issues: DesignIssue[] = [
      { severity: 'critical', component: 'Header', description: 'Missing title', fix: 'Add title' },
    ];

    const provider = createMockProvider(fixSteps);
    const result = await executeDesignFixes(issues, mcpClient, nodeMap, provider);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fixed).toBe(1);
    }
    // The second call (set_text_content) should have resolved $step:0 to "new-text-node-123"
    expect(capturedParams[1]?.nodeId).toBe('new-text-node-123');
    expect(capturedParams[1]?.text).toBe('Cost Dashboard');
  });

  it('auto-links set_text_content to preceding create_text when nodeId is missing', async () => {
    const fixSteps = [
      { tool: 'create_text', params: { text: 'Label', parentId: 'ref:Header' }, componentRef: 'NewLabel', description: 'Create label' },
      { tool: 'set_text_content', params: { text: 'Updated Label' }, componentRef: 'NewLabel', description: 'Update text' },
    ];

    const capturedParams: Record<string, unknown>[] = [];
    const mcpClient: MCPClient = {
      callTool: async (_server: string, _method: string, params: Readonly<Record<string, unknown>>) => {
        capturedParams.push({ ...params });
        return Ok({ id: 'created-node-456' });
      },
      listTools: async () => Ok([]),
      isAvailable: async () => true,
    };

    const issues: DesignIssue[] = [
      { severity: 'major', component: 'Header', description: 'Missing label', fix: 'Add label' },
    ];

    const provider = createMockProvider(fixSteps);
    await executeDesignFixes(issues, mcpClient, nodeMap, provider);

    // set_text_content should have auto-linked nodeId from the create_text step
    // (componentRef "NewLabel" isn't in nodeMap, so auto-link from create_text kicks in)
    expect(capturedParams[1]?.nodeId).toBe('created-node-456');
  });

  it('normalizes set_item_spacing params', async () => {
    const fixSteps = [
      { tool: 'set_item_spacing', params: { nodeId: 'ref:MetricCard', spacing: 12 }, componentRef: 'MetricCard', description: 'Fix spacing' },
    ];

    const capturedParams: Record<string, unknown>[] = [];
    const mcpClient: MCPClient = {
      callTool: async (_server: string, _method: string, params: Readonly<Record<string, unknown>>) => {
        capturedParams.push({ ...params });
        return Ok({});
      },
      listTools: async () => Ok([]),
      isAvailable: async () => true,
    };

    const issues: DesignIssue[] = [
      { severity: 'major', component: 'MetricCard', description: 'Bad spacing', fix: 'Fix spacing' },
    ];

    const provider = createMockProvider(fixSteps);
    const result = await executeDesignFixes(issues, mcpClient, nodeMap, provider);

    expect(result.ok).toBe(true);
    // "spacing" should have been renamed to "itemSpacing"
    expect(capturedParams[0]?.itemSpacing).toBe(12);
    expect(capturedParams[0]?.spacing).toBeUndefined();
  });

  it('skips set_layout_mode on RECTANGLE nodes', async () => {
    const fixSteps = [
      { tool: 'set_layout_mode', params: { nodeId: 'ref:MetricCard', mode: 'VERTICAL' }, componentRef: 'MetricCard', description: 'Add layout' },
    ];

    const capturedCalls: string[] = [];
    const mcpClient: MCPClient = {
      callTool: async (_server: string, method: string) => {
        capturedCalls.push(method);
        return Ok({});
      },
      listTools: async () => Ok([]),
      isAvailable: async () => true,
    };

    const issues: DesignIssue[] = [
      { severity: 'major', component: 'MetricCard', description: 'Needs layout', fix: 'Add auto-layout' },
    ];

    const nodeTypes = { Header: 'FRAME', MetricCard: 'RECTANGLE' };
    const provider = createMockProvider(fixSteps);
    const result = await executeDesignFixes(issues, mcpClient, nodeMap, provider, nodeTypes);

    expect(result.ok).toBe(true);
    // set_layout_mode should be skipped — RECTANGLE doesn't support it
    expect(capturedCalls).not.toContain('set_layout_mode');
  });

  it('skips set_text_content on non-TEXT nodes', async () => {
    const fixSteps = [
      { tool: 'set_text_content', params: { nodeId: 'ref:Header', text: 'New Title' }, componentRef: 'Header', description: 'Update title' },
    ];

    const capturedCalls: string[] = [];
    const mcpClient: MCPClient = {
      callTool: async (_server: string, method: string) => {
        capturedCalls.push(method);
        return Ok({});
      },
      listTools: async () => Ok([]),
      isAvailable: async () => true,
    };

    const issues: DesignIssue[] = [
      { severity: 'major', component: 'Header', description: 'Wrong title', fix: 'Update text' },
    ];

    const nodeTypes = { Header: 'FRAME', MetricCard: 'RECTANGLE' };
    const provider = createMockProvider(fixSteps);
    await executeDesignFixes(issues, mcpClient, nodeMap, provider, nodeTypes);

    // set_text_content should be skipped — Header is a FRAME, not TEXT
    expect(capturedCalls).not.toContain('set_text_content');
  });

  it('aborts dependency chain when create fails', async () => {
    const fixSteps = [
      { tool: 'create_frame', params: { parentId: 'ref:MetricCard', name: 'Chart' }, componentRef: 'Chart', description: 'Create chart frame' },
      { tool: 'set_fill_color', params: { nodeId: '$step:0', color: { r: 1, g: 0, b: 0, a: 1 } }, componentRef: 'Chart', description: 'Color chart' },
      { tool: 'create_text', params: { parentId: '$step:0', text: 'Label' }, componentRef: 'Label', description: 'Add label' },
    ];

    const capturedCalls: string[] = [];
    const mcpClient: MCPClient = {
      callTool: async (_server: string, method: string) => {
        capturedCalls.push(method);
        return Ok({});
      },
      listTools: async () => Ok([]),
      isAvailable: async () => true,
    };

    const issues: DesignIssue[] = [
      { severity: 'critical', component: 'Chart', description: 'Missing chart', fix: 'Create chart' },
    ];

    // MetricCard is RECTANGLE — can't have children, so create_frame will be skipped
    const nodeTypes = { Header: 'FRAME', MetricCard: 'RECTANGLE' };
    const provider = createMockProvider(fixSteps);
    await executeDesignFixes(issues, mcpClient, nodeMap, provider, nodeTypes);

    // Auto-fix attempts get_node_info on the leaf parent, then all 3 steps are skipped
    // (parent incompatible → auto-fix fails → dependency chain broken)
    expect(capturedCalls).toEqual(['get_node_info']);
  });

  it('filters out minor issues', async () => {
    const issuesWithMinor: DesignIssue[] = [
      { severity: 'minor', component: 'Footer', description: 'Slight alignment', fix: 'Adjust' },
    ];

    const mcpClient = createMockMCPClient();
    const provider = createMockProvider([]);

    const result = await executeDesignFixes(issuesWithMinor, mcpClient, nodeMap, provider);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fixed).toBe(0);
      expect(result.value.failed).toBe(0);
    }
  });
});
