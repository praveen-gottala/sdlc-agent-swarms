/**
 * @module @agentforge/agents-ux/ux-design/ux-penpot-design-v2.test
 *
 * Tests for the DesignSpec v2 pipeline path in penpotDesignWork().
 * Uses mock LLM and mock MCP — no API key or Penpot connection needed.
 */

import { Ok, Err, PREVIEW_DIR_REL } from '@agentforge/core';
import type { DesignSpecV2, CatalogMap, RendererTokens } from '@agentforge/designspec-renderer';
import { penpotDesignWork } from './ux-penpot-design.js';
import type { PenpotDesignInput } from './ux-penpot-design.js';
import type { UXPlanningOutput } from '../ux-planning/ux-planning.js';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

// ── Fixtures ──

const SAMPLE_TOKENS: RendererTokens = {
  colors: {
    primitive: { white: '#FFFFFF', black: '#000000', blue: '#2563EB' },
    semantic: {
      'background-primary': 'white',
      'text-primary': 'black',
      'cta-primary': 'blue',
    },
  },
  typography: {
    font_families: { primary: 'Inter', mono: 'Fira Code' },
    scale: [
      { role: 'heading-1', size: 32, weight: 700, family: 'primary' },
      { role: 'body', size: 14, weight: 400, family: 'primary' },
    ],
  },
  elevation: { levels: [{ level: 1, shadow: '0 1px 3px rgba(0,0,0,0.1)', description: 'sm' }] },
  borders: { radius: { sm: 4, md: 8, lg: 12 } },
  spacing: { unit: 4, scale: [4, 8, 12, 16, 24, 32] },
};

const SAMPLE_CATALOG: CatalogMap = {
  'button-primary': {
    type: 'button',
    variant: 'primary',
    background: 'cta-primary',
    text_color: 'text-on-cta',
    height: 44,
    radius: 8,
    padding_x: 16,
    padding_y: 12,
  },
  'input-text': {
    type: 'input',
    variant: 'text',
    background: 'background-primary',
    text_color: 'text-primary',
    height: 44,
    radius: 8,
    border_color: 'border-default',
    border_width: 1,
    padding_x: 12,
    padding_y: 8,
  },
};

const SAMPLE_DESIGN_SPEC: DesignSpecV2 = {
  screen: 'test-settings',
  width: 1440,
  nodes: {
    root: { parent: null, order: 0, type: 'page', layout: { dir: 'column', gap: 0 }, background: 'background-primary' },
    header: { parent: 'root', order: 0, type: 'header', layout: { dir: 'row', align: 'center', px: 32, py: 16 } },
    'header-title': { parent: 'header', order: 0, type: 'text', content: 'Settings', typography: 'heading-1', color: 'text-primary' },
    content: { parent: 'root', order: 1, type: 'container', layout: { dir: 'column', gap: 16, px: 32, py: 24 }, width: 600 },
    'name-input': { parent: 'content', order: 0, catalog: 'input-text', label: 'Full Name', placeholder: 'Jane Cooper', width: 'fill' },
    'save-btn': { parent: 'content', order: 1, catalog: 'button-primary', label: 'Save Changes' },
  },
};

const SAMPLE_PLANNING_OUTPUT: UXPlanningOutput = {
  specRef: 'test-spec',
  moduleId: 'test-settings',
  componentTree: [],
  tokenBindings: {},
  responsiveRules: [],
};

// ── Mock builders ──

function createMockLLM(toolCallArgs: DesignSpecV2, finishReason = 'tool_use') {
  return {
    complete: jest.fn().mockResolvedValue(Ok({
      content: '',
      toolCalls: [{ id: 'call_1', name: 'submit_design', args: toolCallArgs as unknown as Record<string, unknown> }],
      finishReason,
    })),
  };
}

function createMockMCPClient(options?: {
  executeCodeResult?: Record<string, unknown>;
  exportResult?: Record<string, unknown>;
}) {
  const execResult = options?.executeCodeResult ?? {
    result: {
      rootId: 'shape-root-123',
      nodeIds: { root: 'shape-root-123', header: 'shape-header-456' },
    },
  };

  let execCallCount = 0;

  return {
    callTool: jest.fn().mockImplementation((_server: string, tool: string, args?: Record<string, unknown>) => {
      if (tool === 'execute_code') {
        execCallCount++;
        // If the code contains shape.export(), it's an export call — return export result
        const code = (args?.code as string) ?? '';
        if (code.includes('shape.export(')) {
          if (options?.exportResult) {
            return Promise.resolve(Ok({ content: [{ type: 'text', text: JSON.stringify({ result: options.exportResult }) }] }));
          }
          // Default: return error so correction loop is skipped
          return Promise.resolve(Ok({
            content: [{ type: 'text', text: JSON.stringify({ result: { error: 'Shape not found' } }) }],
          }));
        }
        return Promise.resolve(Ok({
          content: [{ text: JSON.stringify(execResult) }],
        }));
      }
      return Promise.resolve(Err({ code: 'MCP_UNAVAILABLE', message: `Unknown tool: ${tool}`, recoverable: true }));
    }),
    listTools: jest.fn().mockResolvedValue([]),
  };
}

