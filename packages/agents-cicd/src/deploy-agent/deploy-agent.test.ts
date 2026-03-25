import {
  deployAgentWork,
  DEPLOY_AGENT_CONTRACT,
} from './deploy-agent.js';
import type { DeployAgentInput } from './deploy-agent.js';
import type { AgentContext, LLMProviderRef, TaskEntry } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';

// ============================================================================
// Helpers
// ============================================================================

const makeTask = (overrides: Partial<TaskEntry> = {}): TaskEntry => ({
  id: 'task_040',
  title: 'Deploy to staging',
  phase: 'cicd',
  agent: 'deploy_agent',
  status: 'in_progress',
  depends_on: [],
  spec_ref: '',
  branch: 'main',
  pr_number: 42,
  cost_usd: 0,
  tokens_used: 0,
  attempts: 0,
  max_attempts: 1,
  hitl_status: 'none',
  hitl_channel: null,
  ...overrides,
});

const makeProvider = (): LLMProviderRef => ({
  name: 'test-provider',
  complete: jest.fn().mockResolvedValue(Ok({ content: '', cost: { totalCostUsd: 0 } })),
  stream: jest.fn(),
  estimateCost: jest.fn().mockReturnValue({
    estimatedInputTokens: 100,
    estimatedOutputTokens: 50,
    estimatedCostUsd: 0.001,
    confidence: 'high' as const,
  }),
});

const makeContext = (
  mcpOverrides: Record<string, unknown> = {},
): AgentContext => {
  // Track call count to simulate workflow completion after a poll
  let workflowPollCount = 0;
  let healthCheckCount = 0;

  return {
    taskId: 'task_040',
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
      callTool: jest.fn().mockImplementation((_server: string, method: string) => {
        if (method === 'trigger_workflow') {
          return Promise.resolve(Ok({ run_id: 'deploy_run_789' }));
        }
        if (method === 'get_workflow_run') {
          workflowPollCount++;
          // Return completed on first poll
          return Promise.resolve(Ok({ status: 'completed', conclusion: 'success' }));
        }
        if (method === 'check_health') {
          healthCheckCount++;
          // Return healthy. After first check, simulate time passing
          return Promise.resolve(Ok({ healthy: true, status: 'healthy' }));
        }
        return Promise.resolve(Ok(mcpOverrides[method] ?? { success: true }));
      }),
      listTools: jest.fn().mockResolvedValue(Ok([])),
      isAvailable: jest.fn().mockResolvedValue(true),
    },
    runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'proceed' })),
    resolveProvider: jest.fn().mockReturnValue(Ok(makeProvider())),
    recordAudit: jest.fn(),
  };
};

const makeInput = (overrides: Partial<DeployAgentInput> = {}): DeployAgentInput => ({
  task: makeTask(),
  projectRoot: '/tmp/test-project',
  prNumber: 42,
  branch: 'main',
  environment: 'staging',
  ...overrides,
});

// ============================================================================
// deployAgentWork
// ============================================================================

