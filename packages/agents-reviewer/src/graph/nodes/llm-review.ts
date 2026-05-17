/**
 * @module llm-review
 *
 * Reviewer Node 2: fresh-context LLM diff review.
 * Prompt instructs the LLM to validate diff vs assumption ledger and
 * self-categorize findings as blocking/suggestion/false-positive.
 *
 * Vision Layer 9 v1 — collapses passes 3+4 (assumption validator + triage)
 * into the review prompt. See m4-execution-plan.md deviation note.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { debugLog, FindingCategorySchema, ReviewOutcomeSchema } from '@agentforge/core';
import type { ReviewFinding } from '@agentforge/core';
import type { ReviewerDeps, ReviewerNodeFn } from '../../deps.js';
import type { ReviewerStateType } from '../state.js';
import type { GateResult } from '../../types.js';

const LLMReviewResponseSchema = z.object({
  findings: z.array(z.object({
    id: z.string(),
    category: FindingCategorySchema,
    description: z.string(),
    file: z.string(),
    line: z.number().int().optional(),
    evidence: z.string(),
  })),
  assumptionViolations: z.array(z.string()),
  outcome: ReviewOutcomeSchema,
});

const REVIEW_RESPONSE_JSON_SCHEMA = zodToJsonSchema(
  LLMReviewResponseSchema,
  { target: 'openApi3' },
) as Record<string, unknown>;

function buildReviewPrompt(
  state: ReviewerStateType,
  gateResults: readonly GateResult[],
): string {
  const diff = state.diff;
  const ledger = state.assumptionLedger;
  const report = state.taskCompletionReport;

  const sections: string[] = [];

  sections.push('You are a code reviewer for a software project.');
  sections.push('Review the following diff and provide structured findings.');
  sections.push('');

  sections.push('## Deterministic Gate Results');
  for (const gate of gateResults) {
    sections.push(`- [${gate.passed ? 'PASS' : 'FAIL'}] ${gate.name}: ${gate.detail}`);
  }
  sections.push('');

  if (diff) {
    sections.push('## Diff');
    sections.push(`Diff ID: ${diff.id}`);
    sections.push(`Task: ${diff.taskId}`);
    sections.push(`Branch: ${diff.worktreeBranch}`);
    sections.push(`Tests passed: ${diff.testsPassed}`);
    sections.push(`Typecheck passed: ${diff.typecheckPassed}`);
    sections.push(`Lint passed: ${diff.lintPassed}`);
    sections.push('');
    sections.push('### Files changed');
    for (const file of diff.files) {
      sections.push(`- ${file.operation} ${file.path}`);
      for (const hunk of file.hunks) {
        sections.push(`  Lines ${hunk.startLine}-${hunk.endLine}:`);
        const lines = hunk.content.split('\n').slice(0, 50);
        for (const line of lines) {
          sections.push(`    ${line}`);
        }
        if (hunk.content.split('\n').length > 50) {
          sections.push('    ... (truncated)');
        }
      }
    }
    sections.push('');
  }

  if (ledger && ledger.entries.length > 0) {
    sections.push('## Assumption Ledger');
    sections.push('Validate the diff against these assumptions:');
    for (const entry of ledger.entries) {
      const resolved = entry.resolvedBy ? ` (resolved by: ${entry.resolvedBy})` : '';
      sections.push(
        `- [${entry.id}] ${entry.statement} ` +
        `(confidence: ${entry.confidence}, blast: ${entry.blastRadius})${resolved}`,
      );
    }
    sections.push('');
  }

  if (report) {
    sections.push('## Task Completion Report');
    sections.push(`Task: ${report.taskId}`);
    sections.push(`Files written: ${report.filesWritten.join(', ')}`);
    if (report.deviationsFromContract.length > 0) {
      sections.push(`Deviations: ${report.deviationsFromContract.join('; ')}`);
    }
    sections.push('');
  }

  sections.push('## Instructions');
  sections.push('1. Review the diff for correctness, security, and code quality.');
  sections.push('2. Validate the diff against the assumption ledger entries above.');
  sections.push('3. For each finding, categorize as: blocking, suggestion, or false-positive.');
  sections.push('4. List any assumption violations (IDs from the ledger).');
  sections.push('5. Determine the outcome:');
  sections.push('   - "approved" if no blocking findings and no assumption violations.');
  sections.push('   - "rejected" if there are fixable blocking findings.');
  sections.push('   - "escalated" if there are non-fixable issues or governance hard-blocks.');

  return sections.join('\n');
}

export function createLlmReview(deps: ReviewerDeps): ReviewerNodeFn {
  return async (state: ReviewerStateType): Promise<Partial<ReviewerStateType>> => {
    debugLog('llmReview: ENTER');

    const governanceFailed = state.gateResults.some(
      (g) => !g.passed && g.name === 'governance-scan',
    );

    if (governanceFailed) {
      debugLog('llmReview: governance gate failed — producing escalation result without LLM');
      const findings: ReviewFinding[] = state.gateResults
        .filter((g) => !g.passed)
        .map((g, i) => ({
          id: `gate-${i}`,
          category: 'blocking' as const,
          description: `Deterministic gate failed: ${g.name}`,
          file: '',
          evidence: g.detail,
        }));

      return {
        reviewResult: {
          id: crypto.randomUUID(),
          diffId: state.diff?.id ?? 'unknown',
          findings,
          assumptionViolations: [],
          outcome: 'escalated',
          revisionCount: 0,
        },
      };
    }

    const prompt = buildReviewPrompt(state, state.gateResults);

    try {
      const result = await deps.provider.complete(
        { system: '', messages: [{ role: 'user', content: prompt }] },
        {
          model: 'claude-sonnet-4-6',
          maxTokens: 8192,
          temperature: 0,
          responseSchema: { schema: REVIEW_RESPONSE_JSON_SCHEMA },
        },
      );

      if (!result.ok) {
        debugLog(`llmReview: LLM call failed — ${result.error.code}`);
        const errDetail = 'message' in result.error ? result.error.message : result.error.code;
        return {
          errors: [`LLM review failed: ${errDetail}`],
          reviewResult: {
            id: crypto.randomUUID(),
            diffId: state.diff?.id ?? 'unknown',
            findings: [],
            assumptionViolations: [],
            outcome: 'escalated',
            revisionCount: 0,
          },
        };
      }

      let raw: unknown;
      if (result.value.structured) {
        raw = result.value.structured;
      } else {
        try {
          const cleaned = result.value.content
            .replace(/^```(?:json)?\s*/m, '')
            .replace(/\s*```\s*$/m, '')
            .trim();
          raw = JSON.parse(cleaned);
        } catch {
          debugLog('llmReview: response is not valid JSON — escalating');
          return {
            errors: ['LLM review response was not valid JSON'],
            reviewResult: {
              id: crypto.randomUUID(),
              diffId: state.diff?.id ?? 'unknown',
              findings: [],
              assumptionViolations: [],
              outcome: 'escalated',
              revisionCount: 0,
            },
          };
        }
      }

      const parsed = LLMReviewResponseSchema.safeParse(raw);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        debugLog(`llmReview: schema validation failed: ${issues}`);
        return {
          errors: [`LLM review schema validation failed: ${issues}`],
          reviewResult: {
            id: crypto.randomUUID(),
            diffId: state.diff?.id ?? 'unknown',
            findings: [],
            assumptionViolations: [],
            outcome: 'escalated',
            revisionCount: 0,
          },
        };
      }

      debugLog(
        `llmReview: EXIT — ${parsed.data.findings.length} findings, ` +
        `${parsed.data.assumptionViolations.length} violations, ` +
        `outcome=${parsed.data.outcome}`,
      );

      return {
        reviewResult: {
          id: crypto.randomUUID(),
          diffId: state.diff?.id ?? 'unknown',
          findings: parsed.data.findings,
          assumptionViolations: parsed.data.assumptionViolations,
          outcome: parsed.data.outcome,
          revisionCount: 0,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      debugLog(`llmReview: ERROR — ${message}`);

      return {
        errors: [`LLM review failed: ${message}`],
        reviewResult: {
          id: crypto.randomUUID(),
          diffId: state.diff?.id ?? 'unknown',
          findings: [],
          assumptionViolations: [],
          outcome: 'escalated',
          revisionCount: 0,
        },
      };
    }
  };
}
