/**
 * @module @agentforge/providers/openai
 *
 * OpenAI LLM provider implementation.
 * Uses the openai package for API communication.
 */

import OpenAI from 'openai';
import { Ok, Err } from '@agentforge/core';
import type { Result, CostRecord, CostEstimate } from '@agentforge/core';
import type {
  LLMProvider,
  Prompt,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  ProviderError,
  ProviderConfig,
  ToolCall,
  TokenUsage,
} from '../types.js';
import { calculateCost } from '../cost-table.js';

const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini'];

/** Map Prompt to OpenAI chat messages. System prompt goes as a system message. */
function toOpenAIMessages(
  prompt: Prompt,
): OpenAI.ChatCompletionMessageParam[] {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: prompt.system },
  ];

  for (const msg of prompt.messages) {
    if (msg.role === 'tool_result') {
      if (typeof msg.content === 'string') {
        // Generic tool result — needs a tool_call_id which should be in context
        messages.push({ role: 'tool', content: msg.content, tool_call_id: '' });
      } else {
        for (const block of msg.content) {
          if (block.type === 'tool_result') {
            messages.push({
              role: 'tool',
              content: block.content,
              tool_call_id: block.tool_use_id,
            });
          }
        }
      }
      continue;
    }

    if (typeof msg.content === 'string') {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    } else {
      // Flatten content blocks to text for OpenAI
      const text = msg.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('');
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: text,
      });
    }
  }

  return messages;
}

/** Map tools to OpenAI function calling format. */
function toOpenAITools(
  prompt: Prompt,
): OpenAI.ChatCompletionTool[] | undefined {
  if (!prompt.tools?.length) return undefined;
  return prompt.tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/** Map OpenAI finish reason to our format. */
function mapFinishReason(
  reason: string | null,
): 'stop' | 'max_tokens' | 'tool_use' {
  switch (reason) {
    case 'tool_calls':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    default:
      return 'stop';
  }
}

/** Map OpenAI API errors to ProviderError. */
function mapApiError(error: unknown): ProviderError {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      const retryAfter = typeof error.headers?.['retry-after'] === 'string'
        ? parseInt(error.headers['retry-after'], 10) * 1000
        : 60_000;
      return { code: 'RATE_LIMITED', retryAfterMs: retryAfter };
    }
    if (error.status === 401 || error.status === 403) {
      return { code: 'AUTH_FAILED', message: error.message };
    }
    if (error.status && error.status >= 500) {
      return { code: 'PROVIDER_DOWN', status: error.status, message: error.message };
    }
    return { code: 'PROVIDER_DOWN', status: error.status ?? 0, message: error.message };
  }
  return { code: 'INVALID_RESPONSE', raw: String(error) };
}

