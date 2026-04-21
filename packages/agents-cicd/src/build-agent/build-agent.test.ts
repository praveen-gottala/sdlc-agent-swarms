import {
  buildAgentWork,
  BUILD_AGENT_CONTRACT,
  parseBuildFixOutput,
} from './build-agent.js';
import type { BuildAgentInput } from './build-agent.js';
import type { AgentContext, LLMProviderRef, TaskEntry } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';

// ============================================================================
// Helpers
// ============================================================================

const FIX_OUTPUT = `\`\`\`json
{
  "canFix": true,
  "fixType": "missing_import",
  "files": [
    {
      "path": "src/components/revenue-chart.tsx",
      "content": "import React from 'react';\\nexport const RevenueChart = () => <div>Chart</div>;"
    }
  ],
  "description": "Added missing React import"
}
\`\`\``;

const NO_FIX_OUTPUT = `\`\`\`json
{
  "canFix": false,
  "fixType": "unknown",
  "files": [],
  "description": "Runtime error in database connection - requires human investigation"
}
\`\`\``;

const makeCostRecord = (totalCostUsd = 0.05) => ({
  inputCostUsd: totalCostUsd * 0.3,
  outputCostUsd: totalCostUsd * 0.7,
  totalCostUsd,
  model: 'claude-haiku-4-5',
  timestamp: new Date().toISOString(),
});

const makeTask = (overrides: Partial<TaskEntry> = {}): TaskEntry => ({
  id: 'task_010',
  title: 'Generate RevenueChart component',
  phase: 'code_generation',
  agent: 'frontend_coder',
  status: 'in_progress',
  depends_on: [],
  spec_ref: 'spec/components/dashboard.yaml',
  branch: 'agentforge/task-010-revenue-chart',
  pr_number: null,
  cost_usd: 0.42,
  tokens_used: 18400,
  attempts: 1,
  max_attempts: 3,
  hitl_status: 'none',
  hitl_channel: null,
  ...overrides,
});

const makeProvider = (output = FIX_OUTPUT): LLMProviderRef => ({
  name: 'test-provider',
  complete: jest.fn().mockResolvedValue(Ok({
    content: output,
    cost: makeCostRecord(),
  })),
  stream: jest.fn(),
  estimateCost: jest.fn().mockReturnValue({
    estimatedInputTokens: 2000,
    estimatedOutputTokens: 500,
    estimatedCostUsd: 0.02,
    confidence: 'medium' as const,
  }),
});

const makeContext = (): AgentContext => ({
  taskId: 'task_010',
  projectRoot: '/tmp/test-project',
  eventBus: { publish: jest.fn(), emit: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn(), clear: jest.fn(), history: jest.fn().mockReturnValue([]) },
  fs: {
    readFile: jest.fn().mockReturnValue(Ok('')),
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
    callTool: jest.fn().mockResolvedValue(Ok({ success: true })),
    listTools: jest.fn().mockResolvedValue(Ok([])),
    isAvailable: jest.fn().mockResolvedValue(true),
  },
  runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'proceed' })),
  resolveProvider: jest.fn().mockReturnValue(Ok(makeProvider())),
  recordAudit: jest.fn(),
});

const makeInput = (overrides: Partial<BuildAgentInput> = {}): BuildAgentInput => ({
  task: makeTask(),
  projectRoot: '/tmp/test-project',
  branch: 'agentforge/task-010-revenue-chart',
  failureLogs: 'ERROR: Cannot find module "react"\n  at src/components/revenue-chart.tsx:1:1',
  runId: 'run_456',
  ...overrides,
});

// ============================================================================
// parseBuildFixOutput
// ============================================================================

describe('parseBuildFixOutput', () => {
  it('parses fix output with canFix=true', () => {
    const result = parseBuildFixOutput(FIX_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.canFix).toBe(true);
      expect(result.value.fixType).toBe('missing_import');
      expect(result.value.files).toHaveLength(1);
      expect(result.value.description).toBe('Added missing React import');
    }
  });

  it('parses output with canFix=false', () => {
    const result = parseBuildFixOutput(NO_FIX_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.canFix).toBe(false);
      expect(result.value.files).toHaveLength(0);
    }
  });

  it('handles "cannot fix" text without JSON', () => {
    const result = parseBuildFixOutput('I cannot fix this issue. Need human review.');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.canFix).toBe(false);
    }
  });

  it('returns error for unparseable output', () => {
    const result = parseBuildFixOutput('totally random output {}[]');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_MALFORMED_OUTPUT');
    }
  });
});

// ============================================================================
// buildAgentWork
// ============================================================================

