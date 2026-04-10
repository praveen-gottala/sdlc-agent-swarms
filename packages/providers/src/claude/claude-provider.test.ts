import { createClaudeProvider } from './claude-provider.js';
import type { Prompt, CompletionOptions } from '../types.js';

// Mock the Anthropic SDK
const mockCreate = jest.fn();
const mockStream = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  class MockAPIError extends Error {
    status: number;
    headers: Record<string, string>;
    constructor(status: number, message: string, headers: Record<string, string> = {}) {
      super(message);
      this.name = 'APIError';
      this.status = status;
      this.headers = headers;
    }
  }

  const MockAnthropic = jest.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
      stream: mockStream,
    },
  }));

  // Attach static types
  (MockAnthropic as unknown as Record<string, unknown>).APIError = MockAPIError;

  return { __esModule: true, default: MockAnthropic, APIError: MockAPIError };
});

// Mock the Vertex SDK — shares mockStream so we can inspect calls
const mockVertexStream = jest.fn();
const mockVertexCreate = jest.fn();

jest.mock('@anthropic-ai/vertex-sdk', () => {
  const MockAnthropicVertex = jest.fn().mockImplementation(() => ({
    messages: {
      create: mockVertexCreate,
      stream: mockVertexStream,
    },
  }));
  return { __esModule: true, default: MockAnthropicVertex };
});

/** Helper: make mockStream return an object whose finalMessage() resolves to the given response. */
function mockStreamResolving(response: Record<string, unknown>): void {
  mockStream.mockReturnValue({
    finalMessage: () => Promise.resolve(response),
  });
}

/** Helper: make mockStream return an object whose finalMessage() rejects with the given error. */
function mockStreamRejecting(error: unknown): void {
  mockStream.mockReturnValue({
    finalMessage: () => Promise.reject(error),
  });
}

const testPrompt: Prompt = {
  system: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'Hello' }],
};

const testOptions: CompletionOptions = {
  model: 'claude-sonnet-4-6',
  maxTokens: 1024,
  temperature: 0,
};

