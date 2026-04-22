/**
 * @module @agentforge/agents-ux/ux-design/correction-loop
 *
 * Shared visual self-correction loop for design tools.
 * Tool-agnostic: works with Figma, Penpot, or any design tool
 * that can capture screenshots and execute fixes.
 *
 * Flow: Screenshot -> Evaluate (vision LLM) -> Fix -> Repeat
 */

import type { DesignSpecV2, CatalogMap } from '@agentforge/designspec-renderer';
import type { Result, DesignTokensSpec, PromptTrace } from '@agentforge/core';
import { logDefaults } from '@agentforge/core';
import type { LLMProvider } from '@agentforge/providers';
import { evaluateDesign } from './design-evaluator.js';
import type { DesignIssue, CorrectionHistory, FixAttemptRecord } from './design-evaluator.js';
import type { UXPlanningOutput } from '../ux-planning/ux-planning.js';

/** Result of executing design fixes (tool-specific). */
export interface CorrectionFixResult {
  readonly fixed: number;
  readonly failed: number;
  readonly fixAttempts: readonly FixAttemptRecord[];
}

/** Adapter interface for tool-specific operations in the correction loop. */
export interface CorrectionAdapter {
  /**
   * Capture a screenshot of the current design state.
   * @returns base64-encoded PNG string
   */
  captureScreenshot(): Promise<Result<string>>;

  /**
   * Generate and execute fixes for the given design issues.
   * @param issues - Issues found by the evaluator (filtered to critical/major)
   * @param screenshotBase64 - Current design screenshot for context
   * @param correctionHistory - Previous correction attempts
   * @returns Fix execution results
   */
  executeFixes(
    issues: readonly DesignIssue[],
    screenshotBase64: string,
    correctionHistory: readonly CorrectionHistory[],
  ): Promise<Result<CorrectionFixResult>>;
}

/** Options for the correction loop. */
export interface CorrectionLoopOptions {
  /** Maximum number of correction iterations. Default: 3 */
  readonly maxCorrections?: number;
  /** Score threshold to consider design acceptable. Default: 80 */
  readonly qualityThreshold?: number;
  /** Milliseconds to wait after fixes for rendering. Default: 3000 */
  readonly renderDelayMs?: number;
  /** Design specification JSON for the evaluator. */
  readonly designSpec: string;
  /** LLM provider for the evaluator (vision model). Falls back to `provider` if omitted. */
  readonly evaluatorProvider?: LLMProvider;
  /** LLM provider (used as evaluator fallback and passed to adapter). */
  readonly provider: LLMProvider;
  /** Design tokens for token compliance evaluation. */
  readonly designTokens?: DesignTokensSpec;
  /** Catalog map for catalog compliance evaluation. */
  readonly catalogMap?: CatalogMap;
  /** Trace collector for recording LLM call inputs/outputs. */
  readonly traceCollector?: { promptTraces?: PromptTrace[] };
  /**
   * When set, the evaluator compares planning navigateTo count vs the live DesignSpec
   * (no vision) and may dock the score. Skipped if omitted.
   */
  readonly structuralNavCheck?: { planning: UXPlanningOutput; getSpec: () => DesignSpecV2 };
}

/** Result of running the correction loop. */
export interface CorrectionLoopResult {
  /** Final design quality score (0-100). */
  readonly finalScore: number;
  /** Number of correction iterations run. */
  readonly iterations: number;
  /** Whether quality threshold was met. */
  readonly thresholdMet: boolean;
  /** Full correction history. */
  readonly history: readonly CorrectionHistory[];
}

/**
 * Run the visual self-correction loop.
 *
 * 1. Capture screenshot
 * 2. Evaluate design quality (vision LLM)
 * 3. If score >= threshold, stop
 * 4. If score not improving, stop
 * 5. Generate and execute fixes via adapter
 * 6. Wait for render
 * 7. Repeat (up to maxCorrections)
 *
 * @param adapter - Tool-specific adapter for screenshots and fix execution
 * @param options - Loop configuration (thresholds, delays, LLM provider)
 * @returns Final score, iteration count, and correction history
 */
