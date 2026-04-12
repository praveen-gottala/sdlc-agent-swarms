import {
  UX_RESEARCH_CONTRACT,
  parseResearchOutput,
  registerUXResearch,
  uxResearchWork,
} from './ux-research.js';
import type { AgentContext, LLMProviderRef } from '@agentforge/core';
import { Ok } from '@agentforge/core';

const DISK_TOKENS_YAML = `version: "1.0"
created_by: test
colors:
  primitive:
    cream: "#FFF8E7"
    teal: "#0F6E56"
  semantic:
    background-primary: cream
    cta-primary: teal
typography:
  font_families:
    display: Inter
    body: Inter
  scale:
    - role: heading-1
      size: 32
      weight: 700
      family: display
spacing:
  unit: 8
  scale: [4, 8, 16, 24, 32]
borders:
  radius:
    small: 8
    medium: 12
touch_targets:
  minimum_height: 44
  minimum_width: 44`;

// ============================================================================
// Helpers
// ============================================================================

const RESEARCH_OUTPUT = JSON.stringify({
  briefId: 'brief-mod-001-1234',
  moduleId: 'mod-001',
  requirementIds: ['REQ-001', 'REQ-002'],
  designConstraints: ['Must follow 8px grid system'],
  referencePatterns: ['Card-based data display pattern'],
  accessibilityRequirements: ['WCAG 2.1 AA color contrast ratio of 4.5:1'],
  dataModelDependencies: ['UserMetrics entity from analytics domain'],
});

const makeProvider = (output: string = RESEARCH_OUTPUT): LLMProviderRef => ({
  name: 'test-provider',
  complete: jest.fn().mockResolvedValue(Ok({ content: output })),
  stream: jest.fn(),
  estimateCost: jest.fn().mockReturnValue({
    estimatedInputTokens: 1000,
    estimatedOutputTokens: 500,
    estimatedCostUsd: 0.01,
    confidence: 'medium' as const,
  }),
});

const makeContext = (): AgentContext => ({
  taskId: 'task_001',
  projectRoot: '/tmp/test-project',
  eventBus: { publish: jest.fn(), emit: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn(), clear: jest.fn(), history: jest.fn().mockReturnValue([]) },
  fs: {
    readFile: jest.fn().mockReturnValue(Ok('pages: []')),
    writeFile: jest.fn().mockReturnValue(Ok(undefined)),
    writeFileAtomic: jest.fn().mockReturnValue(Ok(undefined)),
    exists: jest.fn().mockReturnValue(true),
    mkdir: jest.fn().mockReturnValue(Ok(undefined)),
    rename: jest.fn().mockReturnValue(Ok(undefined)),
    remove: jest.fn().mockReturnValue(Ok(undefined)),
    listDir: jest.fn().mockReturnValue(Ok([])),
    appendFile: jest.fn().mockReturnValue(Ok(undefined)),
  },
  mcpClient: {
    callTool: jest.fn().mockResolvedValue(Ok({})),
    listTools: jest.fn().mockResolvedValue(Ok([])),
    isAvailable: jest.fn().mockResolvedValue(true),
  },
  runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'proceed' })),
  resolveProvider: jest.fn().mockReturnValue(Ok(makeProvider())),
  recordAudit: jest.fn(),
});

// ============================================================================
// Tests
// ============================================================================

describe('UX_RESEARCH_CONTRACT', () => {
  it('contract has all required AgentContract fields', () => {
    expect(UX_RESEARCH_CONTRACT.role).toBe('ux_research');
    expect(UX_RESEARCH_CONTRACT.category).toBe('design');
    expect(UX_RESEARCH_CONTRACT.provider).toBe('claude-sonnet-4-6');
    expect(UX_RESEARCH_CONTRACT.tools).toEqual([]);
    expect(UX_RESEARCH_CONTRACT.permissions).toEqual(['read_spec', 'read_design', 'read_design_system']);
    expect(UX_RESEARCH_CONTRACT.denied).toEqual(['write_code', 'write_design', 'create_branch']);
    expect(UX_RESEARCH_CONTRACT.budget).toEqual({ max_tokens_per_task: 40000, max_cost_per_task_usd: 1.5 });
    expect(UX_RESEARCH_CONTRACT.execution).toEqual({ mode: 'complete', progress_events: false, max_context_tokens: 40000 });
    expect(UX_RESEARCH_CONTRACT.hitl_policy).toBe('notify_only');
    expect(UX_RESEARCH_CONTRACT.on_complete).toBe('DesignBriefCompleted');
  });

  it('contract on_complete matches DesignBriefCompleted event', () => {
    expect(UX_RESEARCH_CONTRACT.on_complete).toBe('DesignBriefCompleted');
  });
});