describe('ClaudeProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('properties', () => {
    it('has correct name and models', () => {
      const provider = createClaudeProvider('claude-sonnet-4-6', { apiKey: 'test' });
      expect(provider.name).toBe('claude');
      expect(provider.models).toContain('claude-sonnet-4-6');
      expect(provider.models).toContain('claude-opus-4-6');
      expect(provider.models).toContain('claude-haiku-4-5');
    });
  });

  describe('complete', () => {
    it('returns a successful CompletionResult', async () => {
      mockStreamResolving({
        content: [{ type: 'text', text: 'Hello! How can I help?' }],
        usage: { input_tokens: 20, output_tokens: 10 },
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-6',
      });

      const provider = createClaudeProvider('claude-sonnet-4-6', { apiKey: 'test' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Hello! How can I help?');
        expect(result.value.toolCalls).toEqual([]);
        expect(result.value.usage.inputTokens).toBe(20);
        expect(result.value.usage.outputTokens).toBe(10);
        expect(result.value.model).toBe('claude-sonnet-4-6');
        expect(result.value.finishReason).toBe('stop');
        expect(result.value.cost.totalCostUsd).toBeGreaterThan(0);
        expect(result.value.latencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('extracts tool calls from response', async () => {
      mockStreamResolving({
        content: [
          { type: 'text', text: 'Let me check that.' },
          {
            type: 'tool_use',
            id: 'call_123',
            name: 'read_file',
            input: { path: '/src/index.ts' },
          },
        ],
        usage: { input_tokens: 30, output_tokens: 20 },
        stop_reason: 'tool_use',
        model: 'claude-sonnet-4-6',
      });

      const provider = createClaudeProvider('claude-sonnet-4-6', { apiKey: 'test' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.toolCalls).toHaveLength(1);
        expect(result.value.toolCalls[0]).toEqual({
          id: 'call_123',
          name: 'read_file',
          args: { path: '/src/index.ts' },
        });
        expect(result.value.finishReason).toBe('tool_use');
      }
    });

    it('tracks cache tokens when present', async () => {
      mockStreamResolving({
        content: [{ type: 'text', text: 'cached response' }],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 80,
          cache_creation_input_tokens: 20,
        },
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-6',
      });

      const provider = createClaudeProvider('claude-sonnet-4-6', { apiKey: 'test' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.usage.cacheReadTokens).toBe(80);
        expect(result.value.usage.cacheWriteTokens).toBe(20);
      }
    });

    it('maps 429 to RATE_LIMITED error', async () => {
      const { APIError } = jest.requireMock('@anthropic-ai/sdk') as { APIError: new (status: number, message: string, headers?: Record<string, string>) => Error };
      mockStreamRejecting(
        new APIError(429, 'Rate limited', { 'retry-after': '30' }),
      );

      const provider = createClaudeProvider('claude-sonnet-4-6', { apiKey: 'test' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('RATE_LIMITED');
        if (result.error.code === 'RATE_LIMITED') {
          expect(result.error.retryAfterMs).toBe(30000);
        }
      }
    });

    it('maps 401 to AUTH_FAILED error', async () => {
      const { APIError } = jest.requireMock('@anthropic-ai/sdk') as { APIError: new (status: number, message: string) => Error };
      mockStreamRejecting(new APIError(401, 'Invalid API key'));

      const provider = createClaudeProvider('claude-sonnet-4-6', { apiKey: 'bad-key' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_FAILED');
      }
    });

    it('maps 500 to PROVIDER_DOWN error', async () => {
      const { APIError } = jest.requireMock('@anthropic-ai/sdk') as { APIError: new (status: number, message: string) => Error };
      mockStreamRejecting(new APIError(500, 'Internal server error'));

      const provider = createClaudeProvider('claude-sonnet-4-6', { apiKey: 'test' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROVIDER_DOWN');
      }
    });

    it('maps unknown errors to INVALID_RESPONSE', async () => {
      mockStreamRejecting(new Error('Network failure'));

      const provider = createClaudeProvider('claude-sonnet-4-6', { apiKey: 'test' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_RESPONSE');
      }
    });

    it('passes output_config when responseSchema is provided', async () => {
      const jsonContent = JSON.stringify({ name: 'test', value: 42 });
      mockStreamResolving({
        content: [{ type: 'text', text: jsonContent }],
        usage: { input_tokens: 20, output_tokens: 15 },
        stop_reason: 'end_turn',
      });

      const provider = createClaudeProvider('claude-sonnet-4-6', { apiKey: 'test' });
      const optionsWithSchema: CompletionOptions = {
        ...testOptions,
        responseSchema: {
          schema: {
            type: 'object',
            properties: { name: { type: 'string' }, value: { type: 'number' } },
            required: ['name', 'value'],
          },
        },
      };

      const result = await provider.complete(testPrompt, optionsWithSchema);

      // Verify output_config was passed to the SDK
      const callArgs = mockStream.mock.calls[0][0];
      expect(callArgs.output_config).toEqual({
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: { name: { type: 'string' }, value: { type: 'number' } },
            required: ['name', 'value'],
          },
        },
      });

      // Verify structured field is populated
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.structured).toEqual({ name: 'test', value: 42 });
        expect(result.value.content).toBe(jsonContent);
      }
    });

    it('does not include output_config when responseSchema is absent', async () => {
      mockStreamResolving({
        content: [{ type: 'text', text: 'plain text' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
      });

      const provider = createClaudeProvider('claude-sonnet-4-6', { apiKey: 'test' });
      await provider.complete(testPrompt, testOptions);

      const callArgs = mockStream.mock.calls[0][0];
      expect(callArgs.output_config).toBeUndefined();
    });

    it('does not set structured when responseSchema is absent', async () => {
      mockStreamResolving({
        content: [{ type: 'text', text: 'plain text' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
      });

      const provider = createClaudeProvider('claude-sonnet-4-6', { apiKey: 'test' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.structured).toBeUndefined();
      }
    });

    it('uses tool_use for structured output on Vertex AI', async () => {
      const structuredData = { name: 'test', value: 42 };
      mockVertexStream.mockReturnValue({
        finalMessage: () => Promise.resolve({
          content: [
            {
              type: 'tool_use',
              id: 'call_structured',
              name: '__structured_output',
              input: structuredData,
            },
          ],
          usage: { input_tokens: 25, output_tokens: 20 },
          stop_reason: 'tool_use',
        }),
      });

      // projectId without apiKey triggers Vertex path
      const provider = createClaudeProvider('claude-sonnet-4-6', { projectId: 'test-project', region: 'us-central1' });
      const optionsWithSchema: CompletionOptions = {
        ...testOptions,
        responseSchema: {
          schema: {
            type: 'object',
            properties: { name: { type: 'string' }, value: { type: 'number' } },
            required: ['name', 'value'],
          },
        },
      };

      const result = await provider.complete(testPrompt, optionsWithSchema);

      // Verify tool_choice was forced to __structured_output
      const callArgs = mockVertexStream.mock.calls[0][0];
      expect(callArgs.tool_choice).toEqual({ type: 'tool', name: '__structured_output' });
      expect(callArgs.tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: '__structured_output' }),
        ]),
      );

      // Verify output_config was NOT used (not supported on Vertex)
      expect(callArgs.output_config).toBeUndefined();

      // Verify structured field is populated from tool input
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.structured).toEqual(structuredData);
        // __structured_output should NOT appear in toolCalls
        expect(result.value.toolCalls).toEqual([]);
      }
    });

    it('forwards toolChoice to Anthropic API', async () => {
      mockStreamResolving({
        content: [{ type: 'tool_use', id: 'call_1', name: 'submit_design', input: { screen: 'test' } }],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: 'tool_use',
        model: 'claude-sonnet-4-6',
      });

      const provider = createClaudeProvider('claude-sonnet-4-6', { apiKey: 'test' });
      const prompt: Prompt = {
        system: 'test',
        messages: [{ role: 'user', content: 'test' }],
        tools: [{ name: 'submit_design', description: 'Submit design', parameters: { type: 'object', properties: {} } }],
      };

      await provider.complete(prompt, {
        ...testOptions,
        toolChoice: { type: 'tool', name: 'submit_design' },
      });

      expect(mockStream).toHaveBeenCalledWith(
        expect.objectContaining({
          tool_choice: { type: 'tool', name: 'submit_design' },
        }),
        expect.any(Object),
      );
    });

    it('passes tools to Anthropic format', async () => {
      mockStreamResolving({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
      });

      const promptWithTools: Prompt = {
        ...testPrompt,
        tools: [
          {
            name: 'read_file',
            description: 'Read a file',
            parameters: { type: 'object', properties: { path: { type: 'string' } } },
          },
        ],
      };

      const provider = createClaudeProvider('claude-sonnet-4-6', { apiKey: 'test' });
      await provider.complete(promptWithTools, testOptions);

      const callArgs = mockStream.mock.calls[0][0];
      expect(callArgs.tools).toBeDefined();
      expect(callArgs.tools[0].name).toBe('read_file');
      expect(callArgs.tools[0].input_schema).toBeDefined();
    });
  });

  describe('stream', () => {
    it('yields token chunks from text deltas', async () => {
      const mockEvents = [
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hello' },
        },
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: ' world' },
        },
        {
          type: 'message_stop',
        },
      ];

      mockStream.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          for (const event of mockEvents) {
            yield event;
          }
        },
        currentMessage: {
          usage: { input_tokens: 10, output_tokens: 5 },
          content: [],
        },
      });

      const provider = createClaudeProvider('claude-sonnet-4-6', { apiKey: 'test' });
      const chunks: unknown[] = [];

      for await (const chunk of provider.stream(testPrompt, testOptions)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0]).toMatchObject({ type: 'token', content: 'Hello' });
      expect(chunks[1]).toMatchObject({ type: 'token', content: ' world' });

      const doneChunk = chunks.find(
        (c) => (c as { type: string }).type === 'done',
      );
      expect(doneChunk).toBeDefined();
    });

    it('yields tool_call chunks when tool use blocks complete', async () => {
      const mockEvents = [
        {
          type: 'content_block_delta',
          delta: { type: 'input_json_delta', partial_json: '{"path":' },
        },
        {
          type: 'content_block_stop',
          index: 0,
        },
        {
          type: 'message_stop',
        },
      ];

      mockStream.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          for (const event of mockEvents) {
            yield event;
          }
        },
        currentMessage: {
          usage: { input_tokens: 15, output_tokens: 10 },
          content: [
            {
              type: 'tool_use',
              id: 'call_456',
              name: 'write_file',
              input: { path: '/out.ts', content: 'code' },
            },
          ],
        },
      });

      const provider = createClaudeProvider('claude-sonnet-4-6', { apiKey: 'test' });
      const chunks: unknown[] = [];

      for await (const chunk of provider.stream(testPrompt, testOptions)) {
        chunks.push(chunk);
      }

      const toolChunk = chunks.find(
        (c) => (c as { type: string }).type === 'tool_call',
      );
      expect(toolChunk).toMatchObject({
        type: 'tool_call',
        id: 'call_456',
        name: 'write_file',
        args: { path: '/out.ts', content: 'code' },
      });
    });
  });

  describe('estimateCost', () => {
    it('estimates cost based on prompt length', () => {
      const provider = createClaudeProvider('claude-sonnet-4-6', { apiKey: 'test' });
      const estimate = provider.estimateCost(testPrompt, testOptions);

      expect(estimate.estimatedInputTokens).toBeGreaterThan(0);
      expect(estimate.estimatedOutputTokens).toBe(1024);
      expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
      expect(estimate.confidence).toBe('medium');
    });

    it('includes tool definitions in token estimate', () => {
      const provider = createClaudeProvider('claude-sonnet-4-6', { apiKey: 'test' });

      const withoutTools = provider.estimateCost(testPrompt, testOptions);
      const withTools = provider.estimateCost(
        {
          ...testPrompt,
          tools: [{ name: 'test', description: 'A test tool', parameters: { type: 'object' } }],
        },
        testOptions,
      );

      expect(withTools.estimatedInputTokens).toBeGreaterThan(withoutTools.estimatedInputTokens);
    });
  });
});
