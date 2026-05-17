/**
 * Tests for generateCode node — verifies the tool-use loop
 * executes tool calls, collects artifacts, and respects max iterations.
 *
 * Uses a mock provider that returns controlled tool calls.
 */

import type { TaskNode, ImplementerContextMetadata } from '@agentforge/core';
import type { LLMProvider, CompletionResult, ProviderError, Prompt, CompletionOptions } from '@agentforge/providers';
import { createGenerateCode } from './generate-code.js';
import type { ImplementerDeps } from '../../deps.js';
import type { ImplementerStateType } from '../state.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Result } from '@agentforge/core';

function makeCost() {
  return { inputCostUsd: 0.001, outputCostUsd: 0.001, totalCostUsd: 0.002, model: 'claude-opus-4-6', timestamp: new Date().toISOString() };
}

function makeOkResult(result: CompletionResult): Result<CompletionResult, ProviderError> {
  return { ok: true, value: result } as Result<CompletionResult, ProviderError>;
}

function makeToolCallResult(
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>,
  content = '',
): CompletionResult {
  return {
    content,
    toolCalls: toolCalls.map((tc, i) => ({ id: `call_${i}`, name: tc.name, args: tc.args })),
    usage: { inputTokens: 100, outputTokens: 50 },
    cost: makeCost(),
    model: 'claude-opus-4-6',
    latencyMs: 500,
    finishReason: 'tool_use' as const,
  };
}

function makeStopResult(content = 'Done.'): CompletionResult {
  return {
    content,
    toolCalls: [],
    usage: { inputTokens: 100, outputTokens: 10 },
    cost: makeCost(),
    model: 'claude-opus-4-6',
    latencyMs: 200,
    finishReason: 'stop' as const,
  };
}

function makeMockStream() {
  return async function*() {
    yield {
      type: 'done' as const,
      usage: { inputTokens: 0, outputTokens: 0 },
      cost: makeCost(),
    };
  };
}

function makeMockEstimate() {
  return { estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: 0, confidence: 'high' as const };
}

function makeState(
  projectRoot: string,
  overrides: Partial<ImplementerStateType> = {},
): ImplementerStateType {
  return {
    task: {
      id: 'T1', title: 'Test task', description: 'Test', filePaths: ['src/test.ts'],
      dependencies: [], writeOrder: 0, type: 'backend', mode: 'NEW',
      estimatedTokenBudget: 10000, contextRefs: [], patternRefs: [], acceptanceCriteriaIds: [],
    } as TaskNode,
    contractBundle: null,
    existingDesignSpecs: null,
    projectRoot,
    implementerPrompt: '## Task\n\nWrite a test file.',
    metadata: { taskId: 'T1', taskType: 'NEW', sliceStrategy: 'none', designSpecIncluded: false } as ImplementerContextMetadata,
    designResult: null,
    artifacts: [],
    completionReport: null,
    errors: [],
    ...overrides,
  };
}

describe('generateCode', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'gen-code-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('executes tool calls and collects artifacts from write_file', async () => {
    let callCount = 0;
    const mockProvider: LLMProvider = {
      name: 'mock', models: ['claude-opus-4-6'],
      complete: async (_prompt: Prompt, _opts: CompletionOptions) => {
        callCount++;
        if (callCount === 1) {
          return makeOkResult(makeToolCallResult([
            { name: 'write_file', args: { path: 'src/test.ts', contents: 'export const x = 1;' } },
          ]));
        }
        return makeOkResult(makeStopResult());
      },
      stream: makeMockStream(),
      isAvailable: async () => true,
      estimateCost: () => makeMockEstimate(),
    };

    const deps: ImplementerDeps = { provider: mockProvider, projectRoot: tempDir, projectId: 'test' };
    const node = createGenerateCode(deps);
    const result = await node(makeState(tempDir));

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts![0]).toMatchObject({ path: 'src/test.ts', action: 'created' });
    expect(callCount).toBe(2);
  });

  it('respects max iteration limit', async () => {
    let callCount = 0;
    const mockProvider: LLMProvider = {
      name: 'mock', models: ['claude-opus-4-6'],
      complete: async () => {
        callCount++;
        return makeOkResult(makeToolCallResult([
          { name: 'read_file', args: { path: 'nonexistent.ts' } },
        ]));
      },
      stream: makeMockStream(),
      isAvailable: async () => true,
      estimateCost: () => makeMockEstimate(),
    };

    const deps: ImplementerDeps = { provider: mockProvider, projectRoot: tempDir, projectId: 'test' };
    const node = createGenerateCode(deps);
    await node(makeState(tempDir));

    expect(callCount).toBe(20);
  });

  it('returns error when no prompt is provided', async () => {
    const deps: ImplementerDeps = { provider: {} as LLMProvider, projectRoot: tempDir, projectId: 'test' };
    const node = createGenerateCode(deps);
    const result = await node(makeState(tempDir, { implementerPrompt: '' }));

    expect(result.errors).toContain('generateCode: no implementer prompt assembled');
  });

  it('handles provider errors gracefully', async () => {
    const mockProvider: LLMProvider = {
      name: 'mock', models: ['claude-opus-4-6'],
      complete: async () => ({ ok: false as const, error: { code: 'PROVIDER_DOWN' as const, status: 500, message: 'Service unavailable' } }),
      stream: makeMockStream(),
      isAvailable: async () => true,
      estimateCost: () => makeMockEstimate(),
    };

    const deps: ImplementerDeps = { provider: mockProvider, projectRoot: tempDir, projectId: 'test' };
    const node = createGenerateCode(deps);
    const result = await node(makeState(tempDir));

    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.errors![0]).toContain('LLM error');
  });
});
