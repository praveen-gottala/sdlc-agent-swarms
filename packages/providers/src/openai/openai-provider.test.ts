import { createOpenAIProvider } from './openai-provider.js';
import type { Prompt, CompletionOptions } from '../types.js';

// Mock the OpenAI SDK
const mockCreate = jest.fn();
const mockModelsList = jest.fn();

jest.mock('openai', () => {
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

  const MockOpenAI = jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
    models: {
      list: mockModelsList,
    },
  }));

  (MockOpenAI as unknown as Record<string, unknown>).APIError = MockAPIError;

  return { __esModule: true, default: MockOpenAI, APIError: MockAPIError };
});

const testPrompt: Prompt = {
  system: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'Hello' }],
};

const testOptions: CompletionOptions = {
  model: 'gpt-4o',
  maxTokens: 1024,
  temperature: 0,
};

describe('OpenAIProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('properties', () => {
    it('has correct name and models', () => {
      const provider = createOpenAIProvider('gpt-4o', { apiKey: 'test' });
      expect(provider.name).toBe('openai');
      expect(provider.models).toContain('gpt-4o');
      expect(provider.models).toContain('gpt-4o-mini');
    });
  });

  describe('complete', () => {
    it('returns a successful CompletionResult', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { role: 'assistant', content: 'Hello! How can I help?' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10 },
        model: 'gpt-4o',
      });

      const provider = createOpenAIProvider('gpt-4o', { apiKey: 'test' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Hello! How can I help?');
        expect(result.value.toolCalls).toEqual([]);
        expect(result.value.usage.inputTokens).toBe(20);
        expect(result.value.usage.outputTokens).toBe(10);
        expect(result.value.model).toBe('gpt-4o');
        expect(result.value.finishReason).toBe('stop');
        expect(result.value.cost.totalCostUsd).toBeGreaterThan(0);
      }
    });

    it('sends system prompt as a system message', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { role: 'assistant', content: 'ok' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const provider = createOpenAIProvider('gpt-4o', { apiKey: 'test' });
      await provider.complete(testPrompt, testOptions);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant.',
      });
    });

    it('extracts tool calls and parses JSON arguments', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_abc',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: '{"path":"/src/index.ts"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 30, completion_tokens: 15 },
      });

      const provider = createOpenAIProvider('gpt-4o', { apiKey: 'test' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.toolCalls).toHaveLength(1);
        expect(result.value.toolCalls[0]).toEqual({
          id: 'call_abc',
          name: 'read_file',
          args: { path: '/src/index.ts' },
        });
        expect(result.value.finishReason).toBe('tool_use');
        expect(result.value.content).toBe('');
      }
    });

    it('maps 429 to RATE_LIMITED error', async () => {
      const { APIError } = jest.requireMock('openai') as { APIError: new (status: number, message: string, headers?: Record<string, string>) => Error };
      mockCreate.mockRejectedValue(
        new APIError(429, 'Rate limited', { 'retry-after': '60' }),
      );

      const provider = createOpenAIProvider('gpt-4o', { apiKey: 'test' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('RATE_LIMITED');
      }
    });

    it('maps 401 to AUTH_FAILED error', async () => {
      const { APIError } = jest.requireMock('openai') as { APIError: new (status: number, message: string) => Error };
      mockCreate.mockRejectedValue(new APIError(401, 'Invalid API key'));

      const provider = createOpenAIProvider('gpt-4o', { apiKey: 'bad-key' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_FAILED');
      }
    });

    it('maps 500 to PROVIDER_DOWN error', async () => {
      const { APIError } = jest.requireMock('openai') as { APIError: new (status: number, message: string) => Error };
      mockCreate.mockRejectedValue(new APIError(500, 'Internal server error'));

      const provider = createOpenAIProvider('gpt-4o', { apiKey: 'test' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROVIDER_DOWN');
      }
    });

    it('returns INVALID_RESPONSE when no choices', async () => {
      mockCreate.mockResolvedValue({
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 0 },
      });

      const provider = createOpenAIProvider('gpt-4o', { apiKey: 'test' });
      const result = await provider.complete(testPrompt, testOptions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_RESPONSE');
      }
    });

    it('passes tools in OpenAI function calling format', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { role: 'assistant', content: 'ok' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
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

      const provider = createOpenAIProvider('gpt-4o', { apiKey: 'test' });
      await provider.complete(promptWithTools, testOptions);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.tools).toBeDefined();
      expect(callArgs.tools[0]).toEqual({
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read a file',
          parameters: { type: 'object', properties: { path: { type: 'string' } } },
        },
      });
    });
  });

  describe('stream', () => {
    it('yields token chunks from streaming response', async () => {
      const streamChunks = [
        {
          choices: [{ delta: { content: 'Hello' }, finish_reason: null }],
          usage: null,
        },
        {
          choices: [{ delta: { content: ' world' }, finish_reason: null }],
          usage: null,
        },
        {
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: null,
        },
        {
          choices: [],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of streamChunks) {
            yield chunk;
          }
        },
      });

      const provider = createOpenAIProvider('gpt-4o', { apiKey: 'test' });
      const chunks: unknown[] = [];

      for await (const chunk of provider.stream(testPrompt, testOptions)) {
        chunks.push(chunk);
      }

      expect(chunks[0]).toMatchObject({ type: 'token', content: 'Hello' });
      expect(chunks[1]).toMatchObject({ type: 'token', content: ' world' });

      const doneChunk = chunks.find(
        (c) => (c as { type: string }).type === 'done',
      );
      expect(doneChunk).toBeDefined();
    });

    it('accumulates and yields tool calls from stream', async () => {
      const streamChunks = [
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_xyz',
                    function: { name: 'read_file', arguments: '{"pa' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
          usage: null,
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, function: { arguments: 'th":"/src"}' } },
                ],
              },
              finish_reason: null,
            },
          ],
          usage: null,
        },
        {
          choices: [{ delta: {}, finish_reason: 'tool_calls' }],
          usage: null,
        },
        {
          choices: [],
          usage: { prompt_tokens: 15, completion_tokens: 10 },
        },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of streamChunks) {
            yield chunk;
          }
        },
      });

      const provider = createOpenAIProvider('gpt-4o', { apiKey: 'test' });
      const chunks: unknown[] = [];

      for await (const chunk of provider.stream(testPrompt, testOptions)) {
        chunks.push(chunk);
      }

      const toolChunk = chunks.find(
        (c) => (c as { type: string }).type === 'tool_call',
      );
      expect(toolChunk).toMatchObject({
        type: 'tool_call',
        id: 'call_xyz',
        name: 'read_file',
        args: { path: '/src' },
      });
    });

    it('enables stream_options with include_usage', async () => {
      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            choices: [{ delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 3 },
          };
        },
      });

      const provider = createOpenAIProvider('gpt-4o', { apiKey: 'test' });
      // Consume the stream
      for await (const _chunk of provider.stream(testPrompt, testOptions)) {
        // consume
      }

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.stream).toBe(true);
      expect(callArgs.stream_options).toEqual({ include_usage: true });
    });
  });

  describe('estimateCost', () => {
    it('estimates cost based on prompt length', () => {
      const provider = createOpenAIProvider('gpt-4o', { apiKey: 'test' });
      const estimate = provider.estimateCost(testPrompt, testOptions);

      expect(estimate.estimatedInputTokens).toBeGreaterThan(0);
      expect(estimate.estimatedOutputTokens).toBe(1024);
      expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
      expect(estimate.confidence).toBe('medium');
    });
  });

  describe('isAvailable', () => {
    it('returns true when models.list succeeds', async () => {
      mockModelsList.mockResolvedValue({ data: [] });
      const provider = createOpenAIProvider('gpt-4o', { apiKey: 'test' });
      expect(await provider.isAvailable()).toBe(true);
    });

    it('returns false when models.list fails', async () => {
      mockModelsList.mockRejectedValue(new Error('Network error'));
      const provider = createOpenAIProvider('gpt-4o', { apiKey: 'test' });
      expect(await provider.isAvailable()).toBe(false);
    });
  });
});