export async function runCorrectionLoop(
  adapter: CorrectionAdapter,
  options: CorrectionLoopOptions,
): Promise<CorrectionLoopResult> {
  const maxCorrections = options.maxCorrections ?? 3;
  const qualityThreshold = options.qualityThreshold ?? 80;
  const renderDelayMs = options.renderDelayMs ?? 3000;

  logDefaults('runCorrectionLoop', {
    maxCorrections: [options.maxCorrections, '3'],
    qualityThreshold: [options.qualityThreshold, '80'],
    renderDelayMs: [options.renderDelayMs, '3000'],
  });

  // eslint-disable-next-line no-console
  console.log('\n        [Phase C] Visual self-correction loop');

  // Initial render delay
  await new Promise((resolve) => setTimeout(resolve, renderDelayMs));

  const correctionHistory: CorrectionHistory[] = [];
  let previousScore = -1;
  let finalScore = 0;
  let iterations = 0;
  let thresholdMet = false;

  for (let correction = 0; correction < maxCorrections; correction++) {
    iterations = correction + 1;

    // 1. Capture screenshot
    const screenshotResult = await adapter.captureScreenshot();
    if (!screenshotResult.ok) {
      // eslint-disable-next-line no-console
      console.warn(`        [correction ${iterations}] Screenshot failed: ${screenshotResult.error.message}`);
      break;
    }

    const screenshotBase64 = screenshotResult.value;

    // 2. Evaluate (use dedicated evaluator provider if available)
    const evalResult = await evaluateDesign(
      screenshotBase64,
      options.designSpec,
      options.evaluatorProvider ?? options.provider,
      correctionHistory.length > 0 ? correctionHistory : undefined,
      options.designTokens,
      options.catalogMap,
      options.traceCollector,
      `evaluation-${iterations}`,
      options.structuralNavCheck
        ? { structuralNavCheck: options.structuralNavCheck }
        : undefined,
    );

    if (!evalResult.ok) {
      // eslint-disable-next-line no-console
      console.warn(`        [correction ${iterations}] Evaluation failed: ${evalResult.error.message}`);
      break;
    }

    const evaluation = evalResult.value;
    finalScore = evaluation.score;

    // eslint-disable-next-line no-console
    console.log(`        [correction ${iterations}] Score: ${evaluation.score}/100 (${evaluation.overallQuality}), issues: ${evaluation.issues.length}`);

    // 3. Check score regression (noisy evaluator detection)
    if (previousScore >= 0 && evaluation.score < previousScore) {
      // eslint-disable-next-line no-console
      console.warn(`        [correction ${iterations}] Score regressed from ${previousScore} to ${evaluation.score} after fixes. Possible non-deterministic evaluation.`);
      if (previousScore >= 75) {
        // eslint-disable-next-line no-console
        console.log(`        [correction ${iterations}] Previous score ${previousScore} was >= 75 — keeping higher score`);
        finalScore = previousScore;
        break;
      }
    }

    // 4. Check threshold
    if (evaluation.score >= qualityThreshold) {
      const msg = correction === 0
        ? `        [Phase C] First evaluation passed (${evaluation.score} >= ${qualityThreshold}) — skipping correction loop`
        : `        [correction] Quality threshold met (${evaluation.score} >= ${qualityThreshold})`;
      // eslint-disable-next-line no-console
      console.log(msg);
      thresholdMet = true;
      break;
    }

    // 5. Check stall or plateau (score not improving meaningfully)
    if (previousScore >= 0) {
      const improvement = evaluation.score - previousScore;
      if (improvement <= 0) {
        // eslint-disable-next-line no-console
        console.log(`        [correction] Score not improving (${evaluation.score} vs ${previousScore}), stopping`);
        break;
      }
      if (improvement < 3) {
        // eslint-disable-next-line no-console
        console.log(`        [correction] Score plateau (${previousScore} → ${evaluation.score}, +${improvement} < 3), stopping`);
        break;
      }
    }
    previousScore = evaluation.score;

    // 6. Filter to actionable issues
    const actionableIssues = evaluation.issues.filter(
      (issue) => issue.severity === 'critical' || issue.severity === 'major',
    );

    if (actionableIssues.length === 0) {
      // eslint-disable-next-line no-console
      console.log(`        [correction ${iterations}] No critical/major issues to fix`);
      break;
    }

    // 7. Execute fixes via adapter
    const fixResult = await adapter.executeFixes(
      actionableIssues,
      screenshotBase64,
      correctionHistory,
    );

    if (fixResult.ok) {
      // eslint-disable-next-line no-console
      console.log(`        [correction ${iterations}] Fixed: ${fixResult.value.fixed}, Failed: ${fixResult.value.failed}`);

      // Check if all fix steps were skipped (nothing changed — no point re-evaluating)
      const totalAttempted = fixResult.value.fixAttempts.reduce((sum, a) => sum + a.stepsAttempted, 0);
      const totalSkipped = fixResult.value.fixAttempts.reduce((sum, a) => sum + a.stepsSkipped, 0);
      const totalExecuted = totalAttempted - totalSkipped;

      if (totalExecuted === 0 && totalAttempted > 0) {
        // eslint-disable-next-line no-console
        console.log(`        [correction ${iterations}] All fix attempts failed validation — skipping re-evaluation, keeping score ${previousScore >= 0 ? previousScore : finalScore}`);
        break;
      }
      if (totalSkipped > 0 && totalExecuted > 0) {
        // eslint-disable-next-line no-console
        console.log(`        [correction ${iterations}] ${totalSkipped}/${totalAttempted} fix steps skipped`);
      }

      correctionHistory.push({
        iteration: iterations,
        score: evaluation.score,
        issues: evaluation.issues,
        fixAttempts: fixResult.value.fixAttempts,
      });
    } else {
      // eslint-disable-next-line no-console
      console.warn(`        [correction ${iterations}] Fix execution failed: ${fixResult.error.message}`);
      break;
    }

    // 8. Wait for render
    await new Promise((resolve) => setTimeout(resolve, renderDelayMs));
  }

  return {
    finalScore,
    iterations,
    thresholdMet,
    history: correctionHistory,
  };
}
