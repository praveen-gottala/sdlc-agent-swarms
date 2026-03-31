/**
 * @module @agentforge/agents-ux/ux-design/browser-correction-pipeline
 *
 * End-to-end browser-based design correction pipeline.
 * Orchestrates: browser session → DOM extraction → mechanical fixes →
 * interactive preview → vision-assisted correction loop.
 */
import type { LLMProvider } from '@agentforge/providers';
import type {
  DesignSpecV2,
  RendererTokens,
  CatalogMap,
  MechanicalIssue,
} from '@agentforge/designspec-renderer';
import {
  openBrowserSession,
  checkMechanicalIssues,
  applyMechanicalFixes,
} from '@agentforge/designspec-renderer';
import type { UserFeedbackTag } from '@agentforge/designspec-renderer';
import { runCorrectionLoop } from './correction-loop.js';
import { evaluateDesign } from './design-evaluator.js';
import { createBrowserCorrectionAdapter } from './browser-correction-adapter.js';
import { mkdirSync, writeFileSync } from 'node:fs';

// ─── Logging helpers ─────────────────────────────────────────

/* eslint-disable no-console */
function log(msg: string) { console.log(`[correction] ${msg}`); }
function logSection(msg: string) { log(`▸ ${msg}`); }
function logDetail(msg: string) { log(`  ${msg}`); }
/* eslint-enable no-console */

