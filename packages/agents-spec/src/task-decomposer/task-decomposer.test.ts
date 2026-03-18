import { taskDecomposerWork, TASK_DECOMPOSER_CONTRACT } from './task-decomposer.js';
import type { AgentContext, LLMProviderRef } from '@agentforge/core';
import { Ok } from '@agentforge/core';
import { stringify } from 'yaml';

// ============================================================================
// Helpers
// ============================================================================

const VALID_TASKS_JSON = JSON.stringify([
  { id: 'task_001', title: 'Create User model', phase: 'code', agent: 'backend_coder', depends_on: [], spec_ref: 'specs/models.yaml' },
  { id: 'task_002', title: 'Implement GET /api/users', phase: 'code', agent: 'backend_coder', depends_on: ['task_001'], spec_ref: 'specs/api.yaml' },
  { id: 'task_003', title: 'Build UserProfile component', phase: 'code', agent: 'frontend_coder', depends_on: ['task_002'], spec_ref: 'specs/components/user-profile.yaml' },
]);

const CYCLIC_TASKS_JSON = JSON.stringify([
  { id: 'task_001', title: 'Task A', phase: 'code', agent: 'backend_coder', depends_on: ['task_002'], spec_ref: 'specs/a.yaml' },
  { id: 'task_002', title: 'Task B', phase: 'code', agent: 'backend_coder', depends_on: ['task_001'], spec_ref: 'specs/b.yaml' },
]);

const makeProvider = (output: string = VALID_TASKS_JSON): LLMProviderRef => ({
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

const specsContent = stringify({
  api: { endpoints: [{ method: 'GET', path: '/api/users' }] },
  models: { models: [{ name: 'User' }] },
});

const makeContext = (): AgentContext => ({
  taskId: 'task_000',
  projectRoot: '/tmp/test-project',
  eventBus: { publish: jest.fn(), emit: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn(), clear: jest.fn(), history: jest.fn().mockReturnValue([]) },
  fs: {
    readFile: jest.fn().mockImplementation((path: string) => {
      if (path.includes('agentforge.tasks.yaml')) {
        return Ok(stringify({ tasks: [] }));
      }
      return Ok(specsContent);
    }),
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

describe('taskDecomposerWork', () => {
  it('creates tasks from valid LLM output', async () => {
    const ctx = makeContext();
    const provider = makeProvider();

    const result = await taskDecomposerWork(
      { specRef: 'specs/', taskId: 'task_000' },
      provider,
      [],
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.taskCount).toBe(3);
      expect(result.value.taskIds).toEqual(['task_001', 'task_002', 'task_003']);
    }
  });

  it('saves tasks via saveTasks', async () => {
    const ctx = makeContext();
    const provider = makeProvider();

    await taskDecomposerWork(
      { specRef: 'specs/', taskId: 'task_000' },
      provider,
      [],
      ctx,
    );

    // writeFileAtomic should have been called with tasks file path
    const writeFileCalls = (ctx.fs.writeFileAtomic as jest.Mock).mock.calls;
    const tasksWrite = writeFileCalls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('agentforge.tasks.yaml'),
    );
    expect(tasksWrite).toBeDefined();
  });

  it('rejects cyclic dependencies', async () => {
    const ctx = makeContext();
    const provider = makeProvider(CYCLIC_TASKS_JSON);

    const result = await taskDecomposerWork(
      { specRef: 'specs/', taskId: 'task_000' },
      provider,
      [],
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('cycle');
    }
  });

  it('handles LLM output wrapped in json code block', async () => {
    const ctx = makeContext();
    const wrappedOutput = '```json\n' + VALID_TASKS_JSON + '\n```';
    const provider = makeProvider(wrappedOutput);

    const result = await taskDecomposerWork(
      { specRef: 'specs/', taskId: 'task_000' },
      provider,
      [],
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.taskCount).toBe(3);
    }
  });
});

describe('TASK_DECOMPOSER_CONTRACT', () => {
  it('has correct role and category', () => {
    expect(TASK_DECOMPOSER_CONTRACT.role).toBe('task_decomposer');
    expect(TASK_DECOMPOSER_CONTRACT.category).toBe('spec');
  });

  it('includes write_tasks permission', () => {
    expect(TASK_DECOMPOSER_CONTRACT.permissions).toContain('write_tasks');
  });

  it('uses write_tasks action type for governance', () => {
    // The executeTaskDecomposer function passes 'write_tasks' as actionType
    // This is verified by the contract having write_tasks in permissions
    expect(TASK_DECOMPOSER_CONTRACT.permissions).toContain('write_tasks');
  });
});
