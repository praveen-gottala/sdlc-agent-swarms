/**
 * @module @agentforge/agents-ux/prototype/analyze-navigation
 *
 * LLM-powered navigation analysis: takes condensed screen summaries
 * and produces NavigationBindings that link screens together.
 * One LLM call for all screens — understands navigation intent.
 */

import type { Result } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';
import type { NavigationBinding } from '@agentforge/designspec-renderer';
import type { ScreenSummary } from './build-manifest.js';

/** Schema for the LLM's navigation analysis output. */
const NAVIGATION_OUTPUT_SCHEMA = {
  schema: {
    type: 'object' as const,
    properties: {
      bindings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sourceScreenId: { type: 'string' },
            sourceNodeId: { type: 'string' },
            targetScreenId: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['sourceScreenId', 'sourceNodeId', 'targetScreenId', 'reason'],
        },
      },
    },
    required: ['bindings'],
  },
};

const SYSTEM_PROMPT = `You are a UX navigation analyst. Given a set of app screens with their interactive elements (buttons, tabs, links, navigation bars), determine which elements should navigate to which screens.

Rules:
- Only create bindings for elements that clearly navigate to another screen
- Tab elements with labels matching screen names are strong navigation signals
- "New" or "Create" buttons typically navigate to a form/creation screen
- "Back" or "Cancel" buttons navigate to the previous/parent screen
- Navigation bars and sidebars contain primary navigation links
- Include a brief reason for each binding
- Only reference screenIds and nodeIds that exist in the input

Output a JSON object with a "bindings" array.`;

/** Provider interface — minimal subset needed for navigation analysis. */
interface NavigationLLMProvider {
  complete(
    prompt: { system: string; messages: { role: string; content: string }[] },
    options: { model: string; maxTokens: number; temperature: number; responseSchema?: { schema: Record<string, unknown> } },
  ): Promise<Result<{ content: string; structured?: Record<string, unknown> }>>;
}

/**
 * Analyze all screens and produce navigation bindings using a single LLM call.
 * Receives condensed screen summaries (~2-3KB per screen) instead of full specs.
 */
export async function analyzeNavigation(
  summaries: readonly ScreenSummary[],
  provider: NavigationLLMProvider,
  model: string,
): Promise<Result<readonly NavigationBinding[]>> {
  if (summaries.length < 2) {
    return Ok([]);
  }

  const userMessage = `Analyze these ${summaries.length} app screens and identify navigation bindings between them.

## Screens

${summaries.map(s => {
  const nodes = s.interactiveNodes.length > 0
    ? s.interactiveNodes.map(n => {
      const opts = n.options ? ` [options: ${n.options.join(', ')}]` : '';
      const label = n.label ? ` "${n.label}"` : '';
      return `  - ${n.nodeId}: ${n.catalog}${label}${opts}`;
    }).join('\n')
    : '  (no interactive elements)';
  return `### ${s.screenId} (${s.route})\n${nodes}`;
}).join('\n\n')}

## Available screen IDs
${summaries.map(s => `- ${s.screenId} (${s.route})`).join('\n')}

Identify which interactive elements navigate to which screens.`;

  const result = await provider.complete(
    {
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    },
    {
      model,
      maxTokens: 4096,
      temperature: 0,
      responseSchema: NAVIGATION_OUTPUT_SCHEMA,
    },
  );

  if (!result.ok) {
    return Err({
      code: 'LLM_API_ERROR' as const,
      message: `Navigation analysis failed: ${JSON.stringify(result.error)}`,
      recoverable: true,
    });
  }

  const structured = result.value.structured as { bindings?: NavigationBinding[] } | undefined;
  if (structured?.bindings) {
    return Ok(structured.bindings);
  }

  try {
    const parsed = JSON.parse(result.value.content) as { bindings?: NavigationBinding[] };
    return Ok(parsed.bindings ?? []);
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: 'Failed to parse navigation analysis output as JSON',
      recoverable: true,
    });
  }
}
