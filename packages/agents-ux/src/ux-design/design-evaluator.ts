/**
 * @module @agentforge/agents-ux/ux-design/design-evaluator
 *
 * Evaluates Figma design screenshots against specifications using vision LLM.
 * Part of the visual self-correction loop.
 */

import type { Result } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';
import type { LLMProvider, ContentBlock } from '@agentforge/providers';

/** A single design issue found during evaluation. */
export interface DesignIssue {
  readonly severity: 'critical' | 'major' | 'minor';
  readonly component: string;
  readonly description: string;
  readonly fix: string;
}

/** Result of a design evaluation. */
export interface DesignEvaluation {
  readonly score: number;
  readonly overallQuality: 'good' | 'needs_fixes' | 'poor';
  readonly issues: readonly DesignIssue[];
}

const EVALUATION_SYSTEM_PROMPT = `You are a design quality evaluator. Analyze the provided Figma screenshot against the design specification.

Evaluate these dimensions:
1. **Visual hierarchy** — clear content structure, appropriate heading sizes, spacing
2. **Text presence** — all expected text nodes exist (no missing labels, values, titles)
3. **Color application** — backgrounds, text colors, borders match spec (no all-white/blank areas)
4. **Spacing & alignment** — consistent padding, proper auto-layout, aligned elements
5. **Completeness** — all specified components are present (header, cards, charts, tables)

Score from 0 to 100:
- 80-100: Good — minor polish issues only
- 50-79: Needs fixes — visible issues that affect usability
- 0-49: Poor — major missing components or broken layout

Respond ONLY with a JSON object:
{
  "score": <number>,
  "issues": [
    {
      "severity": "critical" | "major" | "minor",
      "component": "<component name>",
      "description": "<what is wrong>",
      "fix": "<specific fix instruction>"
    }
  ]
}`;

/**
 * Evaluate a Figma design screenshot against a specification.
 *
 * @param screenshotBase64 - Base64-encoded PNG of the design
 * @param designSpec - Text description of what the design should contain
 * @param provider - LLM provider with vision support
 * @returns Design evaluation with score and issues
 */
export async function evaluateDesign(
  screenshotBase64: string,
  designSpec: string,
  provider: LLMProvider,
): Promise<Result<DesignEvaluation>> {
  const imageBlock: ContentBlock = {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: screenshotBase64,
    },
  };

  const textBlock: ContentBlock = {
    type: 'text',
    text: `Design specification:\n${designSpec}\n\nEvaluate the screenshot above against this specification.`,
  };

  const result = await provider.complete(
    {
      system: EVALUATION_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: [imageBlock, textBlock] },
      ],
    },
    {
      model: 'claude-sonnet-4',
      maxTokens: 4096,
      temperature: 0,
    },
  );

  if (!result.ok) {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `Evaluation LLM call failed: ${JSON.stringify(result.error)}`,
      recoverable: true,
    });
  }

  try {
    const content = result.value.content;
    // Extract JSON from possible markdown fence
    const fenceMatch = /```json\s*\n?([\s\S]*?)```/.exec(content);
    const jsonStr = fenceMatch ? fenceMatch[1].trim() : content.trim();

    const parsed = JSON.parse(jsonStr) as { score: number; issues: DesignIssue[] };

    const score = typeof parsed.score === 'number' ? parsed.score : 0;
    const issues: DesignIssue[] = Array.isArray(parsed.issues) ? parsed.issues : [];

    const overallQuality: DesignEvaluation['overallQuality'] =
      score >= 80 ? 'good' : score >= 50 ? 'needs_fixes' : 'poor';

    return Ok({ score, overallQuality, issues });
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `Failed to parse evaluation response: ${result.value.content.slice(0, 200)}`,
      recoverable: true,
    });
  }
}
