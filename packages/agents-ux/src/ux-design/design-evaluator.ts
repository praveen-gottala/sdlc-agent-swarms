/**
 * @module @agentforge/agents-ux/ux-design/design-evaluator
 *
 * Evaluates design screenshots against specifications using vision LLM.
 * Part of the visual self-correction loop.
 */

import type { Result, DesignTokensSpec } from '@agentforge/core';
import { Ok, Err, EVALUATOR_MODEL, isVisionLLMEnabled, safeParse, debugLog } from '@agentforge/core';
import type { DesignSpecV2, CatalogMap } from '@agentforge/designspec-renderer';
import { buildEvaluatorConstraintsPrompt } from '@agentforge/designspec-renderer';
import { DesignEvaluationOutputSchema } from '../schemas.js';
import type { LLMProvider, ContentBlock } from '@agentforge/providers';
import type { UXPlanningOutput } from '../ux-planning/ux-planning.js';
import { countPlanningNavigateTo, countSpecNavigateTo } from './validate-navigate-to.js';
import { buildEvaluationContext } from './evaluation-context.js';
import { runStructuralQualityGate, MAX_STRUCTURAL_DEDUCTION } from './structural-quality-gate.js';

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
  /** True when evaluation was structural-only (no vision LLM). */
  readonly structural?: boolean;
}

