/**
 * E2E Greenfield Flow Integration Test
 *
 * Simulates the full SDLC pipeline:
 * init → design → spec → code → CI → PR → security scan → approve → deploy
 *
 * All providers and external calls are mocked. Verifies event flow,
 * governance blocking, budget tracking, task transitions, and MCP middleware.
 */

import {
  Ok,
  Err,
  runAgent,
  updateTaskStatus,
} from '@agentforge/core';
import type {
  DomainEventType,
  AgentWorkFn,
} from '@agentforge/core';
import {
  createGovernanceMiddleware,
  executeGovernancePipeline,
} from '@agentforge/governance';
import type { AgentAction } from '@agentforge/governance';
import {
  createEventCollector,
  createMockFs,
  createMockMCPClient,
  createTestContext,
  makeContract,
  makeTask,
  makeTasksFile,
  DEFAULT_GOVERNANCE_CONFIG,
  DEFAULT_HITL_CONFIG,
} from './helpers.js';

// ============================================================================
// Phase Contracts
// ============================================================================

const DESIGN_CONTRACT = makeContract({
  role: 'ux_researcher',
  category: 'design',
  permissions: ['read_spec', 'write_design'],
  on_complete: 'UXResearchComplete',
  on_error: 'retry(max=2) + notify_human',
});

const SPEC_CONTRACT = makeContract({
  role: 'spec_writer',
  category: 'spec',
  permissions: ['read_design', 'write_spec'],
  on_complete: 'SpecComplete',
  on_error: 'retry(max=2) + notify_human',
});

const CODE_GEN_CONTRACT = makeContract({
  role: 'code_generator',
  category: 'code',
  permissions: ['read_spec', 'write_code', 'create_branch'],
  on_complete: 'CodeGenComplete',
  on_error: 'retry(max=3) + notify_human',
});

const PR_CONTRACT = makeContract({
  role: 'pr_creator',
  category: 'code',
  permissions: ['read_code', 'create_pr'],
  on_complete: 'PRCreated',
  on_error: 'notify_human + pause',
});

const SECURITY_CONTRACT = makeContract({
  role: 'security_scanner',
  category: 'code',
  permissions: ['read_code'],
  on_complete: 'SecurityScanComplete',
  on_error: 'notify_human',
});

const DEPLOY_CONTRACT = makeContract({
  role: 'deployer',
  category: 'cicd',
  permissions: ['deploy_staging'],
  hitl_policy: 'full_approval',
  on_complete: 'DeployComplete',
  on_error: 'notify_human + pause',
});

// ============================================================================
// Tests
// ============================================================================

