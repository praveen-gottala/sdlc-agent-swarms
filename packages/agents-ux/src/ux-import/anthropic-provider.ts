/**
 * @module @agentforge/agents-ux/ux-import/anthropic-provider
 *
 * LLM provider implementation using @agentforge/providers.
 * Supports both direct Anthropic API and Vertex AI via createClaudeProvider.
 * Calls Claude with forced tool_choice to produce DesignSpec V2.
 */

import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { LLMProvider, LLMToolResult } from './source-to-designspec.js';
import {
  resolveClaudeAuth,
  authResultToProviderConfig,
  createClaudeProvider,
  type ClaudeAuthResult,
} from '@agentforge/providers';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 16_000;

interface AnthropicProviderOptions {
  /** @deprecated Use `claudeAuth` instead. Falls back to resolveClaudeAuth() if neither is provided. */
  readonly apiKey?: string;
  /** Pre-resolved Claude auth (API key or Vertex AI). If omitted, auto-detected from env. */
  readonly claudeAuth?: ClaudeAuthResult;
  readonly model?: string;
  readonly maxTokens?: number;
}

/**
 * Create an LLM provider that calls Claude via @agentforge/providers.
 * Supports both direct API (ANTHROPIC_API_KEY) and Vertex AI (ANTHROPIC_VERTEX_PROJECT_ID).
 * Uses forced tool_choice to guarantee structured DesignSpec output.
 */
export function createAnthropicProvider(options: AnthropicProviderOptions): LLMProvider {
  const { model = DEFAULT_MODEL, maxTokens = DEFAULT_MAX_TOKENS } = options;

  // Resolve auth: explicit claudeAuth > explicit apiKey > auto-detect from env
  const auth: ClaudeAuthResult | null = options.claudeAuth
    ?? (options.apiKey ? { type: 'api_key', apiKey: options.apiKey } : null)
    ?? resolveClaudeAuth();

  if (!auth) {
    throw new Error(
      'No Claude auth available. Set ANTHROPIC_API_KEY or configure Vertex AI ' +
      '(ANTHROPIC_VERTEX_PROJECT_ID + CLOUD_ML_REGION).',
    );
  }

  const provider = createClaudeProvider(model, authResultToProviderConfig(auth));

  return {
    async callWithTool(systemPrompt, userMessage, tool): Promise<LLMToolResult> {
      const result = await provider.complete(
        {
          system: systemPrompt,
          messages: [
            { role: 'user', content: userMessage },
          ],
          tools: [
            {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          ],
        },
        {
          model,
          maxTokens,
          temperature: 0,
          toolChoice: { type: 'tool', name: tool.name },
        },
      );

      if (!result.ok) {
        const error = result.error;
        const detail = 'message' in error ? error.message : JSON.stringify(error);
        return { ok: false, error: `Claude API error (${error.code}): ${detail}` };
      }

      // Find the tool call
      const toolCall = result.value.toolCalls.find((tc) => tc.name === tool.name);
      if (!toolCall) {
        return {
          ok: false,
          error: 'LLM response did not contain a submit_design tool use block',
          usage: {
            input_tokens: result.value.usage.inputTokens,
            output_tokens: result.value.usage.outputTokens,
          },
        };
      }

      const spec = toolCall.args as unknown as DesignSpecV2;

      // Basic structural validation
      if (!spec.screen || !spec.width || !spec.nodes) {
        return {
          ok: false,
          error: 'LLM returned invalid DesignSpec: missing screen, width, or nodes',
          usage: {
            input_tokens: result.value.usage.inputTokens,
            output_tokens: result.value.usage.outputTokens,
          },
        };
      }

      return {
        ok: true,
        spec,
        usage: {
          input_tokens: result.value.usage.inputTokens,
          output_tokens: result.value.usage.outputTokens,
        },
      };
    },
  };
}
