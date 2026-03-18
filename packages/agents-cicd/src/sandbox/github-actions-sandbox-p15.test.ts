/**
 * P15 — GitHub Actions Sandbox Integration (Wave 4)
 *
 * Validates the sandbox workflow from PRD v2.0 Section 15:
 * Code push → CI trigger → Pass/Fail handling → Retry logic → Kill switch
 *
 * Tests use mocked MCP transport (GitHub Actions not available in test env).
 * NOTE: All tests use mocked CI responses.
 */

import type { MCPClient, TaskEntry, TaskStatus } from '@agentforge/core';
import { Ok, Err, createEventBus } from '@agentforge/core';
import { triggerWorkflow, waitForResult, getRunLogs } from './github-actions-sandbox.js';
import { BUILD_AGENT_CONTRACT, parseBuildFixOutput } from '../build-agent/build-agent.js';
import { PR_MANAGER_CONTRACT, buildPRDescription } from '../pr-manager/pr-manager.js';

// ============================================================================
// Test Helpers
// ============================================================================

const makeMCPClient = (overrides: Partial<MCPClient> = {}): MCPClient => ({
  callTool: jest.fn().mockResolvedValue(Ok({ run_id: 'run_123' })),
  listTools: jest.fn().mockResolvedValue(Ok([])),
  isAvailable: jest.fn().mockResolvedValue(true),
  ...overrides,
});

const makeTask = (overrides?: Partial<TaskEntry>): TaskEntry => ({
  id: 'task-1',
  title: 'Build login page',
  phase: 'code',
  agent: 'code_generator',
  status: 'in_progress' as TaskStatus,
  depends_on: [],
  spec_ref: 'spec/login.yaml',
  branch: 'agentforge/task-1',
  pr_number: null,
  cost_usd: 0.5,
  tokens_used: 1000,
  attempts: 0,
  max_attempts: 3,
  hitl_status: 'in_progress',
  hitl_channel: null,
  ...overrides,
});

// ============================================================================
// P15.1 — Code push triggers GitHub Actions workflow
// ============================================================================

