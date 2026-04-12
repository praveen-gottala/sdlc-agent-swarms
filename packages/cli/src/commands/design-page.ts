/**
 * @module @agentforge/cli/commands/design-page
 *
 * The `agentforge design:page <description>` command.
 * Runs the full UX design pipeline (Research -> Planning -> Design)
 * with Penpot integration via the Penpot MCP HTTP/SSE server.
 *
 * This command:
 * 1. Starts the Penpot MCP server (Docker) if not running
 * 2. Discovers available tools via tools/list
 * 3. Runs Research -> Planning -> Design stages
 * 4. Optionally runs visual self-correction loop
 */

import { resolve, join, relative } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolveCLIModel } from '../utils/resolve-cli-model.js';
import { createPipelineContext, ensureOutputDir, saveArtifact, loadArtifact, saveTextArtifact, formatPromptTrace, deriveModuleId } from '../utils/pipeline-context.js';
import { successMsg, errorMsg, infoMsg, warnMsg } from '../formatter.js';
import { findProjectRoot, loadDotEnv } from '../fs-utils.js';
import { verifyImplementation } from './impl-verify.js';
import { ensureDesignToolConnection, createNoOpMCPClient } from './design-preflight.js';
import {
  Ok,
  createRealFs,
  loadDesignTokens,
  loadBrandSpec,
  loadComponentCatalog,
  loadProjectManifest,
  resolveViewports,
  readSpecs,
  PIPELINE_ARTIFACTS,
  debugLog,
  logDefaults,
} from '@agentforge/core';
import type {
  MCPClient,
  LLMProviderRef,
  DesignTokensSpec,
  BrandSpec,
  DesignConfig,
  PromptTrace,
  PageContext,
  PageEntry,
} from '@agentforge/core';
import { createClaudeProvider } from '@agentforge/providers';
import { requireClaudeAuth } from '../utils/require-claude-auth.js';
import type { LLMProvider } from '@agentforge/providers';
import { createMockLLMProvider } from '../mock-llm-outputs/index.js';
import {
  uxResearchWork,
  uxPlanningWork,
  penpotDesignWork,
  exportDesignSpecToPenpot,
  buildDesignSystemContextFromSpec,
  buildComponentCatalogPrompt,
  uxImplementationWork,
  writeImplementationFiles,
  runDesignFeedbackLoop,
  discoverPenpotAPI,
  createPenpotCollaborationSession,
  createPenpotReviewCallback,
  mapPenpotToDesignOutput,
  resolvePageEntry,
  buildPageContext,
  evaluateDesign,
} from '@agentforge/agents-ux';
import type { BrowserCorrectionOptions } from '@agentforge/agents-ux';
import type {
  UXResearchInput,
  UXResearchOutput,
  UXPlanningInput,
  UXPlanningOutput,
  PenpotDesignInput,
  PenpotDesignOutput,
  UXImplementationInput,
  ImplementCallback,
} from '@agentforge/agents-ux';
import type { RendererTokens } from '@agentforge/designspec-renderer';
import { loadCatalogForRenderer, openBrowserSession, openInteractivePreview } from '@agentforge/designspec-renderer';

// ============================================================================
// Types
// ============================================================================

