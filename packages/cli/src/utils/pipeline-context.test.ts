/**
 * Tests for CLI pipeline-context wrapper (M1 Phase 1, D5).
 *
 * Verifies the CLI's positional-parameter wrapper delegates to
 * the shared createPipelineContext() in agents-ux.
 */

import type { LLMProviderRef, MCPClient } from '@agentforge/core';
import { createPipelineContext } from './pipeline-context.js';

function createMockProvider(): LLMProviderRef {
  return {
    name: 'test',
    complete: jest.fn(),
    stream: jest.fn(),
    estimateCost: jest.fn().mockReturnValue({ inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, inputTokens: 0, outputTokens: 0 }),
  };
}

describe('CLI createPipelineContext wrapper', () => {
  it('returns AgentContext with mcpClient set', () => {
    const mockMcp = { execute: jest.fn() } as unknown as MCPClient;
    const ctx = createPipelineContext('task-1', mockMcp, '/tmp/test');

    expect(ctx.taskId).toBe('task-1');
    expect(ctx.mcpClient).toBe(mockMcp);
    expect(ctx.projectRoot).toBe('/tmp/test');
  });

  it('defaults baseDir to process.cwd() when not provided', () => {
    const ctx = createPipelineContext('task-2');
    expect(ctx.projectRoot).toBe(process.cwd());
  });

  it('resolveProvider returns Err when providerFactory is absent', () => {
    const ctx = createPipelineContext('task-3', undefined, '/tmp/test');
    const result = ctx.resolveProvider('claude-sonnet-4-6');
    expect(result.ok).toBe(false);
  });

  it('resolveProvider returns Ok when providerFactory is provided', () => {
    const mockProvider = createMockProvider();
    const ctx = createPipelineContext(
      'task-4',
      undefined,
      '/tmp/test',
      () => mockProvider,
    );

    const result = ctx.resolveProvider('claude-sonnet-4-6');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(mockProvider);
    }
  });

  it('threads manifest to agent context', () => {
    const manifest = { agents: {} } as unknown as Pick<import('@agentforge/core').ProjectManifest, 'agents'>;
    const ctx = createPipelineContext(
      'task-5',
      undefined,
      '/tmp/test',
      undefined,
      manifest,
    );

    expect(ctx.manifest).toBe(manifest);
  });
});