function createV2Input(overrides?: Partial<PenpotDesignInput>): PenpotDesignInput {
  return {
    specRef: 'test-spec',
    moduleId: 'test-settings',
    taskId: 'task_test_1',
    planningOutput: SAMPLE_PLANNING_OUTPUT,
    description: 'A settings page for an app',
    viewportWidth: 1440,
    useDesignSpecV2: true,
    rendererTokens: SAMPLE_TOKENS,
    catalogMap: SAMPLE_CATALOG,
    // Use legacy Penpot correction in tests (no browser available)
    legacyPenpotCorrection: true,
    ...overrides,
  };
}

// ── Tests ──

describe('penpotDesignWork v2 path', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Remove cached DesignSpec that would bypass the LLM mock
    const cachedSpecPath = join(process.cwd(), PREVIEW_DIR_REL, 'test-settings', 'scripts', 'designspec-v2.json');
    if (existsSync(cachedSpecPath)) {
      rmSync(cachedSpecPath);
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('happy path: LLM returns valid DesignSpec → renders → executes', async () => {
    const mockLLM = createMockLLM(SAMPLE_DESIGN_SPEC);
    const mockMCP = createMockMCPClient();
    const input = createV2Input();

    const result = await penpotDesignWork(input, mockLLM, mockMCP as never);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.moduleId).toBe('test-settings');
      expect(result.value.penpotNodeIds).toHaveProperty('root');
      expect(result.value.designSpec).toBeDefined();
      expect(result.value.designSpec?.screen).toBe('test-settings');
      expect(result.value.script).toBeDefined();
      // Script should contain Penpot API calls
      expect(result.value.script).toContain('penpot.createBoard');
    }

    // Verify LLM was called with tools and toolChoice
    expect(mockLLM.complete).toHaveBeenCalledTimes(1);
    const [prompt, opts] = mockLLM.complete.mock.calls[0];
    expect(prompt.tools).toBeDefined();
    expect(prompt.tools[0].name).toBe('submit_design');
    expect(opts.toolChoice).toEqual({ type: 'tool', name: 'submit_design' });
    expect(opts.maxTokens).toBe(32000);

    // Verify MCP execute_code was called
    const execCalls = mockMCP.callTool.mock.calls.filter(
      (c: string[]) => c[1] === 'execute_code',
    );
    expect(execCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('returns error when rendererTokens is missing', async () => {
    const mockLLM = createMockLLM(SAMPLE_DESIGN_SPEC);
    const mockMCP = createMockMCPClient();
    const input = createV2Input({ rendererTokens: undefined });

    const result = await penpotDesignWork(input, mockLLM, mockMCP as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('rendererTokens');
    }
  });

  it('returns error when LLM does not call submit_design tool', async () => {
    const mockLLM = {
      complete: jest.fn().mockResolvedValue(Ok({
        content: 'Here is the design...',
        toolCalls: [],
        finishReason: 'stop',
      })),
    };
    const mockMCP = createMockMCPClient();
    const input = createV2Input();

    const result = await penpotDesignWork(input, mockLLM, mockMCP as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('submit_design');
    }
  });

  it('returns error on validation failure (broken parent reference)', async () => {
    const brokenSpec: DesignSpecV2 = {
      screen: 'broken',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page' },
        orphan: { parent: 'nonexistent', order: 0, type: 'text', content: 'hello' },
      },
    };

    const mockLLM = createMockLLM(brokenSpec);
    const mockMCP = createMockMCPClient();
    const input = createV2Input();

    const result = await penpotDesignWork(input, mockLLM, mockMCP as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('validation failed');
    }
  });

  it('returns error when LLM output is truncated (max_tokens)', async () => {
    const mockLLM = {
      complete: jest.fn().mockResolvedValue(Ok({
        content: '',
        toolCalls: [],
        finishReason: 'max_tokens',
      })),
    };
    const mockMCP = createMockMCPClient();
    const input = createV2Input();

    const result = await penpotDesignWork(input, mockLLM, mockMCP as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_TRUNCATED');
    }
  });

  it('returns error when LLM completion fails', async () => {
    const mockLLM = {
      complete: jest.fn().mockResolvedValue(Err({
        code: 'RATE_LIMITED',
        message: 'Too many requests',
      })),
    };
    const mockMCP = createMockMCPClient();
    const input = createV2Input();

    const result = await penpotDesignWork(input, mockLLM, mockMCP as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('LLM completion failed');
    }
  });

  it('returns error when Penpot script execution fails', async () => {
    const mockLLM = createMockLLM(SAMPLE_DESIGN_SPEC);
    const mockMCP = {
      callTool: jest.fn().mockImplementation((_server: string, tool: string) => {
        if (tool === 'execute_code') {
          return Promise.resolve(Err({
            code: 'MCP_UNAVAILABLE',
            message: 'Penpot connection lost',
            recoverable: true,
          }));
        }
        return Promise.resolve(Ok({ content: [] }));
      }),
      listTools: jest.fn().mockResolvedValue([]),
    };
    const input = createV2Input();

    const result = await penpotDesignWork(input, mockLLM, mockMCP as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('execution failed');
    }
  });
});