interface DesignPageOptions {
  /**
   * Skip to a specific stage (loads prior stages from artifacts).
   * - 'replay': re-execute cached design script via Penpot MCP (no LLM calls)
   * - 'replay-browser': re-render cached designSpec in browser via Playwright (no Penpot, no LLM)
   * - 'connect': test connection only, load design from cache
   */
  readonly stage?: 'research' | 'planning' | 'design' | 'replay' | 'replay-browser' | 'connect';
  /** Module ID for the design. Default: derived from description. */
  readonly module?: string;
  /** Target viewport width in pixels (default: 1440). */
  readonly width?: number;
  /** Exit immediately after design without waiting for approval. */
  readonly noWait?: boolean;
  /** Skip feedback loop and generate code directly after design. */
  readonly implement?: boolean;
  /** Use mock MCP client (no design tool connection required). */
  readonly mock?: boolean;
  /** Project directory for artifact path resolution (default: cwd). */
  readonly projectDir?: string;
  /** Use V1 LLM-based script generation instead of deterministic V2 renderer. */
  readonly designspecV1?: boolean;
  /** Force re-run all stages even if cached artifacts exist. */
  readonly fresh?: boolean;
  /** Run non-interactive evaluation after design. Exit code 1 if score < threshold. */
  readonly evaluate?: boolean;
  /** Minimum score (0-100) for --evaluate to pass. Default: 75. */
  readonly evaluateThreshold?: number;
  /** Export to Penpot after browser correction. undefined = prompt user, true = always, false = never. */
  readonly exportPenpot?: boolean;
  /** Use Penpot-based correction instead of browser correction. */
  readonly penpotCorrection?: boolean;
  /** Force interactive (true) or non-interactive (false) browser correction. */
  readonly interactive?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert core DesignTokensSpec to the renderer's RendererTokens.
 * Maps all design token fields so the renderer can use them data-driven
 * instead of hardcoding values.
 */
function toRendererTokens(spec: DesignTokensSpec): RendererTokens {
  const { version, created_by, ...tokens } = spec;
  return tokens;
}

/** Build and save pipeline-trace.json summary. */
function savePipelineTrace(
  outputDir: string,
  moduleId: string,
  traces: readonly PromptTrace[],
): void {
  const stages = traces.map(t => ({
    stage: t.stage,
    model: t.model,
    ...(t.latencyMs !== undefined ? { latencyMs: t.latencyMs } : {}),
    ...(t.usage ? { usage: t.usage } : {}),
    ...(t.cost ? { cost: { totalCostUsd: t.cost.totalCostUsd } } : {}),
    ...(t.finishReason ? { finishReason: t.finishReason } : {}),
    ...(t.hasVisionInput ? { hasVisionInput: true } : {}),
  }));

  const totalCost = traces.reduce((sum, t) => sum + (t.cost?.totalCostUsd ?? 0), 0);
  const totalInputTokens = traces.reduce((sum, t) => sum + (t.usage?.inputTokens ?? 0), 0);
  const totalOutputTokens = traces.reduce((sum, t) => sum + (t.usage?.outputTokens ?? 0), 0);

  const summary = {
    moduleId,
    timestamp: new Date().toISOString(),
    stages,
    totalCost,
    totalInputTokens,
    totalOutputTokens,
  };

  const filePath = join(outputDir, 'pipeline-trace.json');
  writeFileSync(filePath, JSON.stringify(summary, null, 2), 'utf-8');
}

/**
 * Resolve whether to export to Penpot.
 * - true/false from CLI flag → use directly
 * - undefined → prompt user if TTY, default no otherwise
 */
async function resolvePenpotExport(
  flag: boolean | undefined,
  output: NodeJS.WritableStream,
): Promise<boolean> {
  if (flag !== undefined) return flag;

  const isTTY = 'isTTY' in process.stdin && (process.stdin as NodeJS.ReadStream).isTTY;
  if (!isTTY) return false;

  output.write(infoMsg('\n  Export to Penpot? (y/n): '));

  return new Promise<boolean>((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw ?? false;
    if (typeof stdin.setRawMode === 'function') {
      stdin.setRawMode(true);
    }
    stdin.resume();

    const onData = (data: Buffer) => {
      const char = data.toString().trim().toLowerCase();
      stdin.removeListener('data', onData);
      if (typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(wasRaw);
      }
      stdin.pause();
      output.write(char === 'y' ? 'yes\n' : 'no\n');
      resolve(char === 'y');
    };
    stdin.on('data', onData);
  });
}

// ============================================================================
// Command
// ============================================================================

/**
 * Execute the design:penpot command.
 * Runs the full UX pipeline with Penpot integration.
 *
 * @param pageIdOrDescription - Page ID from pages.yaml (e.g., "bill-entry"),
 *   case-insensitive page name, or free-form description (legacy fallback).
 */
export async function designPageCommand(
  pageIdOrDescription: string,
  output: NodeJS.WritableStream = process.stdout,
  options: DesignPageOptions = {},
): Promise<void> {
  const taskId = `task_design_penpot_${Date.now()}`;
  const skipToStage = options.stage;
  const baseDir = options.projectDir ? resolve(process.cwd(), options.projectDir) : process.cwd();
  logDefaults('designPageCommand', {
    projectDir: [options.projectDir, 'process.cwd()'],
  });
  const promptTraces: PromptTrace[] = [];

  // Load .env file so ANTHROPIC_API_KEY is available
  const projectRoot = findProjectRoot(baseDir);
  loadDotEnv(projectRoot);
  const relPath = (absPath: string) => relative(process.cwd(), absPath);

  // ── Load pages.yaml and resolve page context ──
  const specDir = join(projectRoot, 'agentforge', 'spec');
  const realFs = createRealFs();
  const specsResult = readSpecs(specDir, realFs);

  let resolvedPage: PageEntry | undefined;
  let pageContext: PageContext | undefined;
  let description = pageIdOrDescription;

  if (specsResult.ok && specsResult.value.pages && specsResult.value.pages.pages.length > 0) {
    const allPages = specsResult.value.pages.pages;
    resolvedPage = resolvePageEntry(pageIdOrDescription, allPages);

    if (resolvedPage) {
      description = resolvedPage.description;
      pageContext = buildPageContext(
        resolvedPage,
        allPages,
        specsResult.value.models?.models,
        specsResult.value.api?.endpoints,
      );
      output.write(infoMsg(`  Page matched: ${resolvedPage.id} (${resolvedPage.name}) — ${resolvedPage.components.length} components, route: ${resolvedPage.route}\n`));
    } else {
      // If pages.yaml exists but page not found, fail with available page IDs
      const availableIds = allPages.map(p => p.id).join(', ');
      output.write(errorMsg(`Page '${pageIdOrDescription}' not found. Available pages: ${availableIds}\n`));
      process.exitCode = 1;
      return;
    }
  }

  // Use page.id as moduleId when page is resolved; ignore --module
  const moduleId = resolvedPage ? resolvedPage.id : (options.module ?? deriveModuleId(pageIdOrDescription));
  if (!resolvedPage && !options.module) {
    debugLog(`designPageCommand: moduleId not provided → derived from description: "${moduleId}"`);
  }
  const outputDir = ensureOutputDir(moduleId, baseDir);

  output.write(infoMsg('='.repeat(60) + '\n'));
  output.write(infoMsg(`  AgentForge Penpot Design Pipeline\n`));
  output.write(infoMsg(`  Module: ${moduleId}\n`));
  output.write(infoMsg(`  Description: ${description}\n`));
  output.write(infoMsg('='.repeat(60) + '\n'));

  // Load project manifest for design config
  const manifestResult = loadProjectManifest(projectRoot, realFs);
  const designConfig: DesignConfig | undefined = manifestResult.ok ? manifestResult.value.design : undefined;

  // ── Load PRD for app context ──
  const prdPath = join(projectRoot, 'docs', 'prd.md');
  let prdContent: string | undefined;
  if (existsSync(prdPath)) {
    prdContent = readFileSync(prdPath, 'utf-8');
    output.write(infoMsg(`  PRD loaded from ${relPath(prdPath)}\n`));
  } else {
    output.write(warnMsg(`  No PRD found at ${relPath(prdPath)} — design will use description only.\n`));
  }

  // ── Load design system (tokens + brand) ──
  let designTokens: DesignTokensSpec | undefined;
  let brandSpec: BrandSpec | undefined;

  const tokensResult = loadDesignTokens(projectRoot, realFs);
  if (tokensResult.ok) {
    designTokens = tokensResult.value;
    output.write(infoMsg(`  Design tokens loaded from ${relPath(join(projectRoot, 'agentforge/spec/design-tokens.yaml'))}\n`));
  }

  const brandResult = loadBrandSpec(projectRoot, realFs);
  if (brandResult.ok) {
    brandSpec = brandResult.value;
    output.write(infoMsg(`  Brand spec loaded from ${relPath(join(projectRoot, 'agentforge/spec/brand.yaml'))}\n`));
  }

  const catalogResult = loadComponentCatalog(projectRoot, realFs);
  const componentCatalog = catalogResult.ok ? catalogResult.value : undefined;
  if (componentCatalog) {
    output.write(infoMsg('  Component catalog loaded\n'));
  }

  if (!designTokens && !brandSpec) {
    output.write(warnMsg('  No design system found — using defaults.\n'));
    output.write(warnMsg('  Run `agentforge design:system` first for brand-accurate designs.\n'));
  }

  // Validate Claude auth (skip when --mock since no real LLM calls are made)
  const providerConfig = options.mock ? null : requireClaudeAuth(output);
  if (!providerConfig && !options.mock) {
    process.exitCode = 1;
    return;
  }

  /** Create provider — mock or real depending on --mock flag. */
  const makeProvider = (): LLMProvider => {
    if (options.mock) {
      debugLog('designPageCommand: --mock flag set → using createMockLLMProvider (no LLM API calls)');
      return createMockLLMProvider();
    }
    return createClaudeProvider(resolveCLIModel(), providerConfig!);
  };

  // -- Penpot connection --
  // Defer connection unless legacy correction or explicit Penpot export is requested
  const needsPenpotEarly = !!(options.penpotCorrection || options.designspecV1);
  let mcpClient: MCPClient;
  let disconnectFn: (() => void) | undefined;

  if (needsPenpotEarly) {
    const connectionResult = await ensureDesignToolConnection('penpot', output, { mock: options.mock });
    if (!connectionResult) {
      return;
    }
    mcpClient = connectionResult.mcpClient;
    disconnectFn = connectionResult.disconnectFn;
  } else {
    // Use a mock client for the pipeline — Penpot is optional
    mcpClient = createNoOpMCPClient();
    output.write(infoMsg('  Penpot connection deferred (browser correction is primary)\n'));
  }

  try {

  // -- Stage 1: Research --
  let researchOutput: UXResearchOutput;
  const forceFresh = options.fresh ?? false;

  if (skipToStage === 'planning' || skipToStage === 'design' || skipToStage === 'replay' || skipToStage === 'replay-browser' || skipToStage === 'connect') {
    const cached = loadArtifact<UXResearchOutput>(outputDir, PIPELINE_ARTIFACTS.researchBrief);
    if (!cached) {
      output.write(errorMsg(`No cached research output found at ${outputDir}/${PIPELINE_ARTIFACTS.researchBrief}\n`));
      process.exitCode = 1;
      return;
    }
    researchOutput = cached;
    output.write(infoMsg('  [1/3] Research -- loaded from cache\n'));
  } else {
    // Auto-reuse cached research if available (unless --fresh)
    const cachedResearch = !forceFresh ? loadArtifact<UXResearchOutput>(outputDir, PIPELINE_ARTIFACTS.researchBrief) : null;
    if (cachedResearch) {
      researchOutput = cachedResearch;
      output.write(infoMsg('\n  [1/3] Research -- reusing cached results (use --fresh to redo)\n'));
    } else {
      output.write(infoMsg('\n  [1/3] Research -- analyzing requirements...\n'));
      if (options.mock) output.write(infoMsg('  [mock] Using saved LLM output for research\n'));
      const provider = makeProvider();
      const context = createPipelineContext(taskId, undefined, promptTraces, baseDir);

      const prdRequirements: string[] = [description];
      if (prdContent) {
        prdRequirements.push(prdContent);
      }

      const input: UXResearchInput = {
        moduleId,
        taskId,
        prdRequirements,
        ...(designTokens ? { designTokensSpec: designTokens } : {}),
        ...(pageContext ? { pageContext } : {}),
      };

      const t0 = Date.now();
      const result = await uxResearchWork(input, provider as unknown as LLMProviderRef, [], context);
      const ms = Date.now() - t0;

      if (!result.ok) {
        output.write(errorMsg(`Research failed: ${result.error.message}\n`));
        process.exitCode = 1;
        return;
      }

      researchOutput = result.value;
      saveArtifact(outputDir, PIPELINE_ARTIFACTS.researchBrief, researchOutput);
      for (const trace of promptTraces) {
        saveTextArtifact(outputDir, `${trace.stage}-prompt.md`, formatPromptTrace(trace));
      }
      output.write(successMsg(`  Research complete (${(ms / 1000).toFixed(1)}s)\n`));
    }
  }

  // -- Stage 2: Planning --
  let planningOutput: UXPlanningOutput;

  if (skipToStage === 'design' || skipToStage === 'replay' || skipToStage === 'replay-browser' || skipToStage === 'connect') {
    const cached = loadArtifact<UXPlanningOutput>(outputDir, PIPELINE_ARTIFACTS.planningSpec);
    if (!cached) {
      output.write(errorMsg(`No cached planning output found at ${outputDir}/${PIPELINE_ARTIFACTS.planningSpec}\n`));
      process.exitCode = 1;
      return;
    }
    planningOutput = cached;
    output.write(infoMsg('  [2/3] Planning -- loaded from cache\n'));
  } else {
    // Auto-reuse cached planning if available (unless --fresh)
    const cachedPlanning = !forceFresh ? loadArtifact<UXPlanningOutput>(outputDir, PIPELINE_ARTIFACTS.planningSpec) : null;
    if (cachedPlanning) {
      planningOutput = cachedPlanning;
      output.write(infoMsg('\n  [2/3] Planning -- reusing cached results (use --fresh to redo)\n'));
    } else {
      output.write(infoMsg('\n  [2/3] Planning -- building component spec...\n'));
      if (options.mock) output.write(infoMsg('  [mock] Using saved LLM output for planning\n'));
      const provider = makeProvider();
      const context = createPipelineContext(taskId, undefined, promptTraces, baseDir);

      const input: UXPlanningInput = {
        briefId: researchOutput.briefId,
        moduleId,
        taskId,
        designBrief: researchOutput,
        ...(designConfig ? { designConfig } : {}),
        ...(pageContext ? { pageContext } : {}),
      };

      const t0 = Date.now();
      const result = await uxPlanningWork(input, provider as unknown as LLMProviderRef, [], context);
      const ms = Date.now() - t0;

      if (!result.ok) {
        output.write(errorMsg(`Planning failed: ${result.error.message}\n`));
        process.exitCode = 1;
        return;
      }

      planningOutput = result.value;
      saveArtifact(outputDir, PIPELINE_ARTIFACTS.planningSpec, planningOutput);
      for (const trace of promptTraces) {
        saveTextArtifact(outputDir, `${trace.stage}-prompt.md`, formatPromptTrace(trace));
      }
      output.write(successMsg(`  Planning complete (${(ms / 1000).toFixed(1)}s)\n`));
    }
  }

  // -- Stage: connect (test connection only) --
  if (skipToStage === 'connect') {
    const cached = loadArtifact<PenpotDesignOutput>(outputDir, PIPELINE_ARTIFACTS.penpotDesign);
    if (!cached) {
      output.write(errorMsg(`No cached design output found at ${outputDir}/${PIPELINE_ARTIFACTS.penpotDesign}\n`));
      process.exitCode = 1;
      return;
    }
    output.write(infoMsg('  [3/3] Design -- loaded from cache\n'));
    output.write('\n');
    output.write(infoMsg('='.repeat(60) + '\n'));
    output.write(infoMsg('  CONNECTION TEST COMPLETE\n'));
    output.write(infoMsg('='.repeat(60) + '\n'));
    output.write(infoMsg(`  Module: ${moduleId}\n`));
    output.write(infoMsg(`  Components: ${Object.keys(cached.penpotNodeIds ?? {}).length}\n`));
    output.write(infoMsg(`  Project: ${cached.penpotProjectId ?? 'N/A'}\n`));
    output.write(infoMsg('='.repeat(60) + '\n'));
    return;
  }

  // -- Stage: replay (re-execute cached script — requires Penpot) --
  if (skipToStage === 'replay') {
    if (!needsPenpotEarly) {
      // Need Penpot for replay
      const connectionResult = await ensureDesignToolConnection('penpot', output, { mock: options.mock });
      if (!connectionResult) {
        return;
      }
      mcpClient = connectionResult.mcpClient;
      disconnectFn = connectionResult.disconnectFn;
    }
    const cached = loadArtifact<PenpotDesignOutput>(outputDir, PIPELINE_ARTIFACTS.penpotDesign);
    if (!cached?.script) {
      output.write(errorMsg(`No cached design script found in ${outputDir}/${PIPELINE_ARTIFACTS.penpotDesign}\n`));
      output.write(errorMsg('Run a full design first (without --stage) to generate a script.\n'));
      process.exitCode = 1;
      disconnectFn?.();
      return;
    }

    output.write(infoMsg('\n  [3/3] Design -- replaying cached script into Penpot...\n'));
    const t0 = Date.now();

    // Guard: penpot.createText("") returns undefined — patch it to use a space
    const createTextGuard = `
var _origCreateText = penpot.createText.bind(penpot);
penpot.createText = function(content) {
  return _origCreateText(String(content) || ' ');
};
`;
    const wrappedScript = `
try {
  ${createTextGuard}
  ${cached.script}
} catch (e) {
  return { __error: true, message: e.message || String(e), stack: e.stack };
}
`;
    const toolResult = await mcpClient.callTool('penpot', 'execute_code', { code: wrappedScript });
    const ms = Date.now() - t0;

    if (!toolResult.ok) {
      output.write(errorMsg(`Replay failed: ${toolResult.error.message}\n`));
      process.exitCode = 1;
      return;
    }

    // Parse result for node IDs
    const content = toolResult.value as { content?: Array<{ text?: string }> };
    const text = Array.isArray(content.content)
      ? content.content.map(c => c.text ?? '').join('')
      : '';
    let replayNodeIds: Record<string, string> = {};

    try {
      const parsed = JSON.parse(text) as { result?: Record<string, unknown> };
      if (parsed.result?.__error) {
        output.write(errorMsg(`Replay script error: ${String(parsed.result.message)}\n`));
        process.exitCode = 1;
        return;
      }
      const nodeIds = parsed.result?.nodeIds as Record<string, string> | undefined;
      if (nodeIds) {
        replayNodeIds = nodeIds;
      }
    } catch {
      // Non-JSON is acceptable for replay
    }

    // Save updated artifact
    const updatedOutput: PenpotDesignOutput = {
      ...cached,
      penpotNodeIds: Object.keys(replayNodeIds).length > 0 ? replayNodeIds : (cached.penpotNodeIds ?? {}),
    };
    const artifactPath = saveArtifact(outputDir, PIPELINE_ARTIFACTS.penpotDesign, updatedOutput);

    output.write(successMsg(`  Replay complete (${(ms / 1000).toFixed(1)}s)\n`));
    output.write('\n');
    output.write(infoMsg('='.repeat(60) + '\n'));
    output.write(infoMsg('  REPLAY COMPLETE\n'));
    output.write(infoMsg('='.repeat(60) + '\n'));
    output.write(infoMsg(`  Module: ${moduleId}\n`));
    output.write(infoMsg(`  Components: ${Object.keys(updatedOutput.penpotNodeIds ?? {}).length}\n`));
    output.write(infoMsg(`  Artifact: ${artifactPath}\n`));
    output.write(infoMsg('='.repeat(60) + '\n'));
    return;
  }

  // -- Stage: replay-browser (re-render cached designSpec in browser — no Penpot, no LLM) --
  if (skipToStage === 'replay-browser') {
    const specPath = join(outputDir, PIPELINE_ARTIFACTS.designSpecV2);
    if (!existsSync(specPath)) {
      output.write(errorMsg(`No cached DesignSpec found at ${relPath(specPath)}\n`));
      output.write(errorMsg('Run the full pipeline first (V2 renderer is default) to generate a DesignSpec.\n'));
      process.exitCode = 1;
      return;
    }

    const designSpec = JSON.parse(readFileSync(specPath, 'utf-8')) as import('@agentforge/designspec-renderer').DesignSpecV2;
    output.write(infoMsg(`  DesignSpec loaded from ${relPath(specPath)}\n`));

    if (!designTokens) {
      output.write(errorMsg('Design tokens required for browser replay. Run `agentforge init` first.\n'));
      process.exitCode = 1;
      return;
    }

    const replayRendererTokens = toRendererTokens(designTokens);
    const replayCatalogMap = loadCatalogForRenderer(
      componentCatalog as import('@agentforge/designspec-renderer').RawCatalogSpec | undefined,
      replayRendererTokens,
    );

    const replayViewportWidth = resolveViewports({
      cliWidth: options.width,
      designConfig,
      pageViewports: resolvedPage?.viewports as number[] | undefined,
    })[0];

    const isInteractive = options.interactive === true ||
      (options.interactive === undefined && 'isTTY' in process.stdin && (process.stdin as NodeJS.ReadStream).isTTY);

    if (isInteractive) {
      output.write(infoMsg('\n  [3/3] Design -- opening interactive browser preview...\n'));
      try {
        const preview = await openInteractivePreview(designSpec, replayRendererTokens, replayCatalogMap);
        output.write(infoMsg(`  Preview: http://localhost:${preview.port}/index.html\n`));
        output.write(infoMsg('  Click elements to tag feedback, then "Submit" or "Approve & Close".\n'));

        const feedback = await preview.waitForFeedback();
        await preview.close();

        if (feedback.approved) {
          output.write(successMsg('  Design approved.\n'));
        } else {
          output.write(infoMsg(`  Received ${feedback.tags.length} feedback tag(s).\n`));
        }
      } catch (err) {
        output.write(errorMsg(`Browser preview failed: ${err instanceof Error ? err.message : String(err)}\n`));
        output.write(errorMsg('Ensure Playwright is installed: npx playwright install chromium\n'));
        process.exitCode = 1;
        return;
      }
    } else {
      output.write(infoMsg('\n  [3/3] Design -- replaying designSpec in browser...\n'));
      try {
        const t0 = Date.now();
        const { session, initial } = await openBrowserSession(
          designSpec,
          replayRendererTokens,
          replayCatalogMap,
          { width: replayViewportWidth },
        );
        const ms = Date.now() - t0;

        const screenshotDir = join(outputDir, 'screenshots', 'browser');
        if (!existsSync(screenshotDir)) {
          mkdirSync(screenshotDir, { recursive: true });
        }
        const screenshotPath = join(screenshotDir, 'root.png');
        writeFileSync(screenshotPath, initial.screenshot);

        const htmlPath = join(outputDir, 'replay-browser.html');
        writeFileSync(htmlPath, initial.html);

        await session.close();

        output.write(successMsg(`  Browser replay complete (${(ms / 1000).toFixed(1)}s)\n`));
        output.write('\n');
        output.write(infoMsg('='.repeat(60) + '\n'));
        output.write(infoMsg('  BROWSER REPLAY COMPLETE\n'));
        output.write(infoMsg('='.repeat(60) + '\n'));
        output.write(infoMsg(`  Module: ${moduleId}\n`));
        output.write(infoMsg(`  Nodes: ${Object.keys(designSpec.nodes).length}\n`));
        output.write(infoMsg(`  Screenshot: ${relPath(screenshotPath)}\n`));
        output.write(infoMsg(`  HTML: ${relPath(htmlPath)}\n`));
        output.write(infoMsg('='.repeat(60) + '\n'));
      } catch (err) {
        output.write(errorMsg(`Browser session failed: ${err instanceof Error ? err.message : String(err)}\n`));
        output.write(errorMsg('Ensure Playwright is installed: npx playwright install chromium\n'));
        process.exitCode = 1;
        return;
      }
    }
    return;
  }

  // -- Stage 3: Design (Penpot) --
  output.write(infoMsg('\n  [3/3] Design -- creating Penpot components...\n'));
  if (options.mock) output.write(infoMsg('  [mock] Using saved LLM output for design\n'));

  const provider = makeProvider();

  // Build project-specific design system prompt from tokens + brand
  let projectDesignSystemPrompt: string | undefined;
  if (designTokens && brandSpec) {
    const dsCtx = buildDesignSystemContextFromSpec(designTokens, brandSpec, planningOutput);
    projectDesignSystemPrompt = dsCtx.designSystemPrompt;
  }

  const componentCatalogPrompt = buildComponentCatalogPrompt(componentCatalog);

  // V2 renderer is the default; opt out with --designspec-v1
  const useV2 = options.designspecV1 !== true;
  let rendererTokens: RendererTokens | undefined;
  let catalogMapV2: import('@agentforge/designspec-renderer').CatalogMap | undefined;

  if (useV2) {
    if (designTokens) {
      rendererTokens = toRendererTokens(designTokens);
    } else {
      output.write(errorMsg('V2 renderer requires design tokens. Run `agentforge init` first.\n'));
      process.exitCode = 1;
      return;
    }
    catalogMapV2 = loadCatalogForRenderer(
      componentCatalog as import('@agentforge/designspec-renderer').RawCatalogSpec | undefined,
      rendererTokens,
    );
    output.write(infoMsg(`  Renderer tokens + catalog map loaded (${Object.keys(catalogMapV2).length} catalog entries)\n`));
  } else {
    output.write(infoMsg('  [v1] Using legacy LLM-based script generation (pass no flags for default V2 renderer)\n'));
  }

  // Use page viewports if available and no CLI override
  const effectiveViewportWidth = resolveViewports({
    cliWidth: options.width,
    designConfig,
    pageViewports: resolvedPage?.viewports as number[] | undefined,
  })[0];

  // Build browser correction options
  const browserCorrectionOpts: BrowserCorrectionOptions = {
    width: effectiveViewportWidth,
    ...(options.interactive !== undefined ? { interactive: options.interactive } : {}),
    outputDir: join(ensureOutputDir(moduleId, baseDir), PIPELINE_ARTIFACTS.corrections),
  };

  const penpotInput: PenpotDesignInput = {
    specRef: planningOutput.specRef,
    moduleId,
    taskId,
    planningOutput,
    description,
    ...(projectDesignSystemPrompt ? { designSystemPrompt: projectDesignSystemPrompt } : {}),
    ...(componentCatalogPrompt ? { componentCatalogPrompt } : {}),
    viewportWidth: effectiveViewportWidth,
    ...(useV2 ? {
      useDesignSpecV2: true,
      rendererTokens,
      catalogMap: catalogMapV2,
      // Pass raw catalog (with anatomy) for dynamic renderer generation
      ...(componentCatalog ? { componentCatalogRaw: componentCatalog.components as Readonly<Record<string, import('@agentforge/designspec-renderer').DynamicCatalogSource>> } : {}),
    } : {}),
    ...(pageContext ? { pageContext } : {}),
    browserCorrectionOptions: browserCorrectionOpts,
    ...(options.penpotCorrection ? { legacyPenpotCorrection: true } : {}),
  };

  const t0 = Date.now();
  const result = await penpotDesignWork(penpotInput, provider, mcpClient, { promptTraces });
  const ms = Date.now() - t0;

  if (!result.ok) {
    output.write(errorMsg(`Design failed: ${result.error.message}\n`));
    process.exitCode = 1;
    return;
  }

  const designOutput = result.value;
  const artifactPath = saveArtifact(outputDir, PIPELINE_ARTIFACTS.penpotDesign, designOutput);
  for (const trace of promptTraces) {
    saveTextArtifact(outputDir, `${trace.stage}-prompt.md`, formatPromptTrace(trace));
  }
  savePipelineTrace(outputDir, moduleId, promptTraces);

  output.write(successMsg(`  Design complete (${(ms / 1000).toFixed(1)}s)\n`));
  output.write('\n');
  output.write(infoMsg('='.repeat(60) + '\n'));
  output.write(infoMsg('  PIPELINE COMPLETE\n'));
  output.write(infoMsg('='.repeat(60) + '\n'));
  output.write(infoMsg(`  Module: ${moduleId}\n`));

  // Show browser correction summary if available
  if (designOutput.browserCorrectionResult) {
    const bcr = designOutput.browserCorrectionResult;
    output.write(infoMsg(`  Browser Correction: score=${bcr.finalScore}/100, iterations=${bcr.iterations}, threshold=${bcr.thresholdMet ? 'met' : 'not met'}\n`));
  }

  if (designOutput.penpotNodeIds) {
    output.write(infoMsg(`  Penpot Components: ${Object.keys(designOutput.penpotNodeIds).length}\n`));
  }
  output.write(infoMsg(`  Artifact: ${artifactPath}\n`));

  // Show cost summary if any traces have cost data
  const totalCost = promptTraces.reduce((sum, t) => sum + (t.cost?.totalCostUsd ?? 0), 0);
  if (totalCost > 0) {
    output.write(infoMsg(`  Total LLM Cost: $${totalCost.toFixed(4)}\n`));
  }
  output.write(infoMsg('='.repeat(60) + '\n'));

  // ── "Export to Penpot?" prompt ──
  const shouldExportPenpot = await resolvePenpotExport(options.exportPenpot, output);

  if (shouldExportPenpot && designOutput.designSpec && useV2 && rendererTokens && catalogMapV2) {
    output.write(infoMsg('\n  Exporting design to Penpot...\n'));

    // Connect to Penpot lazily if not already connected
    if (!needsPenpotEarly) {
      const connectionResult = await ensureDesignToolConnection('penpot', output, { mock: options.mock });
      if (!connectionResult) {
        output.write(errorMsg('  Penpot export failed: could not connect to Penpot.\n'));
      } else {
        mcpClient = connectionResult.mcpClient;
        disconnectFn = connectionResult.disconnectFn;
      }
    }

    if (mcpClient && !options.mock) {
      const exportT0 = Date.now();
      const exportResult = await exportDesignSpecToPenpot(
        designOutput.designSpec,
        rendererTokens,
        catalogMapV2,
        mcpClient,
      );
      const exportMs = Date.now() - exportT0;

      if (exportResult.ok) {
        output.write(successMsg(`  Penpot export complete: ${Object.keys(exportResult.value.nodeIds).length} shapes (${(exportMs / 1000).toFixed(1)}s)\n`));
        // Update artifact with Penpot IDs
        const updatedOutput: PenpotDesignOutput = {
          ...designOutput,
          penpotProjectId: `penpot-${moduleId}`,
          penpotPageId: `page-${moduleId}`,
          penpotNodeIds: exportResult.value.nodeIds,
        };
        saveArtifact(outputDir, PIPELINE_ARTIFACTS.penpotDesign, updatedOutput);
      } else {
        output.write(errorMsg(`  Penpot export failed: ${exportResult.error.message}\n`));
      }
    }
  } else if (shouldExportPenpot && !designOutput.designSpec) {
    output.write(warnMsg('  Cannot export to Penpot: no DesignSpec available (V1 pipeline).\n'));
  }

  // ── --evaluate flag: non-interactive CI/CD evaluation ──
  if (options.evaluate) {
    const threshold = options.evaluateThreshold ?? 75;
    output.write(infoMsg('\n  [evaluate] Running design evaluation...\n'));

    // Use browser correction screenshot if available, otherwise fall back to Penpot export
    let base64: string | undefined;

    if (designOutput.browserCorrectionResult) {
      base64 = designOutput.browserCorrectionResult.screenshot.toString('base64');
    } else if (designOutput.penpotNodeIds && mcpClient) {
      const rootShapeId = Object.values(designOutput.penpotNodeIds)[0] ?? '';
      const exportCode = `
        const shape = penpot.currentPage?.getShapeById('${rootShapeId}');
        if (!shape) return { error: 'Root shape not found' };
        const data = await shape.export({ type: 'png', scale: 2 });
        const bytes = new Uint8Array(data);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return { base64: btoa(binary) };
      `;
      const exportResult = await mcpClient.callTool('penpot', 'execute_code', { code: exportCode });

      if (exportResult.ok) {
        const rawValue = exportResult.value as { content?: Array<{ text?: string }> } | string;
        const exportText = typeof rawValue === 'string'
          ? rawValue
          : Array.isArray((rawValue as { content?: Array<{ text?: string }> }).content)
            ? (rawValue as { content: Array<{ text?: string }> }).content.map(c => c.text ?? '').join('')
            : '';
        let parsed: Record<string, unknown> | undefined;
        try {
          const outer = JSON.parse(exportText) as { result?: Record<string, unknown> };
          parsed = outer.result ?? (outer as unknown as Record<string, unknown>);
        } catch {
          try { parsed = JSON.parse(exportText) as Record<string, unknown>; } catch { /* ignore */ }
        }
        base64 = parsed?.base64 as string | undefined;
      } else {
        output.write(errorMsg(`  Evaluation failed: screenshot export error: ${exportResult.error.message}\n`));
        process.exitCode = 1;
        return;
      }
    }

    if (base64) {
      const planningSpec = JSON.stringify(planningOutput, null, 2);
      const evalResult = await evaluateDesign(base64, planningSpec, provider as LLMProvider);
      if (evalResult.ok) {
        const { score, overallQuality, issues } = evalResult.value;
        output.write(infoMsg(`  Score: ${score}/100 (${overallQuality})\n`));
        if (issues.length > 0) {
          for (const issue of issues) {
            output.write(warnMsg(`  [${issue.severity}] ${issue.component}: ${issue.description}\n`));
          }
        }
        if (score < threshold) {
          output.write(errorMsg(`  FAIL: Score ${score} is below threshold ${threshold}\n`));
          process.exitCode = 1;
        } else {
          output.write(successMsg(`  PASS: Score ${score} meets threshold ${threshold}\n`));
        }
      } else {
        output.write(errorMsg(`  Evaluation failed: ${evalResult.error.message}\n`));
        process.exitCode = 1;
      }
    } else {
      output.write(errorMsg('  Evaluation failed: could not capture screenshot (no base64 data)\n'));
      process.exitCode = 1;
    }
    return; // Skip feedback loop and implement — evaluate is terminal
  }

  // ── Build implement callback ──
  const createImplementFn = (): ImplementCallback => {
    return async (design) => {
      const implProvider = makeProvider();
      const implContext = createPipelineContext(`${taskId}_impl`, mcpClient, undefined, baseDir);

      const implInput: UXImplementationInput = {
        specRef: planningOutput.specRef,
        moduleId,
        taskId: `${taskId}_impl`,
        componentSpec: planningOutput,
        stage: 'layout',
        designSnapshot: design.screenshotPath || design.componentSnapshots
          ? { screenshotPath: design.screenshotPath, componentSnapshots: design.componentSnapshots }
          : undefined,
        designNodeIds: (design as Record<string, unknown>).penpotNodeIds as Readonly<Record<string, string>> | undefined,
        designFileId: (design as Record<string, unknown>).penpotProjectId as string | undefined,
      };

      const implResult = await uxImplementationWork(
        implInput,
        implProvider as unknown as LLMProviderRef,
        [],
        implContext,
      );

      if (!implResult.ok) {
        return implResult as import('@agentforge/core').Result<never>;
      }

      const targetDir = baseDir;
      const writtenPaths = writeImplementationFiles(implResult.value.files, targetDir);

      return Ok({ files: implResult.value.files, writtenPaths });
    };
  };

  // ── --implement flag: skip feedback loop, go straight to code gen ──
  if (options.implement) {
    output.write(infoMsg('\n  [implement] Generating code from design...\n'));
    const mappedDesign = mapPenpotToDesignOutput(designOutput);
    const implementFn = createImplementFn();
    const implResult = await implementFn(mappedDesign);
    if (implResult.ok) {
      output.write(successMsg(`  Generated ${implResult.value.files.length} file(s):\n`));
      for (const p of implResult.value.writtenPaths) {
        output.write(infoMsg(`    ${p}\n`));
      }

      // ── Post-implementation verification ──
      output.write(infoMsg('\n  [verify] Starting post-implementation verification...\n'));
      await verifyImplementation({
        projectRoot: baseDir,
        moduleId,
        output,
        provider: provider as unknown as {
          complete: (
            prompt: { system: string; messages: { role: 'user'; content: string }[] },
            opts: { model: string; maxTokens: number; temperature: number },
          ) => Promise<import('@agentforge/core').Result<{ content: string }>>;
        },
      });
    } else {
      output.write(errorMsg(`  Implementation failed: ${implResult.error.message}\n`));
    }
  }

  // ── Interactive feedback loop (only when Penpot is connected) ──
  const isTTY = 'isTTY' in process.stdin && (process.stdin as NodeJS.ReadStream).isTTY;
  const hasPenpotConnection = needsPenpotEarly && mcpClient && !options.mock;
  if (!options.noWait && !options.implement && isTTY && hasPenpotConnection && designOutput.penpotNodeIds) {
    // Discover Penpot API docs for the collaboration session
    const apiDocs = await discoverPenpotAPI(mcpClient);

    // Build design system context
    const designSystemCtx = designTokens && brandSpec
      ? buildDesignSystemContextFromSpec(designTokens, brandSpec, planningOutput)
      : {
          designSystemPrompt: projectDesignSystemPrompt ?? '',
          colorPalette: [],
          shadeScales: {},
          componentTree: planningOutput.componentTree ?? [],
          tokenBindings: planningOutput.tokenBindings ?? {},
          typographyScale: [],
          spacingScale: [],
        };

    const session = createPenpotCollaborationSession(
      mcpClient,
      provider as unknown as { complete: (prompt: { system: string; messages: { role: 'user' | 'assistant'; content: string }[] }, opts: { model: string; maxTokens: number; temperature: number }) => Promise<import('@agentforge/core').Result<{ content: string }>> },
      designOutput,
      designSystemCtx,
      apiDocs,
    );

    // Create review callback using root shape ID
    const rootShapeId = Object.values(designOutput.penpotNodeIds)[0] ?? '';
    const planningSpec = JSON.stringify(planningOutput, null, 2);
    const reviewFn = createPenpotReviewCallback(
      provider as unknown as { complete: (prompt: { system: string; messages: { role: 'user' | 'assistant'; content: string }[] }, opts: { model: string; maxTokens: number; temperature: number }) => Promise<import('@agentforge/core').Result<{ content: string }>> },
      planningSpec,
      mcpClient,
      rootShapeId,
    );

    const implementFn = createImplementFn();
    const mappedDesign = mapPenpotToDesignOutput(designOutput);

    const loopResult = await runDesignFeedbackLoop({
      session,
      initialDesign: mappedDesign,
      input: process.stdin,
      output,
      reviewFn,
      implementFn,
      designTool: 'Penpot',
    });

    if (loopResult.changeCount > 0) {
      saveArtifact(outputDir, PIPELINE_ARTIFACTS.penpotDesign, designOutput);
      output.write(infoMsg(`  Updated artifact with ${loopResult.changeCount} change(s).\n`));
    }

    if (loopResult.approved) {
      output.write(successMsg('  Design approved.\n'));
    } else {
      output.write(warnMsg('  Design not approved.\n'));
    }
  }

  } finally {
    disconnectFn?.();
  }
}
