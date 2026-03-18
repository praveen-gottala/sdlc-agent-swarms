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

const testPrompt: Prompt = {
  system: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'Hello' }],
};

const testOptions: CompletionOptions = {
  model: 'claude-sonnet-4',
  maxTokens: 1024,
  temperature: 0,
};

describe('ClaudeProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('properties', () => {
    it('has correct name and models', () => {
      const provider = createClaudeProvider('claude-sonnet-4', { apiKey: 'test' });
      expect(provider.name).toBe('claude');
      expect(provider.models).toContain('claude-sonnet-4');
      expect(provider.models).toContain('claude-opus-4');
      expect(provider.models).toContain('claude-haiku-4');
    });
  });

  describe('complete', () => {
    it('returns a successful CompletionResult', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello! How can I help?' }],
        usage: { input_tokens: 20, output_tokens: 10 },
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4',
      });

      const provider = createClaudeProvider('claude-sonnet-4', { apiKey: 'test' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Hello! How can I help?');
        expect(result.value.toolCalls).toEqual([]);
        expect(result.value.usage.inputTokens).toBe(20);
        expect(result.value.usage.outputTokens).toBe(10);
        expect(result.value.model).toBe('claude-sonnet-4');
        expect(result.value.finishReason).toBe('stop');
        expect(result.value.cost.totalCostUsd).toBeGreaterThan(0);
        expect(result.value.latencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('extracts tool calls from response', async () => {
      mockCreate.mockResolvedValue({
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
        model: 'claude-sonnet-4',
      });

      const provider = createClaudeProvider('claude-sonnet-4', { apiKey: 'test' });
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
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'cached response' }],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 80,
          cache_creation_input_tokens: 20,
        },
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4',
      });

      const provider = createClaudeProvider('claude-sonnet-4', { apiKey: 'test' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.usage.cacheReadTokens).toBe(80);
        expect(result.value.usage.cacheWriteTokens).toBe(20);
      }
    });

    it('maps 429 to RATE_LIMITED error', async () => {
      const { APIError } = jest.requireMock('@anthropic-ai/sdk') as { APIError: new (status: number, message: string, headers?: Record<string, string>) => Error };
      mockCreate.mockRejectedValue(
        new APIError(429, 'Rate limited', { 'retry-after': '30' }),
      );

      const provider = createClaudeProvider('claude-sonnet-4', { apiKey: 'test' });
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
      mockCreate.mockRejectedValue(new APIError(401, 'Invalid API key'));

      const provider = createClaudeProvider('claude-sonnet-4', { apiKey: 'bad-key' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_FAILED');
      }
    });

    it('maps 500 to PROVIDER_DOWN error', async () => {
      const { APIError } = jest.requireMock('@anthropic-ai/sdk') as { APIError: new (status: number, message: string) => Error };
      mockCreate.mockRejectedValue(new APIError(500, 'Internal server error'));

      const provider = createClaudeProvider('claude-sonnet-4', { apiKey: 'test' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROVIDER_DOWN');
      }
    });

    it('maps unknown errors to INVALID_RESPONSE', async () => {
      mockCreate.mockRejectedValue(new Error('Network failure'));

      const provider = createClaudeProvider('claude-sonnet-4', { apiKey: 'test' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_RESPONSE');
      }
    });

    it('passes tools to Anthropic format', async () => {
      mockCreate.mockResolvedValue({
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

      const provider = createClaudeProvider('claude-sonnet-4', { apiKey: 'test' });
      await provider.complete(promptWithTools, testOptions);

      const callArgs = mockCreate.mock.calls[0][0];
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

      const provider = createClaudeProvider('claude-sonnet-4', { apiKey: 'test' });
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

      const provider = createClaudeProvider('claude-sonnet-4', { apiKey: 'test' });
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
      const provider = createClaudeProvider('claude-sonnet-4', { apiKey: 'test' });
      const estimate = provider.estimateCost(testPrompt, testOptions);

      expect(estimate.estimatedInputTokens).toBeGreaterThan(0);
      expect(estimate.estimatedOutputTokens).toBe(1024);
      expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
      expect(estimate.confidence).toBe('medium');
    });

    it('includes tool definitions in token estimate', () => {
      const provider = createClaudeProvider('claude-sonnet-4', { apiKey: 'test' });

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