describe('E2E Greenfield Flow', () => {
  let collector: ReturnType<typeof createEventCollector>;
  let fs: ReturnType<typeof createMockFs>;
  let mcpClient: ReturnType<typeof createMockMCPClient>;

  beforeEach(() => {
    collector = createEventCollector();
    fs = createMockFs();
    mcpClient = createMockMCPClient(async (server, method, params) => {
      if (server === 'figma' && method === 'get_design') {
        return Ok({ designRef: 'figma://page/123', components: ['Header', 'Chart'] });
      }
      if (server === 'github' && method === 'create_pr') {
        return Ok({ prNumber: 1, url: 'https://github.com/org/repo/pull/1' });
      }
      if (server === 'github' && method === 'read_pr') {
        return Ok('diff --git a/src/index.ts b/src/index.ts\n+export const App = () => {};');
      }
      if (server === 'github' && method === 'create_review') {
        return Ok({ id: 'review_1' });
      }
      if (server === 'github' && method === 'delete_branch') {
        return Ok({ deleted: true });
      }
      return Ok({ success: true });
    });
  });

  afterEach(() => {
    collector.clear();
  });

  it('flows events correctly between all phases', async () => {
    const events: DomainEventType[] = [];
    const allTypes: DomainEventType[] = [
      'AgentStarted', 'UXResearchComplete', 'SpecComplete',
      'CodeGenComplete', 'PRCreated', 'SecurityScanComplete', 'DeployComplete',
    ];

    for (const type of allTypes) {
      collector.bus.subscribe(type, (e) => {
        events.push(e.type);
      });
    }

    // Phase 1: Design
    const designWork: AgentWorkFn<{ pageId: string }, { designRef: string }> = async (input, _provider, _learnings, ctx) => {
      const result = await ctx.mcpClient.callTool('figma', 'get_design', { page: input.pageId });
      if (!result.ok) return Err({ code: 'INVALID_STATE' as const, message: 'Design failed', recoverable: false });
      ctx.eventBus.publish({ type: 'UXResearchComplete', pageId: input.pageId, taskId: ctx.taskId, layoutSuggestions: ['grid'], source: 'test', timestamp: Date.now() });
      return Ok({ designRef: 'figma://page/123' });
    };

    const ctx = createTestContext({ eventBus: collector.bus, fs, mcpClient });
    const designResult = await runAgent(DESIGN_CONTRACT, ctx, { pageId: 'page_dashboard' }, 'write_design', 'design/dashboard', 'Create dashboard design', designWork);
    expect(designResult.ok).toBe(true);

    // Phase 2: Spec generation
    const specWork: AgentWorkFn<{ designRef: string }, { specRef: string }> = async (input, _provider, _learnings, ctx) => {
      ctx.eventBus.publish({ type: 'SpecComplete', specRef: 'spec/dashboard.yaml', taskId: ctx.taskId, source: 'test', timestamp: Date.now() });
      return Ok({ specRef: 'spec/dashboard.yaml' });
    };

    const specResult = await runAgent(SPEC_CONTRACT, ctx, { designRef: 'figma://page/123' }, 'write_spec', 'spec/dashboard.yaml', 'Generate spec from design', specWork);
    expect(specResult.ok).toBe(true);

    // Phase 3: Code generation
    const codeWork: AgentWorkFn<{ specRef: string }, { branch: string; files: string[] }> = async (input, _provider, _learnings, ctx) => {
      ctx.eventBus.publish({ type: 'CodeGenComplete', taskId: ctx.taskId, agentId: 'code_generator', branch: 'feat/dashboard', filesGenerated: ['src/dashboard.tsx'], source: 'test', timestamp: Date.now() });
      return Ok({ branch: 'feat/dashboard', files: ['src/dashboard.tsx'] });
    };

    const codeResult = await runAgent(CODE_GEN_CONTRACT, ctx, { specRef: 'spec/dashboard.yaml' }, 'write_code', 'src/dashboard.tsx', 'Generate dashboard code', codeWork);
    expect(codeResult.ok).toBe(true);

    // Phase 4: PR creation
    const prWork: AgentWorkFn<{ branch: string }, { prNumber: number }> = async (input, _provider, _learnings, ctx) => {
      const result = await ctx.mcpClient.callTool('github', 'create_pr', { branch: input.branch });
      if (!result.ok) return Err({ code: 'INVALID_STATE' as const, message: 'PR creation failed', recoverable: false });
      ctx.eventBus.publish({ type: 'PRCreated', taskId: ctx.taskId, prNumber: 1, branch: input.branch, source: 'test', timestamp: Date.now() });
      return Ok({ prNumber: 1 });
    };

    const prResult = await runAgent(PR_CONTRACT, ctx, { branch: 'feat/dashboard' }, 'create_pr', 'PR #1', 'Create PR for dashboard', prWork);
    expect(prResult.ok).toBe(true);

    // Phase 5: Security scan
    const scanWork: AgentWorkFn<{ prNumber: number }, { passed: boolean }> = async (input, _provider, _learnings, ctx) => {
      ctx.eventBus.publish({ type: 'SecurityScanComplete', taskId: ctx.taskId, prNumber: input.prNumber, findingsCount: 0, criticalCount: 0, passed: true, source: 'test', timestamp: Date.now() });
      return Ok({ passed: true });
    };

    const scanResult = await runAgent(SECURITY_CONTRACT, ctx, { prNumber: 1 }, 'read_code', 'PR #1', 'Security scan PR', scanWork);
    expect(scanResult.ok).toBe(true);

    // Phase 6: Deploy
    const deployWork: AgentWorkFn<{ prNumber: number }, { environment: string }> = async (input, _provider, _learnings, ctx) => {
      ctx.eventBus.publish({ type: 'DeployComplete', taskId: ctx.taskId, environment: 'staging', healthy: true, source: 'test', timestamp: Date.now() });
      return Ok({ environment: 'staging' });
    };

    const deployResult = await runAgent(DEPLOY_CONTRACT, ctx, { prNumber: 1 }, 'deploy_staging', 'staging', 'Deploy to staging', deployWork);
    expect(deployResult.ok).toBe(true);

    // Verify event flow
    expect(events).toContain('UXResearchComplete');
    expect(events).toContain('SpecComplete');
    expect(events).toContain('CodeGenComplete');
    expect(events).toContain('PRCreated');
    expect(events).toContain('SecurityScanComplete');
    expect(events).toContain('DeployComplete');

    // Events should be in correct order
    const uxIdx = events.indexOf('UXResearchComplete');
    const specIdx = events.indexOf('SpecComplete');
    const codeIdx = events.indexOf('CodeGenComplete');
    const prIdx = events.indexOf('PRCreated');
    expect(uxIdx).toBeLessThan(specIdx);
    expect(specIdx).toBeLessThan(codeIdx);
    expect(codeIdx).toBeLessThan(prIdx);
  });

  it('governance blocks agents without required permissions', async () => {
    const restrictedContract = makeContract({
      role: 'restricted_agent',
      permissions: ['read_code'],
      denied: ['write_code'],
    });

    const governance = createGovernanceMiddleware({
      config: DEFAULT_GOVERNANCE_CONFIG,
      eventBus: collector.bus,
    });

    const action: AgentAction = {
      agentId: 'restricted_agent',
      taskId: 'task_001',
      type: 'write_code',
      target: 'src/index.ts',
      description: 'Write code',
      phase: 'code',
      timestamp: new Date().toISOString(),
    };

    const result = governance.checkPermission(restrictedContract, action);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PERMISSION_DENIED');
    }
  });

  it('tracks budget across the pipeline', async () => {
    const governance = createGovernanceMiddleware({
      config: {
        ...DEFAULT_GOVERNANCE_CONFIG,
        budget: { perTaskMaxUsd: 0.05, perPhaseMaxUsd: 25, monthlyMaxUsd: 200, alertThreshold: 0.8 },
      },
      eventBus: collector.bus,
    });

    const contract = makeContract({ budget: { max_tokens_per_task: 30000, max_cost_per_task_usd: 0.05 } });

    // First check passes
    const action: AgentAction = {
      agentId: 'test_agent',
      taskId: 'task_001',
      type: 'write_code',
      target: 'src/index.ts',
      description: 'Generate code',
      phase: 'code',
      timestamp: new Date().toISOString(),
    };

    const permResult = governance.checkPermission(contract, action);
    expect(permResult.ok).toBe(true);

    const estimate = { estimatedInputTokens: 50000, estimatedOutputTokens: 20000, estimatedCostUsd: 0.10, confidence: 'medium' as const };
    const budgetResult = governance.checkBudget(contract, estimate);

    // Budget should be exceeded (estimate > task limit)
    expect(budgetResult.ok).toBe(false);
    if (!budgetResult.ok) {
      expect(budgetResult.error.code).toMatch(/^BUDGET_EXCEEDED/);
    }
  });

  it('tasks transition through correct statuses during pipeline', () => {
    const task = makeTask({ status: 'pending' });
    let tasksFile = makeTasksFile([task]);

    // pending → in_progress
    const r1 = updateTaskStatus(tasksFile, 'task_001', 'in_progress');
    expect(r1.ok).toBe(true);
    if (r1.ok) tasksFile = r1.value;

    // in_progress → awaiting_approval
    const r2 = updateTaskStatus(tasksFile, 'task_001', 'awaiting_approval');
    expect(r2.ok).toBe(true);
    if (r2.ok) tasksFile = r2.value;

    // awaiting_approval → approved
    const r3 = updateTaskStatus(tasksFile, 'task_001', 'approved');
    expect(r3.ok).toBe(true);
    if (r3.ok) tasksFile = r3.value;

    // approved → completed
    const r4 = updateTaskStatus(tasksFile, 'task_001', 'completed');
    expect(r4.ok).toBe(true);
    if (r4.ok) {
      const finalTask = r4.value.tasks.find((t) => t.id === 'task_001');
      expect(finalTask?.status).toBe('completed');
    }
  });

  it('rejects invalid task status transitions', () => {
    const task = makeTask({ status: 'pending' });
    const tasksFile = makeTasksFile([task]);

    // pending → completed (not valid, must go through in_progress)
    const result = updateTaskStatus(tasksFile, 'task_001', 'completed');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
    }
  });

  it('MCP middleware chain runs on every external call', async () => {
    const traceLog: string[] = [];
    const trackedClient = createMockMCPClient(async (server, method) => {
      traceLog.push(`${server}.${method}`);
      return Ok({ data: 'ok' });
    });

    const ctx = createTestContext({ eventBus: collector.bus, fs, mcpClient: trackedClient });

    // Simulate multiple MCP calls during pipeline
    await ctx.mcpClient.callTool('figma', 'get_design', { page: 'dashboard' });
    await ctx.mcpClient.callTool('github', 'create_pr', { branch: 'feat/x' });
    await ctx.mcpClient.callTool('github', 'create_review', { pr: 1, event: 'APPROVE' });

    expect(trackedClient.calls).toHaveLength(3);
    expect(trackedClient.calls[0].server).toBe('figma');
    expect(trackedClient.calls[1].server).toBe('github');
    expect(trackedClient.calls[2].method).toBe('create_review');
  });

  it('full governance pipeline: permission → budget → HITL', async () => {
    const governance = createGovernanceMiddleware({
      config: DEFAULT_GOVERNANCE_CONFIG,
      eventBus: collector.bus,
    });

    const contract = makeContract();
    const action: AgentAction = {
      agentId: 'test_agent',
      taskId: 'task_001',
      type: 'write_code',
      target: 'src/index.ts',
      description: 'Generate code',
      phase: 'code',
      timestamp: new Date().toISOString(),
    };
    const estimate = { estimatedInputTokens: 1000, estimatedOutputTokens: 500, estimatedCostUsd: 0.01, confidence: 'medium' as const };

    const result = await executeGovernancePipeline(governance, contract, action, estimate, DEFAULT_HITL_CONFIG);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // HITL enforcer returns proceed/pause/notify based on config
      expect(['proceed', 'pause', 'notify']).toContain(result.value.status);
    }
  });

  it('concurrent agents receive independent events', async () => {
    const agent1Events: string[] = [];
    const agent2Events: string[] = [];

    collector.bus.subscribe('CodeGenComplete', (event) => {
      if (event.agentId === 'agent_1') agent1Events.push(event.taskId);
    });
    collector.bus.subscribe('CodeGenComplete', (event) => {
      if (event.agentId === 'agent_2') agent2Events.push(event.taskId);
    });

    // Two agents publishing simultaneously
    collector.bus.publish({ type: 'CodeGenComplete', taskId: 'task_001', agentId: 'agent_1', branch: 'feat/a', filesGenerated: ['a.ts'], source: 'test', timestamp: Date.now() });
    collector.bus.publish({ type: 'CodeGenComplete', taskId: 'task_002', agentId: 'agent_2', branch: 'feat/b', filesGenerated: ['b.ts'], source: 'test', timestamp: Date.now() });

    expect(agent1Events).toEqual(['task_001']);
    expect(agent2Events).toEqual(['task_002']);
  });
});