describe('buildAgentWork', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(require('node:fs'), 'readFileSync').mockReturnValue('# Mock Build Agent Prompt');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('analyzes failure logs and applies fix when possible', async () => {
    const ctx = makeContext();
    const provider = makeProvider(FIX_OUTPUT);
    const input = makeInput();

    const result = await buildAgentWork(input, provider, [], ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fixApplied).toBe(true);
      expect(result.value.fixDescription).toBe('Added missing React import');
      expect(result.value.totalCostUsd).toBe(0.05);
    }
  });

  it('pushes fix files via MCP when canFix is true', async () => {
    const ctx = makeContext();
    const provider = makeProvider(FIX_OUTPUT);
    const input = makeInput();

    await buildAgentWork(input, provider, [], ctx);

    const mcpCalls = (ctx.mcpClient!.callTool as jest.Mock).mock.calls;
    const pushCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'github' && call[1] === 'push_files',
    );
    expect(pushCall).toBeDefined();
    expect(pushCall![2].branch).toBe('agentforge/task-010-revenue-chart');
    expect(pushCall![2].files).toHaveLength(1);
  });

  it('re-triggers CI after pushing fix', async () => {
    const ctx = makeContext();
    const provider = makeProvider(FIX_OUTPUT);
    const input = makeInput();

    await buildAgentWork(input, provider, [], ctx);

    const mcpCalls = (ctx.mcpClient!.callTool as jest.Mock).mock.calls;
    const triggerCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'github' && call[1] === 'trigger_workflow',
    );
    expect(triggerCall).toBeDefined();
  });

  it('does not push files when canFix is false', async () => {
    const ctx = makeContext();
    const provider = makeProvider(NO_FIX_OUTPUT);
    const input = makeInput();

    await buildAgentWork(input, provider, [], ctx);

    const mcpCalls = (ctx.mcpClient!.callTool as jest.Mock).mock.calls;
    const pushCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'github' && call[1] === 'push_files',
    );
    expect(pushCall).toBeUndefined();
  });

  it('emits BuildFixComplete event', async () => {
    const ctx = makeContext();
    const provider = makeProvider(FIX_OUTPUT);
    const input = makeInput();

    await buildAgentWork(input, provider, [], ctx);

    const publishCalls = (ctx.eventBus.publish as jest.Mock).mock.calls;
    const event = publishCalls.find(
      (call: unknown[]) => (call[0] as { type: string }).type === 'BuildFixComplete',
    );
    expect(event).toBeDefined();
    expect((event![0] as { taskId: string }).taskId).toBe('task_010');
    expect((event![0] as { fixApplied: boolean }).fixApplied).toBe(true);
  });

  it('tracks attempts in output', async () => {
    const ctx = makeContext();
    const provider = makeProvider(FIX_OUTPUT);
    const input = makeInput({ task: makeTask({ attempts: 2 }) });

    const result = await buildAgentWork(input, provider, [], ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.attempts).toBe(3); // 2 + 1
    }
  });

  it('fails when LLM completion fails', async () => {
    const ctx = makeContext();
    const provider: LLMProviderRef = {
      name: 'test-provider',
      complete: jest.fn().mockResolvedValue(
        Err({ code: 'LLM_API_ERROR', message: 'Rate limited', recoverable: true }),
      ),
      stream: jest.fn(),
      estimateCost: jest.fn().mockReturnValue({
        estimatedInputTokens: 1000,
        estimatedOutputTokens: 500,
        estimatedCostUsd: 0.01,
        confidence: 'medium' as const,
      }),
    };
    const input = makeInput();

    const result = await buildAgentWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_API_ERROR');
    }
  });

  it('fails when pushing fix to MCP fails', async () => {
    const ctx = makeContext();
    (ctx.mcpClient!.callTool as jest.Mock).mockImplementation((server: string, method: string) => {
      if (method === 'push_files') {
        return Promise.resolve(
          Err({ code: 'GIT_PUSH_FAILED', message: 'Push rejected', recoverable: true }),
        );
      }
      return Promise.resolve(Ok({ success: true }));
    });
    const provider = makeProvider(FIX_OUTPUT);
    const input = makeInput();

    const result = await buildAgentWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('GIT_PUSH_FAILED');
    }
  });
});

// ============================================================================
// Contract Tests
// ============================================================================

describe('BUILD_AGENT_CONTRACT', () => {
  it('has correct role and category', () => {
    expect(BUILD_AGENT_CONTRACT.role).toBe('build_agent');
    expect(BUILD_AGENT_CONTRACT.category).toBe('cicd');
  });

  it('uses claude-haiku-4-5 (fast, cost-effective)', () => {
    expect(BUILD_AGENT_CONTRACT.provider).toBe('claude-haiku-4-5');
  });

  it('is fully autonomous (no HITL approval needed)', () => {
    expect(BUILD_AGENT_CONTRACT.hitl_policy).toBe('fully_autonomous');
  });

  it('has $0.50 per-task budget', () => {
    expect(BUILD_AGENT_CONTRACT.budget.max_cost_per_task_usd).toBe(0.5);
  });

  it('has write_code permission for pushing fixes', () => {
    expect(BUILD_AGENT_CONTRACT.permissions).toContain('write_code');
    expect(BUILD_AGENT_CONTRACT.permissions).toContain('trigger_ci');
  });

  it('denies design and deploy permissions', () => {
    expect(BUILD_AGENT_CONTRACT.denied).toContain('read_design');
    expect(BUILD_AGENT_CONTRACT.denied).toContain('deploy_staging');
    expect(BUILD_AGENT_CONTRACT.denied).toContain('deploy_production');
    expect(BUILD_AGENT_CONTRACT.denied).toContain('merge_pr');
  });

  it('emits BuildFixComplete on completion', () => {
    expect(BUILD_AGENT_CONTRACT.on_complete).toBe('BuildFixComplete');
  });

  it('retries up to 3 times before escalating', () => {
    expect(BUILD_AGENT_CONTRACT.on_error).toBe('retry(max=3) then notify_human + pause');
  });
});
