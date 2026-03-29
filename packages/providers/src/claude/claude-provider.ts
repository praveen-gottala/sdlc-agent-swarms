/**
 * @module @agentforge/providers/claude
 *
 * Claude (Anthropic) LLM provider implementation.
 * Uses @anthropic-ai/sdk for API communication.
 */

import Anthropic from '@anthropic-ai/sdk';
import { Ok, Err, debugLog, logDefaults } from '@agentforge/core';
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

const CLAUDE_MODELS = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'];

/** Map short model aliases to full Anthropic API model IDs.
 *  The base IDs (e.g. 'claude-sonnet-4-6') are accepted by the API directly.
 *  Add date-pinned entries here only when you need to lock to a specific snapshot. */
const MODEL_ALIASES: Record<string, string> = {
  // Currently using latest versions — no pinning needed
};

/** Resolve a model name to its API model ID, falling through if already full. */
const resolveModelId = (model: string): string => MODEL_ALIASES[model] ?? model;

/** Map Prompt to Anthropic API message format. */
function toAnthropicMessages(
  prompt: Prompt,
): Anthropic.MessageCreateParams['messages'] {
  return prompt.messages.map((msg) => {
    if (msg.role === 'tool_result') {
      // Tool results need special handling for Anthropic format
      if (typeof msg.content === 'string') {
        return { role: 'user' as const, content: msg.content };
      }
      return {
        role: 'user' as const,
        content: (msg.content).map((block) => {
          if (block.type === 'tool_result') {
            return {
              type: 'tool_result' as const,
              tool_use_id: block.tool_use_id,
              content: block.content,
            };
          }
          return { type: 'text' as const, text: String(block) };
        }),
      };
    }

    if (typeof msg.content === 'string') {
      return { role: msg.role as 'user' | 'assistant', content: msg.content };
    }

    return {
      role: msg.role as 'user' | 'assistant',
      content: (msg.content).map((block) => {
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input,
          };
        }
        if (block.type === 'image') {
          return {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: block.source.media_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: block.source.data,
            },
          };
        }
        return { type: 'text' as const, text: block.type === 'text' ? block.text : '' };
      }),
    };
  });
}

/** Map Anthropic tool format. */
function toAnthropicTools(
  prompt: Prompt,
): Anthropic.Tool[] | undefined {
  if (!prompt.tools?.length) return undefined;
  return prompt.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Tool['input_schema'],
  }));
}

/** Map Anthropic finish reason to our format. */
function mapFinishReason(
  stopReason: string | null,
): 'stop' | 'max_tokens' | 'tool_use' {
  switch (stopReason) {
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    default:
      return 'stop';
  }
}

/** Map Anthropic API errors to ProviderError. */
function mapApiError(error: unknown): ProviderError {
  if (error instanceof Anthropic.APIError) {
    if (error.status === 429) {
      const rawRetryAfter = error.headers?.['retry-after'];
      const retryAfter = typeof rawRetryAfter === 'string'
        ? parseInt(rawRetryAfter, 10) * 1000
        : 60_000;
      if (typeof rawRetryAfter !== 'string') {
        debugLog('claude.mapApiError: retry-after header missing → default: "60000ms"');
      }
      return { code: 'RATE_LIMITED', retryAfterMs: retryAfter };
    }
    if (error.status === 401 || error.status === 403) {
      return { code: 'AUTH_FAILED', message: error.message };
    }
    if (error.status >= 500) {
      return { code: 'PROVIDER_DOWN', status: error.status, message: error.message };
    }
    return { code: 'PROVIDER_DOWN', status: error.status, message: error.message };
  }
  return { code: 'INVALID_RESPONSE', raw: String(error) };
}

