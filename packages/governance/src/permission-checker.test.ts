import type { AgentContract } from '@agentforge/core';
import { checkPermission } from './permission-checker.js';
import type { AgentAction } from './types.js';

/**
 * Helper to build a minimal AgentContract for testing.
 */
const makeAgent = (
  overrides: Partial<AgentContract> = {},
): AgentContract => ({
  role: 'test-agent',
  description: 'A test agent',
  category: 'code',
  provider: 'anthropic:claude-sonnet',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 100_000 },
  tools: [],
  permissions: ['read_code', 'write_code'],
  denied: [],
  hitl_policy: 'fully_autonomous',
  budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 2.0 },
  on_complete: 'CodeGenComplete',
  on_error: 'CodeGenFailed',
  context: {},
  ...overrides,
});

/**
 * Helper to build a minimal AgentAction for testing.
 */
const makeAction = (
  overrides: Partial<AgentAction> = {},
): AgentAction => ({
  agentId: 'test-agent',
  taskId: 'task-001',
  type: 'write_code',
  target: 'src/foo.ts',
  description: 'Write implementation for foo',
  phase: 'code',
  timestamp: new Date().toISOString(),
  ...overrides,
});

describe('checkPermission', () => {
  it('allows an action when the permission is explicitly granted', () => {
    const agent = makeAgent({ permissions: ['read_code', 'write_code'] });
    const action = makeAction({ type: 'write_code' });

    const result = checkPermission(agent, action);

    expect(result.ok).toBe(true);
  });

  it('allows any action when the agent has wildcard permission', () => {
    const agent = makeAgent({ permissions: ['*'] });
    const action = makeAction({ type: 'deploy_production' });

    const result = checkPermission(agent, action);

    expect(result.ok).toBe(true);
  });

  it('denies an action when the permission is not granted', () => {
    const agent = makeAgent({ permissions: ['read_code'] });
    const action = makeAction({ type: 'deploy_production' });

    const result = checkPermission(agent, action);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PERMISSION_DENIED');
      expect(result.error.recoverable).toBe(false);
      expect(result.error.context?.explicitlyDenied).toBe(false);
      expect(result.error.agentId).toBe('test-agent');
      expect(result.error.taskId).toBe('task-001');
    }
  });

  it('denies an action that is explicitly in the denied list', () => {
    const agent = makeAgent({
      permissions: ['read_code', 'write_code', 'deploy_production'],
      denied: ['deploy_production'],
    });
    const action = makeAction({ type: 'deploy_production' });

    const result = checkPermission(agent, action);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PERMISSION_DENIED');
      expect(result.error.context?.explicitlyDenied).toBe(true);
      expect(result.error.message).toContain('explicitly denied');
    }
  });

  it('deny-list takes precedence over wildcard permission', () => {
    const agent = makeAgent({
      permissions: ['*'],
      denied: ['deploy_production'],
    });
    const action = makeAction({ type: 'deploy_production' });

    const result = checkPermission(agent, action);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.context?.explicitlyDenied).toBe(true);
    }
  });

  it('includes target in error context', () => {
    const agent = makeAgent({ permissions: [] });
    const action = makeAction({ type: 'write_code', target: 'src/secret.ts' });

    const result = checkPermission(agent, action);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.context?.target).toBe('src/secret.ts');
    }
  });

  it('allows read_spec for an agent with that permission', () => {
    const agent = makeAgent({ permissions: ['read_spec', 'write_spec'] });
    const action = makeAction({ type: 'read_spec', phase: 'spec' });

    const result = checkPermission(agent, action);

    expect(result.ok).toBe(true);
  });

  it('denies when agent has empty permissions list', () => {
    const agent = makeAgent({ permissions: [] });
    const action = makeAction({ type: 'read_code' });

    const result = checkPermission(agent, action);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PERMISSION_DENIED');
    }
  });

  it('includes agent role in denial message', () => {
    const agent = makeAgent({ role: 'spec-writer', permissions: [] });
    const action = makeAction({ type: 'deploy_production' });

    const result = checkPermission(agent, action);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('spec-writer');
      expect(result.error.message).toContain('deploy_production');
    }
  });
});