/** Write intermediate spec + screenshot for a given iteration. */
function writeIterationArtifacts(
  outputDir: string | undefined,
  iteration: number,
  spec: DesignSpecV2,
  screenshot: Buffer,
): void {
  if (!outputDir) return;
  try {
    mkdirSync(outputDir, { recursive: true });
    const specPath = `${outputDir}/iteration-${iteration}-spec.json`;
    const screenshotPath = `${outputDir}/iteration-${iteration}-screenshot.png`;
    writeFileSync(specPath, JSON.stringify(spec, null, 2));
    writeFileSync(screenshotPath, screenshot);
    logDetail(`Artifacts → ${specPath}`);
  } catch (err) {
    logDetail(`Failed to write iteration artifacts: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Result of running the browser correction pipeline. */
export interface BrowserCorrectionResult {
  spec: DesignSpecV2;
  screenshot: Buffer;
  html: string;
  finalScore: number;
  iterations: number;
  thresholdMet: boolean;
  mechanicalResults?: { appliedFixes: MechanicalIssue[]; accepted: boolean };
  userTags?: readonly UserFeedbackTag[];
}

/** Options for the browser correction pipeline. */
export interface BrowserCorrectionOptions {
  maxCorrections?: number;
  qualityThreshold?: number;
  interactive?: boolean;
  mechanicalFixes?: boolean;
  width?: number;
  /** Directory to write intermediate spec + screenshot after each correction iteration. */
  outputDir?: string;
}

/**
 * Run the full browser-based design correction pipeline.
 *
 * 1. Open browser session, take initial screenshot
 * 2. Extract DOM layout
 * 3. Run mechanical auto-fixes (Tier 1) with monotonic guard
 * 4. Run interactive preview with continuous feedback loop (if interactive && TTY)
 *    OR run vision-assisted correction loop (non-interactive)
 * 5. Return final spec + screenshot + score
 */
export async function runBrowserCorrectionPipeline(
  spec: DesignSpecV2,
  tokens: RendererTokens,
  catalog: CatalogMap,
  provider: LLMProvider,
  options?: BrowserCorrectionOptions,
): Promise<BrowserCorrectionResult> {
  const inputSpec: DesignSpecV2 = JSON.parse(JSON.stringify(spec));
  let currentSpec: DesignSpecV2 = JSON.parse(JSON.stringify(spec));
  const maxIterations = options?.maxCorrections ?? 3;
  const qualityThreshold = options?.qualityThreshold ?? 80;

  // ── Pipeline start ──
  log('══════════════════════════════════════════════════');
  log(`Design Correction Pipeline — ${currentSpec.screen}`);
  log('══════════════════════════════════════════════════');
  logDetail(`Input: ${Object.keys(currentSpec.nodes).length} nodes, ${currentSpec.width ?? 1440}px viewport`);

  // 1. Open browser session
  logSection('Opening browser session...');
  const t0 = Date.now();
  const { session, initial } = await openBrowserSession(
    currentSpec,
    tokens,
    catalog,
    { width: options?.width },
  );
  logDetail(`Playwright: launched in ${Date.now() - t0}ms`);
  logDetail(`Initial screenshot: ${initial.screenshot.length} bytes`);

  let latestScreenshot = initial.screenshot;
  let latestHtml = initial.html;
  let mechanicalResults: { appliedFixes: MechanicalIssue[]; accepted: boolean } | undefined;

  try {
    // 2. Extract DOM layout
    logSection('Extracting DOM layout...');
    const t1 = Date.now();
    let dom = await session.extractDOM();
    const domNodeIds = Object.keys(dom.nodes);
    logDetail(`Extracted ${domNodeIds.length} nodes in ${Date.now() - t1}ms`);

    const catalogNodes = Object.values(dom.nodes).filter(n => n.dataCatalog !== null);
    if (catalogNodes.length > 0) {
      const catalogValues = [...new Set(catalogNodes.map(n => n.dataCatalog))];
      logDetail(`Catalog components: ${catalogNodes.length} (${catalogValues.join(', ')})`);
    }

    // 3. Mechanical auto-fixes
    logSection('Running mechanical checks...');
    if (options?.mechanicalFixes !== false) {
      const allIssues = checkMechanicalIssues(dom, currentSpec);

      if (allIssues.length === 0) {
        logDetail('No mechanical issues found ✓');
      } else {
        const tier1Issues = allIssues.filter(i => i.autoFixable);
        const tier2Issues = allIssues.filter(i => !i.autoFixable);

        logDetail(`Found ${allIssues.length} issues:`);
        logDetail(`  Tier 1 (auto-fixable): ${tier1Issues.length}`);
        for (const issue of tier1Issues) {
          logDetail(`    ✦ ${issue.nodeId ?? '?'}: ${issue.rule} — ${issue.description}`);
        }
        logDetail(`  Tier 2 (report-only): ${tier2Issues.length}`);
        for (const issue of tier2Issues) {
          logDetail(`    ◇ ${issue.nodeId ?? '?'}: ${issue.rule} — ${issue.description}`);
        }

        if (tier1Issues.length > 0) {
          logDetail(`Applied ${tier1Issues.length} auto-fixes → re-rendering...`);
          const patchedSpec = applyMechanicalFixes(currentSpec, tier1Issues);
          const patchedResult = await session.rerender(patchedSpec);
          const patchedDom = await session.extractDOM();
          const patchedIssues = checkMechanicalIssues(patchedDom, patchedSpec);

          const issueCountBefore = allIssues.length;
          const issueCountAfter = patchedIssues.length;

          if (issueCountAfter < issueCountBefore) {
            logDetail(`Re-check: ${issueCountBefore} → ${issueCountAfter} issues (accepted ✓)`);
            currentSpec = patchedSpec;
            latestScreenshot = patchedResult.screenshot;
            latestHtml = patchedResult.html;
            dom = patchedDom;
            mechanicalResults = { appliedFixes: tier1Issues, accepted: true };
          } else {
            logDetail(`Re-check: ${issueCountBefore} → ${issueCountAfter} issues (reverted — no improvement)`);
            const revertResult = await session.rerender(currentSpec);
            latestScreenshot = revertResult.screenshot;
            latestHtml = revertResult.html;
            mechanicalResults = { appliedFixes: tier1Issues, accepted: false };
          }
        }
      }
    } else {
      logDetail('Mechanical checks skipped (disabled)');
    }

    // Collect Tier 2 mechanical issues for context in vision correction
    const allMechIssues = checkMechanicalIssues(dom, currentSpec);
    const tier2Issues = allMechIssues.filter(i => !i.autoFixable);

    // 4. Interactive vs non-interactive mode
    const outputDir = options?.outputDir;
    if (options?.interactive !== false && process.stdout.isTTY) {
      // ── Interactive mode: continuous feedback loop ──
      return await runInteractiveCorrectionLoop(
        session, currentSpec, inputSpec, tokens, catalog, provider, dom,
        tier2Issues, latestScreenshot, latestHtml, mechanicalResults,
        maxIterations, qualityThreshold, outputDir,
      );
    } else {
      // ── Non-interactive mode: automated correction loop ──
      return await runNonInteractiveCorrectionLoop(
        session, currentSpec, inputSpec, provider, dom,
        tier2Issues, latestScreenshot, latestHtml, mechanicalResults,
        maxIterations, qualityThreshold, outputDir,
      );
    }
  } finally {
    await session.close();
  }
}

// ─── Interactive Correction Loop ────────────────────────────

async function runInteractiveCorrectionLoop(
  session: Awaited<ReturnType<typeof openBrowserSession>>['session'],
  currentSpec: DesignSpecV2,
  inputSpec: DesignSpecV2,
  tokens: RendererTokens,
  catalog: CatalogMap,
  provider: LLMProvider,
  dom: Awaited<ReturnType<Awaited<ReturnType<typeof openBrowserSession>>['session']['extractDOM']>>,
  tier2Issues: readonly MechanicalIssue[],
  latestScreenshot: Buffer,
  latestHtml: string,
  mechanicalResults: { appliedFixes: MechanicalIssue[]; accepted: boolean } | undefined,
  maxIterations: number,
  qualityThreshold: number,
  outputDir?: string,
): Promise<BrowserCorrectionResult> {
  logSection('Opening interactive preview...');

  const { openInteractivePreview } = await import('@agentforge/designspec-renderer');
  const preview = await openInteractivePreview(currentSpec, tokens, catalog);

  logDetail(`Preview: http://localhost:${preview.port}/index.html`);
  logDetail('Waiting for user feedback...');

  const specRef = { value: currentSpec };
  let currentScore = 0;
  let totalIterations = 0;
  let allUserTags: UserFeedbackTag[] = [];
  let currentDom = dom;

  try {
    let round = 1;

    while (round <= maxIterations) {
      logDetail(`Waiting for user feedback (round ${round})...`);
      const feedback = await preview.waitForFeedback();

      if (feedback.approved) {
        if (feedback.tags.length > 0) {
          allUserTags.push(...feedback.tags);
          for (const tag of feedback.tags) {
            logDetail(`← Tag: ${tag.nodeId} — "${tag.feedback}"`);
          }
        }
        logDetail(`User approved at round ${round} ✓`);

        // If user tagged issues AND approved, run one last correction
        if (feedback.tags.length > 0) {
          logDetail(`Running final correction with ${feedback.tags.length} tags before closing...`);
          await runSingleVisionCorrection(
            session, specRef, provider, currentDom, feedback.tags, tier2Issues,
            latestScreenshot, round, maxIterations,
          );
          currentSpec = specRef.value;
          const renderResult = await session.rerender(currentSpec);
          latestScreenshot = renderResult.screenshot;
          latestHtml = renderResult.html;
          totalIterations++;
          writeIterationArtifacts(outputDir, totalIterations, currentSpec, latestScreenshot);
        }
        break;
      }

      if (feedback.tags.length === 0) {
        logDetail('No tags submitted — waiting for user action');
        continue;
      }

      // Log received tags
      for (const tag of feedback.tags) {
        logDetail(`← Tag: ${tag.nodeId} — "${tag.feedback}"`);
      }
      logDetail(`Received ${feedback.tags.length} tags — running vision correction...`);
      allUserTags.push(...feedback.tags);

      // Run vision correction
      const prevScore = currentScore;
      await runSingleVisionCorrection(
        session, specRef, provider, currentDom, feedback.tags, tier2Issues,
        latestScreenshot, round, maxIterations,
      );
      currentSpec = specRef.value;
      totalIterations++;

      // Re-render and get updated state
      const renderResult = await session.rerender(currentSpec);
      latestScreenshot = renderResult.screenshot;

      writeIterationArtifacts(outputDir, totalIterations, currentSpec, latestScreenshot);
      latestHtml = renderResult.html;
      currentDom = await session.extractDOM();

      // Evaluate score
      const evalResult = await evaluateDesign(
        latestScreenshot.toString('base64'),
        JSON.stringify(currentSpec),
        provider,
      );
      if (evalResult.ok) {
        currentScore = evalResult.value.score;
        logDetail(`Score: ${currentScore}/100 (previous: ${prevScore})`);
      }

      // Refresh preview with corrections
      logDetail('Preview refreshed with corrections');
      await preview.refresh(currentSpec, currentScore, round + 1);

      round++;
    }
  } finally {
    await preview.close();
  }

  // ── Pipeline complete ──
  return logAndReturnResult(
    currentSpec, inputSpec, latestScreenshot, latestHtml,
    currentScore, totalIterations, qualityThreshold,
    mechanicalResults, allUserTags.length > 0 ? allUserTags : undefined,
  );
}

// ─── Non-Interactive Correction Loop ────────────────────────

async function runNonInteractiveCorrectionLoop(
  session: Awaited<ReturnType<typeof openBrowserSession>>['session'],
  currentSpec: DesignSpecV2,
  inputSpec: DesignSpecV2,
  provider: LLMProvider,
  dom: Awaited<ReturnType<Awaited<ReturnType<typeof openBrowserSession>>['session']['extractDOM']>>,
  tier2Issues: readonly MechanicalIssue[],
  latestScreenshot: Buffer,
  latestHtml: string,
  mechanicalResults: { appliedFixes: MechanicalIssue[]; accepted: boolean } | undefined,
  maxIterations: number,
  qualityThreshold: number,
  outputDir?: string,
): Promise<BrowserCorrectionResult> {
  logSection(`Starting vision-assisted correction (max ${maxIterations} iterations)...`);
  logDetail(`User tags: 0, Tier 2 mechanical issues: ${tier2Issues.length}`);

  const specRef = { value: currentSpec };
  const adapter = createBrowserCorrectionAdapter(
    session,
    specRef,
    provider,
    dom,
    undefined, // no user tags in non-interactive mode
    tier2Issues,
  );

  const correctionResult = await runCorrectionLoop(adapter, {
    maxCorrections: maxIterations,
    qualityThreshold,
    renderDelayMs: 500,
    designSpec: JSON.stringify(currentSpec),
    provider,
  });

  // Get final screenshot
  currentSpec = specRef.value;
  const finalResult = await session.rerender(currentSpec);
  latestScreenshot = finalResult.screenshot;
  latestHtml = finalResult.html;

  return logAndReturnResult(
    currentSpec, inputSpec, latestScreenshot, latestHtml,
    correctionResult.finalScore, correctionResult.iterations,
    qualityThreshold, mechanicalResults, undefined,
  );
}

// ─── Single Vision Correction Pass ──────────────────────────

async function runSingleVisionCorrection(
  session: Awaited<ReturnType<typeof openBrowserSession>>['session'],
  specRef: { value: DesignSpecV2 },
  provider: LLMProvider,
  dom: Awaited<ReturnType<Awaited<ReturnType<typeof openBrowserSession>>['session']['extractDOM']>>,
  userTags: readonly UserFeedbackTag[],
  tier2Issues: readonly MechanicalIssue[],
  latestScreenshot: Buffer,
  round: number,
  maxIterations: number,
): Promise<void> {
  logDetail(`Iteration ${round}/${maxIterations}:`);

  const adapter = createBrowserCorrectionAdapter(
    session,
    specRef,
    provider,
    dom,
    userTags,
    tier2Issues,
  );

  // Build synthetic issues from user tags so the adapter processes them
  const syntheticIssues = userTags.map(tag => ({
    severity: 'major' as const,
    component: tag.nodeId,
    description: tag.feedback,
    fix: tag.feedback,
    issueId: `user-tag-${tag.nodeId}`,
  }));

  logDetail(`  Sending to vision LLM: screenshot + DOM (${Object.keys(dom.nodes).length} nodes) + spec (${Object.keys(specRef.value.nodes).length} nodes) + ${userTags.length} tags`);

  const fixResult = await adapter.executeFixes(
    syntheticIssues,
    latestScreenshot.toString('base64'),
    [],
  );

  if (fixResult.ok) {
    logDetail(`  LLM response: ${fixResult.value.fixed} patches applied, ${fixResult.value.failed} failed`);
    for (const attempt of fixResult.value.fixAttempts) {
      if (attempt.stepsSucceeded > 0) {
        logDetail(`    ✎ ${attempt.issueComponent}: ${attempt.issueDescription}`);
      }
    }
  } else {
    logDetail(`  Vision correction failed: ${fixResult.error.message}`);
  }
}

// ─── Result Logging & Assembly ──────────────────────────────

function logAndReturnResult(
  currentSpec: DesignSpecV2,
  inputSpec: DesignSpecV2,
  screenshot: Buffer,
  html: string,
  finalScore: number,
  iterations: number,
  qualityThreshold: number,
  mechanicalResults: { appliedFixes: MechanicalIssue[]; accepted: boolean } | undefined,
  userTags: readonly UserFeedbackTag[] | undefined,
): BrowserCorrectionResult {
  const thresholdMet = finalScore >= qualityThreshold;

  // Compute diff summary
  const inputNodeIds = new Set(Object.keys(inputSpec.nodes));
  const outputNodeIds = new Set(Object.keys(currentSpec.nodes));
  const modifiedNodes: string[] = [];
  const addedNodes: string[] = [];
  const removedNodes: string[] = [];

  for (const id of outputNodeIds) {
    if (!inputNodeIds.has(id)) {
      addedNodes.push(id);
    } else if (JSON.stringify(inputSpec.nodes[id]) !== JSON.stringify(currentSpec.nodes[id])) {
      modifiedNodes.push(id);
    }
  }
  for (const id of inputNodeIds) {
    if (!outputNodeIds.has(id)) {
      removedNodes.push(id);
    }
  }

  const hasChanges = modifiedNodes.length > 0 || addedNodes.length > 0 || removedNodes.length > 0;

  if (!hasChanges) {
    logSection('Pipeline complete — no corrections applied');
    logDetail(`Score: ${finalScore}/100 (threshold: ${qualityThreshold})`);
    logDetail('Spec unchanged');
  } else {
    logSection('Pipeline complete');
    logDetail(`Final score: ${finalScore}/100`);
    logDetail(`Total iterations: ${iterations}`);
    logDetail(`Corrections applied: yes`);
    logDetail('Changes from input:');
    if (modifiedNodes.length > 0) logDetail(`  Modified nodes: ${modifiedNodes.join(', ')}`);
    if (addedNodes.length > 0) logDetail(`  Added nodes: ${addedNodes.join(', ')}`);
    if (removedNodes.length > 0) logDetail(`  Removed nodes: ${removedNodes.join(', ')}`);
  }
  log('══════════════════════════════════════════════════');

  return {
    spec: currentSpec,
    screenshot,
    html,
    finalScore,
    iterations,
    thresholdMet,
    mechanicalResults,
    userTags,
  };
}
