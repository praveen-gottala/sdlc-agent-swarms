/**
 * @module assumption-validator
 *
 * Reviewer Node 3: dedicated assumption validation.
 * Two-phase validation:
 *   1. Deterministic pass — scans diff content for contradictions
 *      against resolved assumption values.
 *   2. LLM pass — for unresolved/ambiguous assumptions, sends only
 *      assumption entries + relevant diff hunks (focused, cheaper).
 *
 * Vision Layer 9 pass 3 — formerly collapsed into llmReview.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { debugLog } from '@agentforge/core';
import type { AssumptionEntry } from '@agentforge/core';
import type { ReviewerDeps, ReviewerNodeFn } from '../../deps.js';
import type { ReviewerStateType } from '../state.js';
import type { AssumptionValidationResult } from '../../types.js';

const AssumptionValidatorResponseSchema = z.object({
  results: z.array(z.object({
    assumptionId: z.string(),
    violated: z.boolean(),
    evidence: z.string(),
  })),
});

const VALIDATOR_RESPONSE_JSON_SCHEMA = zodToJsonSchema(
  AssumptionValidatorResponseSchema,
  { target: 'openApi3' },
) as Record<string, unknown>;

function extractKeyTerms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;.:()\[\]{}'"]+/)
    .filter((t) => t.length > 3)
    .filter((t) => !STOP_WORDS.has(t));
}

const STOP_WORDS = new Set([
  'that', 'this', 'with', 'from', 'have', 'will', 'been',
  'should', 'would', 'could', 'must', 'does', 'each', 'they',
  'their', 'about', 'which', 'when', 'where', 'what', 'there',
  'than', 'then', 'also', 'into', 'only', 'some', 'such',
  'more', 'other', 'very', 'just', 'over', 'after', 'before',
  'between', 'under', 'above', 'below', 'during', 'through',
]);

function scanForContradiction(
  entry: AssumptionEntry,
  diffContent: string,
): AssumptionValidationResult | null {
  const statementTerms = extractKeyTerms(entry.statement);
  const resolutionTerms = entry.resolution
    ? extractKeyTerms(entry.resolution)
    : [];

  const allTerms = [...new Set([...statementTerms, ...resolutionTerms])];
  if (allTerms.length === 0) return null;

  const lowerDiff = diffContent.toLowerCase();
  const matchedTerms = allTerms.filter((t) => lowerDiff.includes(t));
  if (matchedTerms.length === 0) return null;

  const negationPatterns = [
    /\bnot\s+/i, /\bno\s+/i, /\bnever\b/i, /\bdisable/i,
    /\bremov/i, /\bdeprecat/i, /\breplac/i, /\bwithout\b/i,
    /\binstead\s+of\b/i, /\bdon'?t\b/i,
  ];

  const addedLines = diffContent
    .split('\n')
    .filter((line) => line.startsWith('+'));

  for (const line of addedLines) {
    const lineHasRelevantTerms = matchedTerms.some((t) =>
      line.toLowerCase().includes(t),
    );
    if (!lineHasRelevantTerms) continue;

    for (const pattern of negationPatterns) {
      if (pattern.test(line)) {
        return {
          assumptionId: entry.id,
          violated: true,
          evidence: `Resolved assumption "${entry.statement}" may be contradicted: ${line.trim().slice(0, 200)}`,
          severity: 'blocking',
        };
      }
    }
  }

  return null;
}

function buildValidatorPrompt(
  unresolvedEntries: readonly AssumptionEntry[],
  diffSummary: string,
): string {
  const sections: string[] = [];

  sections.push('You are validating unresolved assumptions against a code diff.');
  sections.push('For each assumption, determine if the diff violates it.');
  sections.push('');

  sections.push('## Unresolved Assumptions');
  for (const entry of unresolvedEntries) {
    sections.push(
      `- [${entry.id}] ${entry.statement} ` +
      `(confidence: ${entry.confidence}, blast: ${entry.blastRadius})`,
    );
  }
  sections.push('');

  sections.push('## Diff');
  sections.push(diffSummary);
  sections.push('');

  sections.push('## Instructions');
  sections.push('For each assumption above, evaluate whether the diff contradicts or undermines it.');
  sections.push('Return a result for each assumption with:');
  sections.push('- assumptionId: the ID from the list');
  sections.push('- violated: true if the diff contradicts the assumption, false otherwise');
  sections.push('- evidence: brief explanation of why it is or is not violated');

  return sections.join('\n');
}

function severityFromBlastRadius(blastRadius: string): 'blocking' | 'warning' {
  return blastRadius === 'high' || blastRadius === 'critical'
    ? 'blocking'
    : 'warning';
}

export function createAssumptionValidator(deps: ReviewerDeps): ReviewerNodeFn {
  return async (state: ReviewerStateType): Promise<Partial<ReviewerStateType>> => {
    debugLog('assumptionValidator: ENTER');

    const ledger = state.assumptionLedger;
    if (!ledger || ledger.entries.length === 0) {
      debugLog('assumptionValidator: no ledger or empty entries — skipping');
      return { assumptionValidationResults: [] };
    }

    const results: AssumptionValidationResult[] = [];

    // Phase 1: Deterministic pass — resolved assumptions
    const resolvedEntries = ledger.entries.filter((e) => e.resolvedBy);
    const unresolvedEntries = ledger.entries.filter((e) => !e.resolvedBy);

    if (state.diff && resolvedEntries.length > 0) {
      const allDiffContent = state.diff.files
        .map((f) => f.hunks.map((h) => h.content).join('\n'))
        .join('\n');

      for (const entry of resolvedEntries) {
        const contradiction = scanForContradiction(entry, allDiffContent);
        if (contradiction) {
          results.push(contradiction);
        } else {
          results.push({
            assumptionId: entry.id,
            violated: false,
            evidence: 'No contradiction found in diff',
            severity: 'warning',
          });
        }
      }
    }

    debugLog(
      `assumptionValidator: deterministic pass — ${resolvedEntries.length} resolved, ` +
      `${results.filter((r) => r.violated).length} contradictions`,
    );

    // Phase 2: LLM pass — unresolved assumptions only
    if (unresolvedEntries.length > 0 && state.diff) {
      const diffSummary = state.diff.files
        .map((f) => {
          const hunks = f.hunks
            .map((h) => h.content.split('\n').slice(0, 30).join('\n'))
            .join('\n');
          return `### ${f.operation} ${f.path}\n${hunks}`;
        })
        .join('\n\n');

      const prompt = buildValidatorPrompt(unresolvedEntries, diffSummary);

      try {
        const llmResult = await deps.provider.complete(
          { system: '', messages: [{ role: 'user', content: prompt }] },
          {
            model: 'claude-sonnet-4-6',
            maxTokens: 4096,
            temperature: 0,
            responseSchema: { schema: VALIDATOR_RESPONSE_JSON_SCHEMA },
          },
        );

        if (!llmResult.ok) {
          const errDetail = 'message' in llmResult.error
            ? llmResult.error.message
            : llmResult.error.code;
          debugLog(`assumptionValidator: LLM call failed — ${errDetail}`);
          return {
            assumptionValidationResults: results,
            errors: [`Assumption validation LLM failed: ${errDetail}`],
          };
        }

        let raw: unknown;
        if (llmResult.value.structured) {
          raw = llmResult.value.structured;
        } else {
          try {
            const cleaned = llmResult.value.content
              .replace(/^```(?:json)?\s*/m, '')
              .replace(/\s*```\s*$/m, '')
              .trim();
            raw = JSON.parse(cleaned);
          } catch {
            debugLog('assumptionValidator: response is not valid JSON');
            return {
              assumptionValidationResults: results,
              errors: ['Assumption validation response was not valid JSON'],
            };
          }
        }

        const parsed = AssumptionValidatorResponseSchema.safeParse(raw);
        if (!parsed.success) {
          const issues = parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ');
          debugLog(`assumptionValidator: schema validation failed: ${issues}`);
          return {
            assumptionValidationResults: results,
            errors: [`Assumption validation schema failed: ${issues}`],
          };
        }

        const entryMap = new Map(unresolvedEntries.map((e) => [e.id, e]));
        for (const r of parsed.data.results) {
          const entry = entryMap.get(r.assumptionId);
          results.push({
            assumptionId: r.assumptionId,
            violated: r.violated,
            evidence: r.evidence,
            severity: r.violated
              ? severityFromBlastRadius(entry?.blastRadius ?? 'medium')
              : 'warning',
          });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        debugLog(`assumptionValidator: ERROR — ${message}`);
        return {
          assumptionValidationResults: results,
          errors: [`Assumption validation failed: ${message}`],
        };
      }
    }

    const violationCount = results.filter((r) => r.violated).length;
    debugLog(
      `assumptionValidator: EXIT — ${results.length} results, ${violationCount} violations`,
    );

    return { assumptionValidationResults: results };
  };
}
