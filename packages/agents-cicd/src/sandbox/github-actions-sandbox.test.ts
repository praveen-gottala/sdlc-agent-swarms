import { triggerWorkflow, waitForResult, getRunLogs } from './github-actions-sandbox.js';
import type { MCPClient } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';

// ============================================================================
// Helpers
// ============================================================================

const makeMCPClient = (overrides: Partial<MCPClient> = {}): MCPClient => ({
  callTool: jest.fn().mockResolvedValue(Ok({ run_id: 'run_123' })),
  listTools: jest.fn().mockResolvedValue(Ok([])),
  isAvailable: jest.fn().mockResolvedValue(true),
  ...overrides,
});

// ============================================================================
// triggerWorkflow
// ============================================================================

describe('triggerWorkflow', () => {
  it('triggers workflow and returns run ID', async () => {
    const mcp = makeMCPClient();
    const result = await triggerWorkflow(mcp, 'feature/test');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('run_123');
    }
    expect(mcp.callTool).toHaveBeenCalledWith('github', 'trigger_workflow', {
      workflow: 'agentforge-ci.yml',
      ref: 'feature/test',
    });
  });

  it('uses custom workflow name when provided', async () => {
    const mcp = makeMCPClient();
    await triggerWorkflow(mcp, 'main', { workflow: 'custom-ci.yml' });

    expect(mcp.callTool).toHaveBeenCalledWith('github', 'trigger_workflow', {
      workflow: 'custom-ci.yml',
      ref: 'main',
    });
  });

  it('returns error when MCP call fails', async () => {
    const mcp = makeMCPClient({
      callTool: jest.fn().mockResolvedValue(
        Err({ code: 'MCP_UNAVAILABLE', message: 'GitHub down', recoverable: true }),
      ),
    });

    const result = await triggerWorkflow(mcp, 'feature/test');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CI_FAILED');
    }
  });

  it('returns error when no run ID is returned', async () => {
    const mcp = makeMCPClient({
      callTool: jest.fn().mockResolvedValue(Ok({})),
    });

    const result = await triggerWorkflow(mcp, 'feature/test');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('no run ID');
    }
  });
});

// ============================================================================
// waitForResult
// ============================================================================

describe('waitForResult', () => {
  it('returns passed when workflow succeeds', async () => {
    const mcp = makeMCPClient({
      callTool: jest.fn()
        .mockResolvedValueOnce(Ok({ status: 'completed', conclusion: 'success' }))
        .mockResolvedValueOnce(Ok('Build logs here')),
    });

    const result = await waitForResult(mcp, 'run_123', 1);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('passed');
      expect(result.value.logs).toBe('Build logs here');
      expect(result.value.duration).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns failed when workflow fails', async () => {
    const mcp = makeMCPClient({
      callTool: jest.fn()
        .mockResolvedValueOnce(Ok({ status: 'completed', conclusion: 'failure' }))
        .mockResolvedValueOnce(Ok('Error: test failed')),
    });

    const result = await waitForResult(mcp, 'run_123', 1);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('failed');
    }
  });

  it('returns error when polling fails', async () => {
    const mcp = makeMCPClient({
      callTool: jest.fn().mockResolvedValue(
        Err({ code: 'MCP_UNAVAILABLE', message: 'Network error', recoverable: true }),
      ),
    });

    const result = await waitForResult(mcp, 'run_123', 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CI_FAILED');
    }
  });
});

// ============================================================================
// getRunLogs
// ============================================================================

describe('getRunLogs', () => {
  it('fetches logs from MCP', async () => {
    const mcp = makeMCPClient({
      callTool: jest.fn().mockResolvedValue(Ok('Full build log output')),
    });

    const result = await getRunLogs(mcp, 'run_123');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('Full build log output');
    }
    expect(mcp.callTool).toHaveBeenCalledWith('github', 'get_workflow_logs', {
      run_id: 'run_123',
    });
  });

  it('returns error when fetch fails', async () => {
    const mcp = makeMCPClient({
      callTool: jest.fn().mockResolvedValue(
        Err({ code: 'MCP_UNAVAILABLE', message: 'Not found', recoverable: true }),
      ),
    });

    const result = await getRunLogs(mcp, 'run_999');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CI_FAILED');
    }
  });
});
