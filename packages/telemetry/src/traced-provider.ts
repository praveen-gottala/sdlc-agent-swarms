/**
 * @module @agentforge/telemetry/traced-provider
 *
 * OTel-instrumented wrapper for LLMProvider. Every `complete()` call
 * produces an OTel generation span with full prompt input, model response,
 * token usage, and cost. Spans are automatically nested under active parent
 * spans via OTel context propagation.
 *
 * Follows Langfuse v5 best practices (langfuse/skills instrumentation.md):
 * - Uses `asType: 'generation'` for LLM calls (correct observation type)
 * - Sets input explicitly to relevant data only (not all function args)
 * - Captures model, modelParameters, usageDetails per baseline requirements
 * - Returns provider unchanged when Langfuse is not configured (graceful no-op)
 */

import { startActiveObservation } from '@langfuse/tracing';
import type { LLMProvider, Prompt, CompletionOptions, CompletionResult, ProviderError, StreamChunk } from '@agentforge/providers';
import type { Result, CostEstimate } from '@agentforge/core';
import { isLangfuseConfigured } from './otel-init.js';

function systemPromptText(system: Prompt['system']): string {
  if (typeof system === 'string') return system;
  return system.map(b => b.text).join('\n');
}

function userMessageText(messages: Prompt['messages']): string {
  const userMessages = messages.filter(m => m.role === 'user');
  return userMessages.map(m => {
    if (typeof m.content === 'string') return m.content;
    return m.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('\n');
  }).join('\n');
}

/**
 * Wrap an LLMProvider with OTel instrumentation.
 * Returns the provider unchanged when Langfuse is not configured.
 */
export function createTracedProvider(provider: LLMProvider): LLMProvider {
  if (!isLangfuseConfigured()) return provider;

  return {
    name: provider.name,
    models: provider.models,

    async complete(prompt: Prompt, options: CompletionOptions): Promise<Result<CompletionResult, ProviderError>> {
      return startActiveObservation(
        `llm:${options.model}`,
        async (generation) => {
          generation.update({
            model: options.model,
            modelParameters: {
              temperature: String(options.temperature ?? 0),
              maxTokens: String(options.maxTokens ?? 4096),
            },
            input: {
              system: systemPromptText(prompt.system),
              user: userMessageText(prompt.messages),
            },
            ...(options.promptVersion ? { metadata: { promptVersion: options.promptVersion } } : {}),
          });

          const result = await provider.complete(prompt, options);

          if (result.ok) {
            generation.update({
              output: {
                content: result.value.content,
                toolCalls: result.value.toolCalls,
                finishReason: result.value.finishReason,
              },
              usageDetails: {
                input: result.value.usage.inputTokens,
                output: result.value.usage.outputTokens,
                total: result.value.usage.inputTokens + result.value.usage.outputTokens,
                ...(result.value.usage.cacheReadTokens ? { cacheRead: result.value.usage.cacheReadTokens } : {}),
                ...(result.value.usage.cacheWriteTokens ? { cacheWrite: result.value.usage.cacheWriteTokens } : {}),
              },
              costDetails: {
                input: result.value.cost.inputCostUsd,
                output: result.value.cost.outputCostUsd,
                total: result.value.cost.totalCostUsd,
              },
            });
          } else {
            generation.update({
              output: { error: String(result.error) },
              level: 'ERROR',
            });
          }

          return result;
        },
        { asType: 'generation' },
      );
    },

    stream(prompt: Prompt, options: CompletionOptions): AsyncIterable<StreamChunk> {
      return provider.stream(prompt, options);
    },

    isAvailable(): Promise<boolean> {
      return provider.isAvailable();
    },

    estimateCost(prompt: Prompt, options: CompletionOptions): CostEstimate {
      return provider.estimateCost(prompt, options);
    },
  };
}