describe('deployAgentWork', () => {
  // Override setTimeout/sleep to be instant in tests
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('triggers staging deployment via MCP', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    // Run but don't await — we need to flush timers
    const promise = deployAgentWork(input, provider, [], ctx);
    // Flush all pending timers
    await jest.runAllTimersAsync();
    const result = await promise;

    const mcpCalls = (ctx.mcpClient.callTool as jest.Mock).mock.calls;
    const triggerCall = mcpCalls.find(
      (call: unknown[]) => call[1] === 'trigger_workflow',
    );
    expect(triggerCall).toBeDefined();
    expect(triggerCall![2].workflow).toBe('deploy-staging.yml');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.environment).toBe('staging');
      expect(result.value.healthy).toBe(true);
      expect(result.value.deployRunId).toBe('deploy_run_789');
    }
  });

  it('rejects production deployments in Phase 1', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput({ environment: 'production' });

    const result = await deployAgentWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PERMISSION_DENIED');
      expect(result.error.message).toContain('Phase 1');
    }
  });

  it('emits DeployComplete on successful deployment', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    const promise = deployAgentWork(input, provider, [], ctx);
    await jest.runAllTimersAsync();
    await promise;

    const publishCalls = (ctx.eventBus.publish as jest.Mock).mock.calls;
    const event = publishCalls.find(
      (call: unknown[]) => (call[0] as { type: string }).type === 'DeployComplete',
    );
    expect(event).toBeDefined();
    expect((event![0] as { environment: string }).environment).toBe('staging');
    expect((event![0] as { healthy: boolean }).healthy).toBe(true);
  });

  it('emits DeployFailed on health check failure', async () => {
    const ctx = makeContext();
    // Override health check to return unhealthy
    (ctx.mcpClient.callTool as jest.Mock).mockImplementation((_server: string, method: string) => {
      if (method === 'trigger_workflow') {
        return Promise.resolve(Ok({ run_id: 'deploy_run_789' }));
      }
      if (method === 'get_workflow_run') {
        return Promise.resolve(Ok({ status: 'completed', conclusion: 'success' }));
      }
      if (method === 'check_health') {
        return Promise.resolve(Ok({ healthy: false, status: 'unhealthy' }));
      }
      return Promise.resolve(Ok({ success: true }));
    });
    const provider = makeProvider();
    const input = makeInput();

    const promise = deployAgentWork(input, provider, [], ctx);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(false);

    const publishCalls = (ctx.eventBus.publish as jest.Mock).mock.calls;
    const failEvent = publishCalls.find(
      (call: unknown[]) => (call[0] as { type: string }).type === 'DeployFailed',
    );
    expect(failEvent).toBeDefined();
    expect((failEvent![0] as { reason: string }).reason).toContain('unhealthy');
  });

  it('emits DeployFailed when deploy workflow fails', async () => {
    const ctx = makeContext();
    (ctx.mcpClient.callTool as jest.Mock).mockImplementation((_server: string, method: string) => {
      if (method === 'trigger_workflow') {
        return Promise.resolve(Ok({ run_id: 'deploy_run_789' }));
      }
      if (method === 'get_workflow_run') {
        return Promise.resolve(Ok({ status: 'completed', conclusion: 'failure' }));
      }
      return Promise.resolve(Ok({ success: true }));
    });
    const provider = makeProvider();
    const input = makeInput();

    const promise = deployAgentWork(input, provider, [], ctx);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CI_FAILED');
    }
  });

  it('fails when trigger_workflow MCP call fails', async () => {
    const ctx = makeContext();
    (ctx.mcpClient.callTool as jest.Mock).mockImplementation((_server: string, method: string) => {
      if (method === 'trigger_workflow') {
        return Promise.resolve(
          Err({ code: 'CI_FAILED', message: 'Workflow not found', recoverable: true }),
        );
      }
      return Promise.resolve(Ok({ success: true }));
    });
    const provider = makeProvider();
    const input = makeInput();

    const result = await deployAgentWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CI_FAILED');
    }
  });
});

// ============================================================================
// Contract Tests
// ============================================================================

describe('DEPLOY_AGENT_CONTRACT', () => {
  it('has correct role and category', () => {
    expect(DEPLOY_AGENT_CONTRACT.role).toBe('deploy_agent');
    expect(DEPLOY_AGENT_CONTRACT.category).toBe('cicd');
  });

  it('uses claude-haiku-4-5', () => {
    expect(DEPLOY_AGENT_CONTRACT.provider).toBe('claude-haiku-4-5');
  });

  it('uses review_and_override HITL policy', () => {
    expect(DEPLOY_AGENT_CONTRACT.hitl_policy).toBe('review_and_override');
  });

  it('has deploy_staging permission', () => {
    expect(DEPLOY_AGENT_CONTRACT.permissions).toContain('deploy_staging');
  });

  it('denies deploy_production in Phase 1', () => {
    expect(DEPLOY_AGENT_CONTRACT.denied).toContain('deploy_production');
  });

  it('denies write_code and merge_pr', () => {
    expect(DEPLOY_AGENT_CONTRACT.denied).toContain('write_code');
    expect(DEPLOY_AGENT_CONTRACT.denied).toContain('merge_pr');
  });

  it('emits DeployComplete on completion', () => {
    expect(DEPLOY_AGENT_CONTRACT.on_complete).toBe('DeployComplete');
  });

  it('has $0.50 per-task budget', () => {
    expect(DEPLOY_AGENT_CONTRACT.budget.max_cost_per_task_usd).toBe(0.5);
  });
});
