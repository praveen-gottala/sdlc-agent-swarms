import { resolveModelForRole } from './model-resolver.js';
import { ENV_MODEL_OVERRIDE } from '../constants.js';

describe('resolveModelForRole', () => {
  const originalEnv = process.env[ENV_MODEL_OVERRIDE];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_MODEL_OVERRIDE];
    } else {
      process.env[ENV_MODEL_OVERRIDE] = originalEnv;
    }
  });

  it('returns hardcoded default when no manifest and no env var', () => {
    delete process.env[ENV_MODEL_OVERRIDE];
    expect(resolveModelForRole('backend_coder', 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
  });

  it('returns manifest default when set', () => {
    delete process.env[ENV_MODEL_OVERRIDE];
    const manifest = {
      agents: {
        providers: { default: 'claude-haiku-4-5' },
        sandbox: { type: 'docker', timeout_minutes: 5, max_retries: 2 },
        orchestration: { max_concurrent_agents: 3, ci_wait_strategy: 'poll' },
      },
    };
    expect(resolveModelForRole('backend_coder', 'claude-sonnet-4-6', manifest)).toBe('claude-haiku-4-5');
  });

  it('returns per-role override when set', () => {
    delete process.env[ENV_MODEL_OVERRIDE];
    const manifest = {
      agents: {
        providers: {
          default: 'claude-haiku-4-5',
          overrides: { spec_writer: 'claude-opus-4-6' },
        },
        sandbox: { type: 'docker', timeout_minutes: 5, max_retries: 2 },
        orchestration: { max_concurrent_agents: 3, ci_wait_strategy: 'poll' },
      },
    };
    expect(resolveModelForRole('spec_writer', 'claude-sonnet-4-6', manifest)).toBe('claude-opus-4-6');
    // Other roles still get manifest default
    expect(resolveModelForRole('backend_coder', 'claude-sonnet-4-6', manifest)).toBe('claude-haiku-4-5');
  });

  it('returns env var override over everything', () => {
    process.env[ENV_MODEL_OVERRIDE] = 'claude-opus-4-6';
    const manifest = {
      agents: {
        providers: {
          default: 'claude-haiku-4-5',
          overrides: { backend_coder: 'claude-sonnet-4-6' },
        },
        sandbox: { type: 'docker', timeout_minutes: 5, max_retries: 2 },
        orchestration: { max_concurrent_agents: 3, ci_wait_strategy: 'poll' },
      },
    };
    expect(resolveModelForRole('backend_coder', 'claude-sonnet-4-6', manifest)).toBe('claude-opus-4-6');
  });

  it('falls through when env var is empty string', () => {
    process.env[ENV_MODEL_OVERRIDE] = '';
    expect(resolveModelForRole('backend_coder', 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
  });

  it('falls through when manifest has no overrides for role', () => {
    delete process.env[ENV_MODEL_OVERRIDE];
    const manifest = {
      agents: {
        providers: {
          default: 'claude-haiku-4-5',
          overrides: { other_role: 'claude-opus-4-6' },
        },
        sandbox: { type: 'docker', timeout_minutes: 5, max_retries: 2 },
        orchestration: { max_concurrent_agents: 3, ci_wait_strategy: 'poll' },
      },
    };
    expect(resolveModelForRole('backend_coder', 'claude-sonnet-4-6', manifest)).toBe('claude-haiku-4-5');
  });

  it('handles undefined manifest gracefully', () => {
    delete process.env[ENV_MODEL_OVERRIDE];
    expect(resolveModelForRole('backend_coder', 'claude-sonnet-4-6', undefined)).toBe('claude-sonnet-4-6');
  });
});