/** Create a Claude LLM provider. */
export function createClaudeProvider(model: string, config: ProviderConfig): LLMProvider {
  const client = new Anthropic({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    ...(config.timeout ? { timeout: config.timeout } : {}),
  });

  return {
    name: 'claude',
    models: CLAUDE_MODELS,

    async complete(
      prompt: Prompt,
      options: CompletionOptions,
    ): Promise<Result<CompletionResult, ProviderError>> {
      const startMs = Date.now();

      try {
        // Use streaming internally to avoid SDK timeout on long-running completions.
        // The SDK throws if a non-streaming request takes >10 minutes.
        logDefaults('claude.complete', {
          maxTokens: [options.maxTokens, '4096'],
        });
        const baseParams: Anthropic.MessageCreateParams = {
          model: resolveModelId(options.model),
          max_tokens: options.maxTokens ?? 4096,
          system: prompt.system,
          messages: toAnthropicMessages(prompt),
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
          ...(options.stopSequences?.length ? { stop_sequences: options.stopSequences } : {}),
          ...(toAnthropicTools(prompt) ? { tools: toAnthropicTools(prompt) } : {}),
          ...(options.toolChoice ? { tool_choice: options.toolChoice as Anthropic.MessageCreateParams['tool_choice'] } : {}),
        };

        let useStructuredOutput = !!options.responseSchema;
        let response: Anthropic.Message;

        if (useStructuredOutput) {
          try {
            const structuredParams = {
              ...baseParams,
              output_config: {
                format: {
                  type: 'json_schema' as const,
                  schema: options.responseSchema!.schema,
                },
              },
            };
            const stream = client.messages.stream(structuredParams, { signal: options.signal ?? undefined });
            response = await stream.finalMessage();
          } catch (error) {
            // Fall back to text mode if model doesn't support output_config
            if (error instanceof Anthropic.APIError && error.message.includes('does not support output format')) {
              useStructuredOutput = false;
              const stream = client.messages.stream(baseParams, { signal: options.signal ?? undefined });
              response = await stream.finalMessage();
            } else {
              throw error;
            }
          }
        } else {
          const stream = client.messages.stream(baseParams, { signal: options.signal ?? undefined });
          response = await stream.finalMessage();
        }

        const latencyMs = Date.now() - startMs;

        // Extract text content
        const textBlocks = response.content.filter(
          (b): b is Anthropic.TextBlock => b.type === 'text',
        );
        const content = textBlocks.map((b) => b.text).join('');

        // Extract tool calls
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );
        const toolCalls: ToolCall[] = toolUseBlocks.map((b) => ({
          id: b.id,
          name: b.name,
          args: b.input as Record<string, unknown>,
        }));

        // Build usage
        const usage: TokenUsage = {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: (response.usage as unknown as Record<string, unknown>).cache_read_input_tokens as number | undefined,
          cacheWriteTokens: (response.usage as unknown as Record<string, unknown>).cache_creation_input_tokens as number | undefined,
        };

        const costData = calculateCost(options.model, usage.inputTokens, usage.outputTokens);
        const cost: CostRecord = {
          ...costData,
          model: options.model,
          timestamp: new Date().toISOString(),
        };

        // Parse structured output when output_config was actually used
        let structured: Record<string, unknown> | undefined;
        if (useStructuredOutput && content) {
          try {
            structured = JSON.parse(content) as Record<string, unknown>;
          } catch {
            // API guarantees valid JSON with output_config, but handle edge cases
          }
        }

        return Ok({
          content,
          toolCalls,
          usage,
          cost,
          model: options.model,
          latencyMs,
          finishReason: mapFinishReason(response.stop_reason),
          ...(structured !== undefined ? { structured } : {}),
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
        logDefaults('claude.stream', {
          maxTokens: [options.maxTokens, '4096'],
        });
        const stream = client.messages.stream(
          {
            model: resolveModelId(options.model),
            max_tokens: options.maxTokens ?? 4096,
            system: prompt.system,
            messages: toAnthropicMessages(prompt),
            ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
            ...(options.stopSequences?.length ? { stop_sequences: options.stopSequences } : {}),
            ...(toAnthropicTools(prompt) ? { tools: toAnthropicTools(prompt) } : {}),
            ...(options.toolChoice ? { tool_choice: options.toolChoice as Anthropic.MessageCreateParams['tool_choice'] } : {}),
          },
          {
            signal: options.signal ?? undefined,
          },
        );

        for await (const event of stream) {
          if (event.type === 'content_block_delta') {
            const delta = event.delta;
            if ('text' in delta && typeof delta.text === 'string') {
              yield {
                type: 'token',
                content: delta.text,
                tokenCount: Math.ceil(delta.text.length / 4),
              };
            }
            if ('partial_json' in delta && typeof delta.partial_json === 'string') {
              yield { type: 'progress', message: 'Receiving tool arguments...' };
            }
          }

          if (event.type === 'content_block_stop') {
            // Check if we have a completed tool use block
            const snapshot = stream.currentMessage;
            if (snapshot) {
              const lastBlock = snapshot.content[snapshot.content.length - 1];
              if (lastBlock && lastBlock.type === 'tool_use') {
                yield {
                  type: 'tool_call',
                  id: lastBlock.id,
                  name: lastBlock.name,
                  args: lastBlock.input as Record<string, unknown>,
                };
              }
            }
          }

          if (event.type === 'message_stop') {
            const finalMessage = stream.currentMessage;
            if (finalMessage) {
              const usage: TokenUsage = {
                inputTokens: finalMessage.usage.input_tokens,
                outputTokens: finalMessage.usage.output_tokens,
                cacheReadTokens: (finalMessage.usage as unknown as Record<string, unknown>).cache_read_input_tokens as number | undefined,
                cacheWriteTokens: (finalMessage.usage as unknown as Record<string, unknown>).cache_creation_input_tokens as number | undefined,
              };

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
            }
          }
        }
      } catch (error) {
        // If aborted, we still need to emit a done chunk
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
        // A lightweight check — attempt to make a tiny request
        await client.messages.create({
          model: resolveModelId('claude-haiku-4-5'),
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        });
        return true;
      } catch {
        return false;
      }
    },

    estimateCost(prompt: Prompt, options: CompletionOptions): CostEstimate {
      // Rough estimation: 1 token ≈ 4 characters
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
      logDefaults('claude.estimateCost', {
        maxTokens: [options.maxTokens, '4096'],
      });
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