/** Optional post-vision structural checks (Plan B B0b). */
export interface EvaluateDesignOptions {
  readonly structuralNavCheck?: {
    readonly planning: UXPlanningOutput;
    readonly getSpec: () => DesignSpecV2;
  };
  /** Model override for vision evaluation. Falls back to EVALUATOR_MODEL. */
  readonly resolvedModel?: string;
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

const EVALUATION_SYSTEM_PROMPT = `You are a design quality evaluator. Analyze the provided design screenshot against the design specification.

Score each dimension 0-20, then sum for the total score (0-100):

**1. Layout Structure (0-20)**
- 20: All components present, correct hierarchy, no orphaned nodes
- 15: Minor layout issues (1-2 misaligned elements)
- 10: Significant gaps (missing section, broken hierarchy)
- 5: Multiple missing components
- 0: Major structural failure (blank page, single element only)

**2. Visual Hierarchy (0-20)**
- 20: Clear heading/body/label scale, consistent weight usage, 2+ typographic levels visible
- 15: Minor hierarchy issues (1 inconsistent heading level)
- 10: Flat hierarchy (most text same size/weight)
- 5: Barely any differentiation
- 0: No discernible hierarchy

**3. Content Completeness (0-20)**
- 20: All text populated with realistic domain content, no placeholders, no truncation
- 15: Minor gaps (1-2 missing labels or values)
- 10: Multiple missing text nodes or truncated text
- 5: Significant content gaps
- 0: Most content missing or placeholder "Lorem ipsum"

**4. Spacing & Density (0-20)**
- 20: Consistent gaps, appropriate padding, no dead space, cards fill row width
- 15: Minor spacing inconsistencies (1-2 sections with slightly off padding)
- 10: Significant dead space (>200px below content) or cramped sections
- 5: Major spacing issues (overlapping elements, excessive gaps)
- 0: Broken layout

**5. Visual Treatment (0-20)**
- 20: Mixed container treatments (2+ of: shadow, border, flat background), appropriate color usage, semantic tokens applied
- 15: Slight monotony but acceptable variety (all cards have shadows but different colors)
- 10: All sections use identical treatment (every card: same shadow + same radius + same background)
- 5: Minimal visual treatment
- 0: No visual treatment (all plain/bare containers)

Text quality flags (report as issues regardless of score):
- Text truncated (cut off mid-word) → issueId "text-truncation-{component}", severity "critical"
- Text overlapping other elements → issueId "text-overlap-{component}", severity "critical"
- >200px dead space below content → issueId "excessive-root-height", severity "major"

${buildEvaluatorConstraintsPrompt()}

IMPORTANT:
- Give each issue a stable "issueId" (lowercase-kebab-case).
- Be SPECIFIC in the "fix" field — include concrete node names, pixel values, colors.

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
 * Evaluate a design screenshot against a specification.
 *
 * @param screenshotBase64 - Base64-encoded PNG of the design
 * @param designSpec - JSON-serialized design specification. Callers typically pass
 *   `JSON.stringify(spec)` where `spec` is a `DesignSpecV2` object, or
 *   `JSON.stringify(planning)` where `planning` is a `UXPlanningOutput` object.
 *   The evaluator uses this as context for the vision LLM — it does not parse
 *   the JSON structurally (except for navigateTo compliance checking).
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
  catalogMap?: CatalogMap,
  options?: EvaluateDesignOptions,
): Promise<Result<DesignEvaluation>> {
  if (designSpec && !designSpec.startsWith('{')) {
    debugLog('evaluateDesign: designSpec does not appear to be JSON — evaluation context may be degraded');
  }

  if (!isVisionLLMEnabled()) {
    return Ok({
      score: 0,
      overallQuality: 'poor' as const,
      issues: [],
    });
  }

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

  let catalogComplianceContext = '';
  if (catalogMap) {
    try {
      const specObj = JSON.parse(designSpec);
      const usedIds = new Set<string>();
      if (specObj.nodes) {
        for (const node of Object.values(specObj.nodes)) {
          const cat = (node as Record<string, unknown>).catalog;
          if (typeof cat === 'string') usedIds.add(cat);
        }
      }
      if (usedIds.size > 0) {
        const entries: string[] = [];
        for (const id of usedIds) {
          const entry = catalogMap[id];
          if (!entry) continue;
          const parts = [`  - ${id} (${entry.type ?? 'unknown'})`];
          if (entry.required_fields?.length) parts.push(`required: ${entry.required_fields.join(', ')}`);
          if (entry.background) parts.push(`bg: ${entry.background}`);
          if (entry.text_color) parts.push(`text: ${entry.text_color}`);
          if (entry.text_typography) parts.push(`typo: ${entry.text_typography}`);
          entries.push(parts.join(' | '));
        }
        if (entries.length > 0) {
          catalogComplianceContext = `\n\nCATALOG COMPONENT COMPLIANCE — verify these components match their catalog definition:\n${entries.join('\n')}\n- Deduct 5 points per catalog component whose visual appearance deviates from its defined tokens\n- Report catalog violations as issues with issueId prefix "catalog-"`;
        }
      }
    } catch { /* spec not parseable — skip catalog context */ }
  }

  // Build compact spec context instead of raw JSON (80-90% token reduction).
  // The vision LLM sees the screenshot — it already knows layout/spacing/colors.
  // The context conveys only intent: component names, text, catalog, navigateTo.
  let compactContext: string;
  let parsedSpec: DesignSpecV2 | null = null;
  try {
    const parsed = JSON.parse(designSpec) as DesignSpecV2;
    if (parsed.nodes) parsedSpec = parsed;
    compactContext = buildEvaluationContext(parsed);
  } catch {
    compactContext = designSpec;
    debugLog('evaluateDesign: could not parse designSpec for compact context — using raw text');
  }

  const textBlock: ContentBlock = {
    type: 'text',
    text: `Design specification:\n${compactContext}\n\nEvaluate the screenshot above against this specification.${historyContext}${tokenComplianceContext}${catalogComplianceContext}`,
  };

  // Log payload sizes for debugging token budget issues
  const imageBytes = screenshotBase64.length;
  const contextChars = textBlock.text.length;
  const estimatedTokens = Math.ceil(imageBytes / 750) + Math.ceil(contextChars / 4) + Math.ceil(EVALUATION_SYSTEM_PROMPT.length / 4);
  debugLog(`evaluateDesign: payload — image=${imageBytes}B, context=${contextChars}chars, est.tokens=${estimatedTokens}`);

  const MAX_RETRIES = 2;
  const WALL_TIME_CAP_MS = 50_000;
  const startTime = Date.now();
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const elapsed = Date.now() - startTime;
      if (elapsed > WALL_TIME_CAP_MS) {
        debugLog(`evaluateDesign: wall-time cap reached (${elapsed}ms) — skipping retry ${attempt}`);
        break;
      }
    }

    const result = await provider.complete(
      {
        system: EVALUATION_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: [imageBlock, textBlock] },
        ],
      },
      {
        model: options?.resolvedModel ?? EVALUATOR_MODEL,
        maxTokens: 4096,
        responseSchema: EVALUATION_OUTPUT_SCHEMA,
      },
    );

    if (result.ok) {
      lastError = null;

      // Prefer structured output, fall back to text parsing with validation
      const structured = result.value.structured;
      let evalData: { score: number; issues: DesignIssue[] };

      if (structured) {
        let toValidate = structured as Record<string, unknown>;
        if (toValidate && typeof toValidate === 'object' && 'response' in toValidate && typeof toValidate.response === 'object') {
          debugLog('evaluateDesign: unwrapping nested {response:{...}} from vision LLM output');
          toValidate = toValidate.response as Record<string, unknown>;
        }
        const structuredResult = DesignEvaluationOutputSchema.safeParse(toValidate);
        if (structuredResult.success) {
          evalData = structuredResult.data as { score: number; issues: DesignIssue[] };
        } else {
          debugLog(`evaluateDesign: structured output parse failed — ${structuredResult.error.issues.map(i => i.message).join(', ')}`);
          evalData = { score: 0, issues: [] };
        }
      } else {
        const parseResult = safeParse(result.value.content, DesignEvaluationOutputSchema, 'Design Evaluation');
        if (!parseResult.ok) return parseResult as Result<never>;
        evalData = parseResult.value as { score: number; issues: DesignIssue[] };
      }

      let finalScore = typeof evalData.score === 'number' ? evalData.score : 0;
      const issues: DesignIssue[] = Array.isArray(evalData.issues) ? [...evalData.issues] : [];

      let structuralDeductions = 0;

      if (options?.structuralNavCheck) {
        const { planning, getSpec } = options.structuralNavCheck;
        const specObj = getSpec();
        const exp = countPlanningNavigateTo(planning);
        if (exp > 0) {
          const act = countSpecNavigateTo(specObj);
          if (act < exp) {
            const gap = exp - act;
            structuralDeductions += Math.min(15, gap * 3);
            issues.push({
              severity: 'major',
              component: 'DesignSpec',
              description: `Expected ${String(exp)} navigateTo binding(s) from planning; DesignSpec has ${String(act)} (missing ${String(gap)}).`,
              fix: 'Map each componentTree node with navigateTo to a DesignSpec node with the same target.',
              issueId: 'navigateTo-count-mismatch',
            });
          }
        }
      }

      if (parsedSpec) {
        const sqResult = runStructuralQualityGate(parsedSpec);
        structuralDeductions += sqResult.deductions;
        issues.push(...sqResult.issues);
      }

      finalScore = Math.max(0, finalScore - Math.min(structuralDeductions, MAX_STRUCTURAL_DEDUCTION));

      const overallQuality: DesignEvaluation['overallQuality'] =
        finalScore >= 80 ? 'good' : finalScore >= 50 ? 'needs_fixes' : 'poor';

      return Ok({ score: finalScore, overallQuality, issues });
    }

    // Handle error — retry only on RATE_LIMITED
    lastError = result.error;
    const isRateLimited = 'code' in result.error && result.error.code === 'RATE_LIMITED';
    if (!isRateLimited || attempt >= MAX_RETRIES) break;

    const retryAfterMs = ('retryAfterMs' in result.error && typeof result.error.retryAfterMs === 'number')
      ? result.error.retryAfterMs
      : 60_000;
    const waitMs = Math.min(retryAfterMs, 30_000);
    debugLog(`evaluateDesign: RATE_LIMITED — retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  return Err({
    code: 'LLM_MALFORMED_OUTPUT' as const,
    message: `Evaluation LLM call failed: ${JSON.stringify(lastError)}`,
    recoverable: true,
  });
}
