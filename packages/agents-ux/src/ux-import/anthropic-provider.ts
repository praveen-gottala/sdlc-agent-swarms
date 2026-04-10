/**
 * @module @agentforge/agents-ux/ux-import/anthropic-provider
 *
 * LLM provider implementation using the Anthropic Messages API.
 * Calls Claude with forced tool_choice to produce DesignSpec V2.
 */

import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { LLMProvider, LLMToolResult } from './source-to-designspec.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 16_000;

interface AnthropicProviderOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly maxTokens?: number;
}

/**
 * Create an LLM provider that calls the Anthropic Messages API directly.
 * Uses forced tool_choice to guarantee structured DesignSpec output.
 */
export function createAnthropicProvider(options: AnthropicProviderOptions): LLMProvider {
  const { apiKey, model = DEFAULT_MODEL, maxTokens = DEFAULT_MAX_TOKENS } = options;

  return {
    async callWithTool(systemPrompt, userMessage, tool): Promise<LLMToolResult> {
      const body = {
        model,
        max_tokens: maxTokens,
        temperature: 0,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage },
        ],
        tools: [
          {
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters,
          },
        ],
        tool_choice: { type: 'tool', name: tool.name },
      };

      let response: Response;
      try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        });
      } catch (e) {
        return { ok: false, error: `Network error: ${String(e)}` };
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown');
        return { ok: false, error: `API error ${response.status}: ${errorText}` };
      }

      const data = await response.json() as {
        content: Array<{ type: string; name?: string; input?: unknown }>;
        usage?: { input_tokens: number; output_tokens: number };
      };

      // Find the tool_use block
      const toolBlock = data.content?.find(
        (block: { type: string; name?: string }) => block.type === 'tool_use' && block.name === tool.name,
      );

      if (!toolBlock || !toolBlock.input) {
        return {
          ok: false,
          error: 'LLM response did not contain a submit_design tool use block',
          usage: data.usage,
        };
      }

      const spec = toolBlock.input as DesignSpecV2;

      // Basic structural validation
      if (!spec.screen || !spec.width || !spec.nodes) {
        return {
          ok: false,
          error: 'LLM returned invalid DesignSpec: missing screen, width, or nodes',
          usage: data.usage,
        };
      }

      return {
        ok: true,
        spec,
        usage: data.usage,
      };
    },
  };
}
