import {
  UX_DASHBOARD_IMPLEMENTATION_CONTRACT,
  parseImplementationOutput,
  registerUXDashboardImplementation,
  uxDashboardImplementationWork,
} from './ux-dashboard-implementation.js';
import type { AgentContext, LLMProviderRef } from '@agentforge/core';
import { Ok, DEFAULT_MODEL } from '@agentforge/core';

// ============================================================================
// Helpers
// ============================================================================

const IMPLEMENTATION_OUTPUT = JSON.stringify({
  moduleId: 'mod-001',
  stage: 'layout',
  files: [
    {
      filePath: 'src/components/dashboard/DashboardLayout.tsx',
      content: 'export const DashboardLayout = () => <div className="grid grid-cols-3 gap-6" />;',
    },
    {
      filePath: 'src/components/dashboard/MetricsCard.tsx',
      content: 'export const MetricsCard = () => <div className="p-4 rounded-lg" />;',
    },
  ],
  totalCostUsd: 0.05,
});

async function* mockStream(content: string) {
  yield { type: 'token' as const, content };
  yield {
    type: 'done' as const,
    cost: {
      inputCostUsd: 0.01,
      outputCostUsd: 0.04,
      totalCostUsd: 0.05,
      model: DEFAULT_MODEL,
      timestamp: new Date().toISOString(),
    },
  };
}

const makeProvider = (output: string = IMPLEMENTATION_OUTPUT): LLMProviderRef => ({
  name: 'test-provider',
  complete: jest.fn().mockResolvedValue(Ok({ content: output })),
  stream: jest.fn().mockReturnValue(mockStream(output)),
  estimateCost: jest.fn().mockReturnValue({
    estimatedInputTokens: 2000,
    estimatedOutputTokens: 1000,
    estimatedCostUsd: 0.05,
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

describe('UX_DASHBOARD_IMPLEMENTATION_CONTRACT', () => {
  it('contract has all required AgentContract fields', () => {
    expect(UX_DASHBOARD_IMPLEMENTATION_CONTRACT.role).toBe('ux_dashboard_implementation');
    expect(UX_DASHBOARD_IMPLEMENTATION_CONTRACT.category).toBe('design');
    expect(UX_DASHBOARD_IMPLEMENTATION_CONTRACT.provider).toBe(DEFAULT_MODEL);
    expect(UX_DASHBOARD_IMPLEMENTATION_CONTRACT.tools).toEqual(['github.create_branch', 'github.push_files']);
    expect(UX_DASHBOARD_IMPLEMENTATION_CONTRACT.permissions).toEqual(['read_spec', 'read_design', 'read_design_system', 'write_code', 'create_branch']);
    expect(UX_DASHBOARD_IMPLEMENTATION_CONTRACT.denied).toEqual(['deploy_staging', 'deploy_production', 'merge_pr']);
    expect(UX_DASHBOARD_IMPLEMENTATION_CONTRACT.budget).toEqual({ max_tokens_per_task: 60000, max_cost_per_task_usd: 2.0 });
    expect(UX_DASHBOARD_IMPLEMENTATION_CONTRACT.execution).toEqual({ mode: 'stream', progress_events: true, max_context_tokens: 60000 });
    expect(UX_DASHBOARD_IMPLEMENTATION_CONTRACT.hitl_policy).toBe('review_and_override');
  });

  it('contract on_complete matches ImplementationDraftReady event', () => {
    expect(UX_DASHBOARD_IMPLEMENTATION_CONTRACT.on_complete).toBe('ImplementationDraftReady');
  });
});

describe('parseImplementationOutput', () => {
  it('handles valid JSON', () => {
    const result = parseImplementationOutput(IMPLEMENTATION_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.moduleId).toBe('mod-001');
      expect(result.value.stage).toBe('layout');
      expect(result.value.files).toHaveLength(2);
      expect(result.value.files[0].filePath).toBe('src/components/dashboard/DashboardLayout.tsx');
      expect(result.value.files[1].filePath).toBe('src/components/dashboard/MetricsCard.tsx');
    }
  });

  it('handles JSON in code fences', () => {
    const wrappedOutput = '```json\n' + IMPLEMENTATION_OUTPUT + '\n```';
    const result = parseImplementationOutput(wrappedOutput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.moduleId).toBe('mod-001');
      expect(result.value.stage).toBe('layout');
    }
  });

  it('returns Err for malformed JSON', () => {
    const result = parseImplementationOutput('not json at all');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_MALFORMED_OUTPUT');
    }
  });
});

describe('registerUXDashboardImplementation', () => {
  it('subscribes to FigmaDesignReady', () => {
    const ctx = makeContext();
    const mockEventBus = {
      publish: jest.fn(),
      emit: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      clear: jest.fn(),
      history: jest.fn().mockReturnValue([]),
    };

    registerUXDashboardImplementation(mockEventBus, ctx);

    expect(mockEventBus.subscribe).toHaveBeenCalledTimes(1);
    expect(mockEventBus.subscribe).toHaveBeenCalledWith(
      'FigmaDesignReady',
      expect.any(Function),
    );
  });
});

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

describe('uxDashboardImplementationWork — disk design tokens required', () => {
  it('returns Err when design-tokens.yaml is missing', async () => {
    const provider = makeProvider();
    const ctx = makeContext();
    (ctx.fs.readFile as jest.Mock).mockReturnValue({ ok: false, error: { code: 'INVALID_STATE', message: 'not found', recoverable: false } });
    (ctx.fs.exists as jest.Mock).mockReturnValue(false);
    const errSpy = jest.spyOn(console, 'error').mockImplementation();

    const input = {
      specRef: 'spec-1',
      moduleId: 'mod-001',
      taskId: 'task-001',
      componentSpec: {
        specRef: 'spec-1',
        moduleId: 'mod-001',
        componentTree: [],
        tokenBindings: {},
        responsiveRules: [],
        implementationStages: [],
      },
      stage: 'layout' as const,
    };

    const result = await uxDashboardImplementationWork(
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
    expect((provider.stream as jest.Mock)).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('runs stream when disk tokens present', async () => {
    const provider = makeProvider();
    const ctx = makeContext();
    (ctx.fs.readFile as jest.Mock).mockImplementation((path: string) => {
      if (path.includes('design-tokens.yaml')) {
        return Ok(DISK_TOKENS_YAML);
      }
      return Ok('pages: []');
    });
    (ctx.fs.exists as jest.Mock).mockImplementation((path: string) => path.endsWith('agentforge/spec') || path.includes('design-tokens.yaml'));

    const input = {
      specRef: 'spec-1',
      moduleId: 'mod-001',
      taskId: 'task-001',
      componentSpec: {
        specRef: 'spec-1',
        moduleId: 'mod-001',
        componentTree: [],
        tokenBindings: {},
        responsiveRules: [],
        implementationStages: [],
      },
      stage: 'layout' as const,
    };

    const result = await uxDashboardImplementationWork(
      input,
      provider as unknown as LLMProviderRef,
      [],
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(provider.stream).toHaveBeenCalled();
  });
});

describe('implementation stages', () => {
  it('all 4 stage values accepted in input', () => {
    const stages = ['layout', 'theme', 'animation', 'implementation'] as const;
    for (const stage of stages) {
      const output = JSON.stringify({
        moduleId: 'mod-001',
        stage,
        files: [],
        totalCostUsd: 0,
      });
      const result = parseImplementationOutput(output);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stage).toBe(stage);
      }
    }
  });
});
