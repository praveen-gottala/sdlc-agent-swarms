/**
 * @module @agentforge/agents-ux/ux-design/design-evaluator
 *
 * Evaluates Figma design screenshots against specifications using vision LLM.
 * Part of the visual self-correction loop.
 */

import type { Result, DesignTokensSpec, PromptTrace } from '@agentforge/core';
import { Ok, Err, DEFAULT_MODEL, recordPromptTrace, recordPromptTraceResponse } from '@agentforge/core';
import type { LLMProvider, ContentBlock } from '@agentforge/providers';

/** JSON Schema for structured evaluation output. */
const EVALUATION_OUTPUT_SCHEMA = {
  schema: {
    type: 'object' as const,
    properties: {
      score: { type: 'number' },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            issueId: { type: 'string' },
            severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
            component: { type: 'string' },
            description: { type: 'string' },
            fix: { type: 'string' },
          },
          required: ['severity', 'component', 'description', 'fix'],
          additionalProperties: false,
        },
      },
    },
    required: ['score', 'issues'],
    additionalProperties: false,
  },
};

/** A single design issue found during evaluation. */
export interface DesignIssue {
  readonly severity: 'critical' | 'major' | 'minor';
  readonly component: string;
  readonly description: string;
  readonly fix: string;
  /** Stable issue ID for tracking across correction iterations. */
  readonly issueId?: string;
}

/** Result of a design evaluation. */
export interface DesignEvaluation {
  readonly score: number;
  readonly overallQuality: 'good' | 'needs_fixes' | 'poor';
  readonly issues: readonly DesignIssue[];
}

/** History entry for a previous correction attempt. */
export interface CorrectionHistory {
  readonly iteration: number;
  readonly score: number;
  readonly issues: readonly DesignIssue[];
  /** What fixes were attempted and their outcomes. */
  readonly fixAttempts: readonly FixAttemptRecord[];
}

/** Record of a single fix attempt. */
export interface FixAttemptRecord {
  readonly issueComponent: string;
  readonly issueDescription: string;
  readonly stepsAttempted: number;
  readonly stepsSucceeded: number;
  readonly stepsFailed: number;
  readonly stepsSkipped: number;
}

const EVALUATION_SYSTEM_PROMPT = `You are a design quality evaluator. Analyze the provided Figma screenshot against the design specification.

Evaluate these dimensions:
1. **Visual hierarchy** — clear content structure, appropriate heading sizes, spacing
2. **Text presence** — all expected text nodes exist (no missing labels, values, titles)
3. **Color application** — backgrounds, text colors, borders match spec (no all-white/blank areas)
4. **Spacing & alignment** — consistent padding, proper auto-layout, aligned elements
5. **Completeness** — all specified components are present (header, cards, charts, tables)
6. **Content density & dead space** — no large empty areas below content, sections tightly packed, cards filling their row width, root board height matching actual content

Score from 0 to 100:
- 80-100: Good — minor polish issues only
- 50-79: Needs fixes — visible issues that affect usability
- 0-49: Poor — major missing components or broken layout

Scoring modifiers for content density (apply these deductions):
- Deduct 10–15 points if there is >200px of dead/empty space below the last content section (e.g., footer ends at 2000px but root is 4800px)
- Deduct 5–10 points per section that uses >60px top or bottom padding (excessive whitespace)
- Deduct 5 points if cards in a row don't fill at least 80% of the available row width
- If the bottom 30%+ of a tall page (>2000px) appears visually empty → report as critical issue with issueId "excessive-root-height"

Text quality (critical — these indicate broken layout, not just poor design):
- Deduct 15 points if any text appears truncated (cut off mid-word, or text visibly extends beyond its container)
- Deduct 10 points if text nodes overlap each other or overlap input field boundaries
- Deduct 5 points per text node that appears to overflow its parent container
- If text labels show partial words (e.g., "Enter your bill de" instead of full text) → report as critical issue with issueId "text-truncation-{component}"
- If a value and its label overlap (e.g., "$0.00" overlapping "Amount") → report as critical issue with issueId "text-overlap-{component}"

IMPORTANT:
- Give each issue a stable "issueId" (lowercase-kebab-case, e.g., "missing-header-title", "card-spacing-wrong").
  This allows tracking which issues persist across correction iterations.
- Be SPECIFIC in the "fix" field. Include concrete values: exact colors, pixel sizes, node names to target.
  Bad: "Add text nodes for each metric"
  Good: "Create 3 TEXT nodes inside MetricsRow with content 'Total Cost', 'Daily Avg', 'Token Usage', fontSize 14, color {r:0.2,g:0.2,b:0.2}"

Respond ONLY with a JSON object:
{
  "score": <number>,
  "issues": [
    {
      "issueId": "<stable-kebab-case-id>",
      "severity": "critical" | "major" | "minor",
      "component": "<component name>",
      "description": "<what is wrong>",
      "fix": "<specific fix instruction with concrete values>"
    }
  ]
}`;