/** Create an OpenAI LLM provider. */
export function createOpenAIProvider(model: string, config: ProviderConfig): LLMProvider {
  const client = new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    ...(config.timeout ? { timeout: config.timeout } : {}),
  });

  return {
    name: 'openai',
    models: OPENAI_MODELS,

    async complete(
      prompt: Prompt,
      options: CompletionOptions,
    ): Promise<Result<CompletionResult, ProviderError>> {
      const startMs = Date.now();

      try {
        const response = await client.chat.completions.create(
          {
            model: options.model,
            messages: toOpenAIMessages(prompt),
            max_tokens: options.maxTokens ?? 4096,
            ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
            ...(options.stopSequences?.length ? { stop: options.stopSequences } : {}),
            ...(toOpenAITools(prompt) ? { tools: toOpenAITools(prompt) } : {}),
          },
          {
            signal: options.signal ?? undefined,
          },
        );

        const latencyMs = Date.now() - startMs;
        const choice = response.choices[0];

        if (!choice) {
          return Err({ code: 'INVALID_RESPONSE' as const, raw: JSON.stringify(response) });
        }

        const content = choice.message.content ?? '';

        // Parse tool calls
        const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        }));

        const usage: TokenUsage = {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
        };

        const costData = calculateCost(options.model, usage.inputTokens, usage.outputTokens);
        const cost: CostRecord = {
          ...costData,
          model: options.model,
          timestamp: new Date().toISOString(),
        };

        return Ok({
          content,
          toolCalls,
          usage,
          cost,
          model: options.model,
          latencyMs,
          finishReason: mapFinishReason(choice.finish_reason),
        });
      } catch (error) {
        return Err(mapApiError(error));
      }
    },

    async *stream(
      prompt: Prompt,
      options: CompletionOptions,
    ): AsyncIterable<StreamChunk> {
      try {
        const stream = await client.chat.completions.create(
          {
            model: options.model,
            messages: toOpenAIMessages(prompt),
            max_tokens: options.maxTokens ?? 4096,
            stream: true,
            stream_options: { include_usage: true },
            ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
            ...(options.stopSequences?.length ? { stop: options.stopSequences } : {}),
            ...(toOpenAITools(prompt) ? { tools: toOpenAITools(prompt) } : {}),
          },
          {
            signal: options.signal ?? undefined,
          },
        );

        // Accumulate tool calls across chunks
        const pendingToolCalls = new Map<number, { id: string; name: string; args: string }>();
        let finalUsage: TokenUsage | undefined;

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;

          // Text content
          if (delta?.content) {
            yield {
              type: 'token',
              content: delta.content,
              tokenCount: Math.ceil(delta.content.length / 4),
            };
          }

          // Tool call deltas
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const existing = pendingToolCalls.get(tc.index);
              if (!existing) {
                pendingToolCalls.set(tc.index, {
                  id: tc.id ?? '',
                  name: tc.function?.name ?? '',
                  args: tc.function?.arguments ?? '',
                });
              } else {
                if (tc.function?.arguments) {
                  existing.args += tc.function.arguments;
                }
              }
            }
          }

          // Usage info (comes in the final chunk with stream_options)
          if (chunk.usage) {
            finalUsage = {
              inputTokens: chunk.usage.prompt_tokens,
              outputTokens: chunk.usage.completion_tokens,
            };
          }

          // Check for finish
          if (chunk.choices[0]?.finish_reason) {
            // Emit any completed tool calls
            for (const [, tc] of pendingToolCalls) {
              yield {
                type: 'tool_call',
                id: tc.id,
                name: tc.name,
                args: JSON.parse(tc.args || '{}') as Record<string, unknown>,
              };
            }
            pendingToolCalls.clear();
          }
        }

        // Emit final done chunk
        const usage = finalUsage ?? { inputTokens: 0, outputTokens: 0 };
        const costData = calculateCost(options.model, usage.inputTokens, usage.outputTokens);
        yield {
          type: 'done',
          usage,
          cost: {
            ...costData,
            model: options.model,
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          yield {
            type: 'done',
            usage: { inputTokens: 0, outputTokens: 0 },
            cost: {
              inputCostUsd: 0,
              outputCostUsd: 0,
              totalCostUsd: 0,
              model: options.model,
              timestamp: new Date().toISOString(),
            },
          };
          return;
        }
        throw error;
      }
    },

    async isAvailable(): Promise<boolean> {
      try {
        await client.models.list();
        return true;
      } catch {
        return false;
      }
    },

    estimateCost(prompt: Prompt, options: CompletionOptions): CostEstimate {
      const systemTokens = Math.ceil(prompt.system.length / 4);
      const messageTokens = prompt.messages.reduce((sum, msg) => {
        const len = typeof msg.content === 'string'
          ? msg.content.length
          : JSON.stringify(msg.content).length;
        return sum + Math.ceil(len / 4);
      }, 0);
      const toolTokens = prompt.tools
        ? Math.ceil(JSON.stringify(prompt.tools).length / 4)
        : 0;

      const estimatedInputTokens = systemTokens + messageTokens + toolTokens;
      const estimatedOutputTokens = options.maxTokens ?? 4096;

      const costData = calculateCost(options.model, estimatedInputTokens, estimatedOutputTokens);

      return {
        estimatedInputTokens,
        estimatedOutputTokens,
        estimatedCostUsd: costData.totalCostUsd,
        confidence: 'medium',
      };
    },
  };
}