describe('parseResearchOutput', () => {
  it('handles valid JSON', () => {
    const result = parseResearchOutput(RESEARCH_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.briefId).toBe('brief-mod-001-1234');
      expect(result.value.moduleId).toBe('mod-001');
      expect(result.value.requirementIds).toEqual(['REQ-001', 'REQ-002']);
      expect(result.value.designConstraints).toHaveLength(1);
      expect(result.value.referencePatterns).toHaveLength(1);
      expect(result.value.accessibilityRequirements).toHaveLength(1);
      expect(result.value.dataModelDependencies).toHaveLength(1);
    }
  });

  it('handles JSON in code fences', () => {
    const wrappedOutput = '```json\n' + RESEARCH_OUTPUT + '\n```';
    const result = parseResearchOutput(wrappedOutput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.briefId).toBe('brief-mod-001-1234');
      expect(result.value.moduleId).toBe('mod-001');
    }
  });

  it('returns Err for malformed JSON', () => {
    const result = parseResearchOutput('not json at all');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_MALFORMED_OUTPUT');
    }
  });
});

describe('uxResearchWork — no MCP calls', () => {
  it('mcpClient.callTool is never called during work execution', async () => {
    const provider = makeProvider();
    const ctx = makeContext();

    (ctx.fs.readFile as jest.Mock).mockImplementation((path: string) => {
      if (path.includes('design-tokens.yaml')) {
        return Ok(DISK_TOKENS_YAML);
      }
      return Ok('pages: []');
    });
    (ctx.fs.exists as jest.Mock).mockImplementation((path: string) => {
      if (path.includes('design-tokens.yaml')) return true;
      return true;
    });

    const input = {
      moduleId: 'mod-001',
      taskId: 'task-001',
      prdRequirements: ['The dashboard must display user metrics including daily active users, revenue, and engagement scores.'],
    };

    const result = await uxResearchWork(
      input,
      provider as unknown as LLMProviderRef,
      [],
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(ctx.mcpClient!.callTool).not.toHaveBeenCalled();
  });

  it('returns Err when design tokens are missing on disk and not passed in input', async () => {
    const provider = makeProvider();
    const ctx = makeContext();
    (ctx.fs.readFile as jest.Mock).mockReturnValue({ ok: false, error: { code: 'INVALID_STATE', message: 'not found', recoverable: false } });
    (ctx.fs.exists as jest.Mock).mockReturnValue(false);
    const errSpy = jest.spyOn(console, 'error').mockImplementation();

    const input = {
      moduleId: 'mod-001',
      taskId: 'task-001',
      prdRequirements: ['The dashboard must display user metrics including daily active users, revenue, and engagement scores.'],
    };

    const result = await uxResearchWork(
      input,
      provider as unknown as LLMProviderRef,
      [],
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DEPENDENCY_NOT_FOUND');
      expect(result.error.recoverable).toBe(false);
    }
    expect(provider.complete).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('registerUXResearch', () => {
  it('subscribes to UXModuleRequested', () => {
    const ctx = makeContext();
    const mockEventBus = {
      publish: jest.fn(),
      emit: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      clear: jest.fn(),
      history: jest.fn().mockReturnValue([]),
    };

    registerUXResearch(mockEventBus, ctx);

    expect(mockEventBus.subscribe).toHaveBeenCalledTimes(1);
    expect(mockEventBus.subscribe).toHaveBeenCalledWith(
      'UXModuleRequested',
      expect.any(Function),
    );
  });
});