/**
 * Evaluate a Figma design screenshot against a specification.
 *
 * @param screenshotBase64 - Base64-encoded PNG of the design
 * @param designSpec - Text description of what the design should contain
 * @param provider - LLM provider with vision support
 * @param correctionHistory - Previous correction attempts (so evaluator can detect persistent issues)
 * @param designTokens - Optional project design tokens for token compliance validation
 * @returns Design evaluation with score and issues
 */
export async function evaluateDesign(
  screenshotBase64: string,
  designSpec: string,
  provider: LLMProvider,
  correctionHistory?: readonly CorrectionHistory[],
  designTokens?: DesignTokensSpec,
  traceCollector?: { promptTraces?: PromptTrace[] },
  traceStage?: string,
): Promise<Result<DesignEvaluation>> {
  const imageBlock: ContentBlock = {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: screenshotBase64,
    },
  };

  let historyContext = '';
  if (correctionHistory && correctionHistory.length > 0) {
    const historyLines = correctionHistory.map((h) => {
      const persistentIssues = h.issues
        .filter((i) => i.severity === 'critical' || i.severity === 'major')
        .map((i) => `  - [${i.severity}] ${i.component}: ${i.description}`);
      const fixSummary = h.fixAttempts
        .map((f) => `  - ${f.issueComponent}: ${f.stepsSucceeded}/${f.stepsAttempted} steps succeeded`)
        .join('\n');
      return `Iteration ${h.iteration} (score: ${h.score}/100):\n  Issues found:\n${persistentIssues.join('\n')}\n  Fix attempts:\n${fixSummary}`;
    });
    historyContext = `\n\nPREVIOUS CORRECTION HISTORY:\nThe following issues were found and fix attempts were made in prior iterations.\nIf an issue persists despite fixes, suggest a DIFFERENT approach in the "fix" field.\n\n${historyLines.join('\n\n')}`;
  }

  let tokenComplianceContext = '';
  if (designTokens) {
    const colorNames = Object.entries(designTokens.colors.primitive)
      .map(([name, hex]) => `${name}: ${hex}`)
      .join(', ');
    const typographySizes = designTokens.typography.scale
      .map((e) => `${e.role}: ${e.size}px/${e.weight}`)
      .join(', ');
    const spacingValues = designTokens.spacing.scale.join(', ');
    tokenComplianceContext = `\n\nDESIGN TOKEN COMPLIANCE — verify these are correctly applied:
- Color palette: ${colorNames}
- Typography scale: ${typographySizes}
- Spacing scale (px): ${spacingValues}
- Deduct 5 points per color that doesn't match the token palette
- Deduct 3 points per typography size that doesn't match the scale
- Report token violations as issues with issueId prefix "token-"`;
  }

  const textBlock: ContentBlock = {
    type: 'text',
    text: `Design specification:\n${designSpec}\n\nEvaluate the screenshot above against this specification.${historyContext}${tokenComplianceContext}`,
  };

  // Record evaluation prompt trace
  const evalStageName = traceStage ?? 'evaluation';
  if (traceCollector) {
    recordPromptTrace(traceCollector, evalStageName,
      { system: EVALUATION_SYSTEM_PROMPT, messages: [{ role: 'user', content: textBlock.text }] },
      { model: DEFAULT_MODEL, maxTokens: 4096 });
  }

  const result = await provider.complete(
    {
      system: EVALUATION_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: [imageBlock, textBlock] },
      ],
    },
    {
      model: DEFAULT_MODEL,
      maxTokens: 4096,
      temperature: 0,
      responseSchema: EVALUATION_OUTPUT_SCHEMA,
    },
  );

  if (!result.ok) {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `Evaluation LLM call failed: ${JSON.stringify(result.error)}`,
      recoverable: true,
    });
  }

  // Record evaluation response trace
  if (traceCollector) {
    recordPromptTraceResponse(traceCollector, evalStageName, {
      content: result.value.content,
      structured: result.value.structured,
      usage: result.value.usage ? { inputTokens: result.value.usage.inputTokens, outputTokens: result.value.usage.outputTokens, cacheReadTokens: result.value.usage.cacheReadTokens, cacheWriteTokens: result.value.usage.cacheWriteTokens } : undefined,
      cost: result.value.cost ? { inputCostUsd: result.value.cost.inputCostUsd, outputCostUsd: result.value.cost.outputCostUsd, totalCostUsd: result.value.cost.totalCostUsd } : undefined,
      latencyMs: result.value.latencyMs,
      finishReason: result.value.finishReason,
      hasVisionInput: true,
    });
  }

  try {
    // Prefer structured output, fall back to text parsing
    const structured = result.value.structured;
    let parsed: { score: number; issues: DesignIssue[] };

    if (structured) {
      parsed = structured as { score: number; issues: DesignIssue[] };
    } else {
      const content = result.value.content;
      const fenceMatch = /```json\s*\n?([\s\S]*?)```/.exec(content);
      const jsonStr = fenceMatch ? fenceMatch[1].trim() : content.trim();
      parsed = JSON.parse(jsonStr) as { score: number; issues: DesignIssue[] };
    }

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