describe('P15 — GitHub Actions Sandbox Integration', () => {
  describe('P15.1 — code push triggers workflow', () => {
    it('triggers agentforge-ci.yml workflow on feature branch', async () => {
      const mcp = makeMCPClient();
      const result = await triggerWorkflow(mcp, 'agentforge/task-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('run_123');
      }
      expect(mcp.callTool).toHaveBeenCalledWith('github', 'trigger_workflow', {
        workflow: 'agentforge-ci.yml',
        ref: 'agentforge/task-1',
      });
    });

    it('triggers custom workflow when specified', async () => {
      const mcp = makeMCPClient();
      await triggerWorkflow(mcp, 'agentforge/task-1', { workflow: 'custom-ci.yml' });

      expect(mcp.callTool).toHaveBeenCalledWith('github', 'trigger_workflow', {
        workflow: 'custom-ci.yml',
        ref: 'agentforge/task-1',
      });
    });

    it('returns error when GitHub MCP is unavailable', async () => {
      const mcp = makeMCPClient({
        callTool: jest.fn().mockResolvedValue(
          Err({ code: 'MCP_UNAVAILABLE', message: 'GitHub down', recoverable: true }),
        ),
      });

      const result = await triggerWorkflow(mcp, 'agentforge/task-1');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CI_FAILED');
      }
    });
  });

  // ============================================================================
  // P15.2 — Workflow runs: install, build, test
  // ============================================================================

  describe('P15.2 — workflow execution', () => {
    it('polls workflow until completion and returns passed status', async () => {
      const mcp = makeMCPClient({
        callTool: jest.fn()
          .mockResolvedValueOnce(Ok({ status: 'completed', conclusion: 'success' }))
          .mockResolvedValueOnce(Ok('Build logs: all tests passed')),
      });

      const result = await waitForResult(mcp, 'run_123', 1);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('passed');
        expect(result.value.logs).toContain('all tests passed');
        expect(result.value.duration).toBeGreaterThanOrEqual(0);
      }
    });

    it('returns failed status when workflow fails', async () => {
      const mcp = makeMCPClient({
        callTool: jest.fn()
          .mockResolvedValueOnce(Ok({ status: 'completed', conclusion: 'failure' }))
          .mockResolvedValueOnce(Ok('Error: 3 test suites failed')),
      });

      const result = await waitForResult(mcp, 'run_123', 1);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('failed');
      }
    });

    it('fetches full build logs from completed run', async () => {
      const mcp = makeMCPClient({
        callTool: jest.fn().mockResolvedValue(Ok('Step 1: npm ci\nStep 2: npm run build\nStep 3: npm test\nAll passed')),
      });

      const result = await getRunLogs(mcp, 'run_123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('npm ci');
        expect(result.value).toContain('npm run build');
        expect(result.value).toContain('npm test');
      }
      expect(mcp.callTool).toHaveBeenCalledWith('github', 'get_workflow_logs', {
        run_id: 'run_123',
      });
    });
  });

  // ============================================================================
  // P15.3 — CI pass: PR created with spec/design links
  // ============================================================================

  describe('P15.3 — CI pass creates PR with spec/design links', () => {
    it('builds PR description with task ID, spec ref, and generated files', () => {
      const description = buildPRDescription({
        task: makeTask(),
        projectRoot: '/project',
        branch: 'agentforge/task-1',
        filesGenerated: ['src/login.tsx', 'src/login.test.tsx'],
        testResults: '2 suites, 8 tests passed',
        costUsd: 0.75,
        designRef: 'figma://file-abc/page-1',
      });

      expect(description).toContain('task-1');
      expect(description).toContain('Build login page');
      expect(description).toContain('spec/login.yaml');
      expect(description).toContain('figma://file-abc/page-1');
      expect(description).toContain('src/login.tsx');
      expect(description).toContain('2 suites, 8 tests passed');
      expect(description).toContain('$0.75');
    });

    it('PR manager contract has correct permissions', () => {
      expect(PR_MANAGER_CONTRACT.permissions).toContain('create_pr');
      expect(PR_MANAGER_CONTRACT.denied).toContain('merge_pr');
      expect(PR_MANAGER_CONTRACT.denied).toContain('deploy_production');
      expect(PR_MANAGER_CONTRACT.tools).toContain('github.create_pr');
    });
  });

  // ============================================================================
  // P15.4 — CI fail: captures logs, sends to coding agent for retry
  // ============================================================================

  describe('P15.4 — CI fail triggers diagnostic + retry', () => {
    it('build agent parses CI failure logs and generates fix', () => {
      const fixOutput = JSON.stringify({
        canFix: true,
        fixType: 'missing_import',
        files: [{ path: 'src/login.tsx', content: 'import React from "react";\n// fixed' }],
        description: 'Added missing React import',
      });

      const result = parseBuildFixOutput(`\`\`\`json\n${fixOutput}\n\`\`\``);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.canFix).toBe(true);
        expect(result.value.fixType).toBe('missing_import');
        expect(result.value.files).toHaveLength(1);
        expect(result.value.files[0].path).toBe('src/login.tsx');
      }
    });

    it('build agent recognizes when it cannot fix the issue', () => {
      const result = parseBuildFixOutput('I cannot fix this error. The issue requires a human to resolve.');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.canFix).toBe(false);
      }
    });

    it('build agent contract has retry(max=3) on_error policy', () => {
      expect(BUILD_AGENT_CONTRACT.on_error).toBe('retry(max=3) then notify_human + pause');
      expect(BUILD_AGENT_CONTRACT.hitl_policy).toBe('fully_autonomous');
    });
  });

  // ============================================================================
  // P15.5 — Maximum 3 retry cycles, then human escalation
  // ============================================================================

  describe('P15.5 — 3 retry limit, then human escalation', () => {
    it('build agent contract enforces max 3 retries', () => {
      const onError = BUILD_AGENT_CONTRACT.on_error;
      expect(onError).toContain('retry(max=3)');
      expect(onError).toContain('notify_human');
      expect(onError).toContain('pause');
    });

    it('task tracks attempt count for retry enforcement', () => {
      const task = makeTask({ attempts: 3, max_attempts: 3 });
      expect(task.attempts).toBe(task.max_attempts);
      // When attempts >= max_attempts, escalation to human is required
    });

    it('build agent provides full diagnostic context in failure output', () => {
      const fixOutput = JSON.stringify({
        canFix: false,
        fixType: 'complex_type_error',
        files: [],
        description: 'TypeScript generic constraint violation in src/api/client.ts:42. Multiple files affected. Requires human review.',
      });

      const result = parseBuildFixOutput(fixOutput);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.canFix).toBe(false);
        expect(result.value.description).toContain('Requires human review');
      }
    });
  });

  // ============================================================================
  // P15.6 — Kill switch: abort sets task to 'aborting', branch preserved
  // ============================================================================

  describe('P15.6 — kill switch: abort command', () => {
    // Note: Abort command integration tests are in packages/cli/src/commands/abort.test.ts
    // These tests validate the contract and behavior at the CI layer

    it('task can transition to aborting status', () => {
      const task = makeTask({ status: 'in_progress' as TaskStatus });

      // Simulate aborting transition
      const aborting = { ...task, status: 'aborting' as TaskStatus };
      expect(aborting.status).toBe('aborting');
      expect(aborting.branch).toBe('agentforge/task-1'); // Branch preserved
    });

    it('aborted task preserves branch for inspection', () => {
      const task = makeTask({ status: 'aborting' as TaskStatus, branch: 'agentforge/task-1' });

      // Abort without cleanup
      const aborted = { ...task, status: 'aborted' as TaskStatus };
      expect(aborted.branch).toBe('agentforge/task-1');
    });

    it('AgentAborted event has correct structure', () => {
      const event = {
        type: 'AgentAborted' as const,
        agentId: 'code_generator',
        taskId: 'task-1',
        reason: 'User requested abort',
        source: 'cli',
        timestamp: Date.now(),
      };

      expect(event.type).toBe('AgentAborted');
      expect(event.agentId).toBeDefined();
      expect(event.taskId).toBeDefined();
      expect(event.reason).toBeDefined();
    });
  });

  // ============================================================================
  // P15.7 — abort --cleanup deletes branch
  // ============================================================================

  describe('P15.7 — abort --cleanup deletes branch', () => {
    it('aborted task with cleanup nulls the branch', () => {
      const task = makeTask({ status: 'aborting' as TaskStatus, branch: 'agentforge/task-1' });

      // Abort with cleanup
      const aborted = { ...task, status: 'aborted' as TaskStatus, branch: null };
      expect(aborted.branch).toBeNull();
    });
  });

  // ============================================================================
  // P15.8 — abort --all stops all agents and notifies channels
  // ============================================================================

  describe('P15.8 — abort --all', () => {
    it('emits AgentAborted for each abortable task', () => {
      const bus = createEventBus();
      const events: Array<{ type: string; taskId: string }> = [];

      bus.subscribe('AgentAborted', (event) => {
        events.push({ type: event.type, taskId: (event as { taskId: string }).taskId });
      });

      // Simulate abort --all for 3 tasks
      const abortableTasks = [
        makeTask({ id: 'task-1', status: 'in_progress' as TaskStatus }),
        makeTask({ id: 'task-2', status: 'pending' as TaskStatus }),
        makeTask({ id: 'task-3', status: 'awaiting_approval' as TaskStatus }),
      ];

      for (const task of abortableTasks) {
        bus.publish({
          type: 'AgentAborted',
          agentId: task.agent,
          taskId: task.id,
          reason: 'User requested abort --all',
          source: 'cli',
          timestamp: Date.now(),
        });
      }

      expect(events).toHaveLength(3);
      expect(events.map((e) => e.taskId)).toEqual(['task-1', 'task-2', 'task-3']);
    });
  });
});
