import type { MCPClient } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import { createTracedMCPClient } from '../traced-mcp-client.js';

function createMockMCPClient(): MCPClient & { calls: Array<{ server: string; method: string }> } {
  const calls: Array<{ server: string; method: string }> = [];
  return {
    calls,
    async callTool(server: string, method: string, _params: Readonly<Record<string, unknown>>): Promise<Result<unknown>> {
      calls.push({ server, method });
      return { ok: true, value: { result: 'mock' } };
    },
    async listTools() {
      return { ok: true as const, value: [] };
    },
    async isAvailable() {
      return true;
    },
  };
}

describe('createTracedMCPClient', () => {
  it('returns client unchanged when LANGFUSE_SECRET_KEY is not set', () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    const mock = createMockMCPClient();
    const traced = createTracedMCPClient(mock);
    expect(traced).toBe(mock);
  });

  it('delegates callTool to the original client', async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    const mock = createMockMCPClient();
    const traced = createTracedMCPClient(mock);

    const result = await traced.callTool('penpot', 'execute_code', { script: 'test' });
    expect(result.ok).toBe(true);
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]).toEqual({ server: 'penpot', method: 'execute_code' });
  });

  it('delegates listTools and isAvailable', async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    const mock = createMockMCPClient();
    const traced = createTracedMCPClient(mock);

    const tools = await traced.listTools('penpot');
    expect(tools.ok).toBe(true);

    const available = await traced.isAvailable('penpot');
    expect(available).toBe(true);
  });
});
