/**
 * Tests for the shared createPipelineContext() factory (M1 Phase 1, D5).
 */

import type { LLMProviderRef, MCPClient } from '@agentforge/core';
import { createPipelineContext } from '../pipeline-context.js';

function createMockProvider(): LLMProviderRef {
  return {
    name: 'test',
    complete: jest.fn(),
    stream: jest.fn(),
    estimateCost: jest.fn().mockReturnValue({ inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, inputTokens: 0, outputTokens: 0 }),
  };
}

describe('createPipelineContext', () => {
  it('creates AgentContext with required fields', () => {
    const ctx = createPipelineContext({
      taskId: 'task-1',
      projectRoot: '/tmp/test-project',
    });

    expect(ctx.taskId).toBe('task-1');
    expect(ctx.projectRoot).toBe('/tmp/test-project');
    expect(ctx.eventBus).toBeDefined();
    expect(ctx.fs).toBeDefined();
    expect(ctx.mcpClient).toBeUndefined();
  });

  it('threads mcpClient when provided', () => {
    const mockMcpClient = { execute: jest.fn() } as unknown as MCPClient;
    const ctx = createPipelineContext({
      taskId: 'task-2',
      projectRoot: '/tmp/test',
      mcpClient: mockMcpClient,
    });

    expect(ctx.mcpClient).toBe(mockMcpClient);
  });

  it('creates AgentContext without mcpClient', () => {
    const ctx = createPipelineContext({
      taskId: 'task-3',
      projectRoot: '/tmp/test',
    });

    expect(ctx.mcpClient).toBeUndefined();
  });

  it('resolveProvider returns Ok when providerFactory is provided', () => {
    const mockProvider = createMockProvider();
    const ctx = createPipelineContext({
      taskId: 'task-4',
      projectRoot: '/tmp/test',
      providerFactory: () => mockProvider,
    });

    const result = ctx.resolveProvider('claude-sonnet-4-6');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(mockProvider);
    }
  });

  it('resolveProvider returns Err when providerFactory is absent', () => {
    const ctx = createPipelineContext({
      taskId: 'task-5',
      projectRoot: '/tmp/test',
    });

    const result = ctx.resolveProvider('claude-sonnet-4-6');
    expect(result.ok).toBe(false);
  });

  it('threads manifest when provided', () => {
    const manifest = { agents: {} } as unknown as Pick<import('@agentforge/core').ProjectManifest, 'agents'>;
    const ctx = createPipelineContext({
      taskId: 'task-6',
      projectRoot: '/tmp/test',
      manifest,
    });

    expect(ctx.manifest).toBe(manifest);
  });

  it('runGovernance is defined and returns a function', () => {
    const ctx = createPipelineContext({
      taskId: 'task-7',
      projectRoot: '/tmp/test',
    });

    expect(typeof ctx.runGovernance).toBe('function');
  });
});
