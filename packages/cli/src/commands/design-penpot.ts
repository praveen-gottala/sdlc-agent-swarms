/**
 * @module @agentforge/cli/commands/design-penpot
 *
 * The `agentforge design:penpot <description>` command.
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
import { successMsg, errorMsg, infoMsg, warnMsg } from '../formatter.js';
import { findProjectRoot, loadDotEnv } from '../fs-utils.js';
import { verifyImplementation } from './impl-verify.js';
import { ensureDesignToolConnection, createMockMCPClient } from './design-preflight.js';
import {
  Ok,
  Err,
  createEventBus,
  createRealFs,
  loadDesignTokens,
  loadBrandSpec,
  loadComponentCatalog,
  loadProjectManifest,
  resolveViewports,
  readSpecs,
  PREVIEW_DIR_REL,
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
import type { LLMProvider } from '@agentforge/providers';
import { createMockLLMProvider } from '../mock-llm-outputs/index.js';
import {
  uxResearchWork,
  uxPlanningWork,
  penpotDesignWork,
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
import { loadCatalogForRenderer } from '@agentforge/designspec-renderer';

// ============================================================================
// Types
// ============================================================================

interface DesignPenpotOptions {
  /**
   * Skip to a specific stage (loads prior stages from artifacts).
   * - 'replay': re-execute cached design script (no LLM calls)
   * - 'connect': test connection only, load design from cache
   */
  readonly stage?: 'research' | 'planning' | 'design' | 'replay' | 'connect';
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
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert core DesignTokensSpec to the renderer's RendererTokens subset.
 * Explicitly maps only the 5 required fields — avoids carrying extra
 * fields (version, created_by, touch_targets, layout, z_index, components).
 */
function toRendererTokens(spec: DesignTokensSpec): RendererTokens {
  return {
    colors: {
      primitive: spec.colors.primitive,
      semantic: spec.colors.semantic,
    },
    typography: {
      font_families: spec.typography.font_families,
      scale: spec.typography.scale,
    },
    elevation: { levels: spec.elevation.levels },
    borders: { radius: spec.borders.radius },
    spacing: { unit: spec.spacing.unit, scale: spec.spacing.scale },
  };
}

/** Derive a kebab-case module ID from a description. */
function deriveModuleId(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/-$/, '');
}

/** Create an agent context. */
const createContext = (taskId: string, mcpClient: MCPClient, promptTraces?: PromptTrace[], baseDir?: string) => {
  if (!baseDir) {
    debugLog('createContext: baseDir not provided → default: process.cwd()');
  }
  return {
    taskId,
    projectRoot: baseDir ?? process.cwd(),
    eventBus: createEventBus(),
    fs: createRealFs(),
    mcpClient,
    runGovernance: async () => Ok({ status: 'proceed' as const }),
    resolveProvider: () => Err({ code: 'MCP_UNAVAILABLE' as const, message: 'not used', recoverable: false }),
    recordAudit: () => {},
    promptTraces,
  };
};

/** Ensure output directory exists and return path. */
const ensureOutputDir = (moduleId: string, baseDir: string): string => {
  const dir = resolve(baseDir, PREVIEW_DIR_REL, moduleId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
};

/** Save a JSON artifact. */
const saveArtifact = (dir: string, filename: string, data: unknown): string => {
  const filePath = join(dir, filename);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
};

/** Save a text artifact (e.g. markdown prompt traces). */
const saveTextArtifact = (dir: string, filename: string, text: string): string => {
  const filePath = join(dir, filename);
  writeFileSync(filePath, text);
  return filePath;
};

/** Format a prompt trace as a markdown document. */
function formatPromptTrace(trace: PromptTrace): string {
  const lines = [
    `# Prompt: ${trace.stage}`,
    ``,
    `**Timestamp**: ${trace.timestamp}  `,
    `**Model**: ${trace.model}  `,
    `**Max Tokens**: ${trace.maxTokens}`,
  ];

  // Add response metadata if available
  if (trace.latencyMs !== undefined) {
    lines.push(`**Latency**: ${(trace.latencyMs / 1000).toFixed(1)}s`);
  }
  if (trace.finishReason) {
    lines.push(`**Finish Reason**: ${trace.finishReason}`);
  }
  if (trace.usage) {
    lines.push(`**Input Tokens**: ${trace.usage.inputTokens}  `);
    lines.push(`**Output Tokens**: ${trace.usage.outputTokens}`);
    if (trace.usage.cacheReadTokens) {
      lines.push(`**Cache Read Tokens**: ${trace.usage.cacheReadTokens}`);
    }
    if (trace.usage.cacheWriteTokens) {
      lines.push(`**Cache Write Tokens**: ${trace.usage.cacheWriteTokens}`);
    }
  }
  if (trace.cost) {
    lines.push(`**Cost**: $${trace.cost.totalCostUsd.toFixed(4)} (input: $${trace.cost.inputCostUsd.toFixed(4)}, output: $${trace.cost.outputCostUsd.toFixed(4)})`);
  }
  if (trace.hasVisionInput) {
    lines.push(`**Vision Input**: yes`);
  }

  lines.push(``, `---`, ``, `## System Prompt`, ``, trace.system, ``, `---`, ``, `## User Message`, ``, trace.userMessage);

  // Add response sections if available
  if (trace.responseContent) {
    lines.push(``, `---`, ``, `## LLM Response`, ``, trace.responseContent);
  }
  if (trace.responseToolCalls && trace.responseToolCalls.length > 0) {
    lines.push(``, `---`, ``, `## Tool Calls`, ``);
    for (const tc of trace.responseToolCalls) {
      lines.push(`### ${tc.name}`, ``, '```json', JSON.stringify(tc.args, null, 2), '```', ``);
    }
  }
  if (trace.responseStructured) {
    lines.push(``, `---`, ``, `## Structured Output`, ``, '```json', JSON.stringify(trace.responseStructured, null, 2), '```');
  }

  return lines.join('\n');
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

/** Load a JSON artifact. */
const loadArtifact = <T>(dir: string, filename: string): T | null => {
  const filePath = join(dir, filename);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
};

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
export async function designPenpotCommand(
  pageIdOrDescription: string,
  output: NodeJS.WritableStream = process.stdout,
  options: DesignPenpotOptions = {},
): Promise<void> {
  const taskId = `task_design_penpot_${Date.now()}`;
  const skipToStage = options.stage;
  const baseDir = options.projectDir ? resolve(process.cwd(), options.projectDir) : process.cwd();
  logDefaults('designPenpotCommand', {
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
    debugLog(`designPenpotCommand: moduleId not provided → derived from description: "${moduleId}"`);
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

  // Validate API key (skip when --mock since no real LLM calls are made)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !options.mock) {
    output.write(errorMsg('ANTHROPIC_API_KEY must be set\n'));
    process.exitCode = 1;
    return;
  }

  /** Create provider — mock or real depending on --mock flag. */
  const makeProvider = (): LLMProvider => {
    if (options.mock) {
      debugLog('designPenpotCommand: --mock flag set → using createMockLLMProvider (no LLM API calls)');
      return createMockLLMProvider();
    }
    return createClaudeProvider(resolveCLIModel(), { apiKey: apiKey! });
  };

  // -- Penpot connection (early check — before any LLM work) --
  const connectionResult = await ensureDesignToolConnection('penpot', output, { mock: options.mock });
  if (!connectionResult) {
    return;
  }
  const { mcpClient, disconnectFn } = connectionResult;

  try {

  // -- Stage 1: Research --
  let researchOutput: UXResearchOutput;
  const forceFresh = options.fresh ?? false;

  if (skipToStage === 'planning' || skipToStage === 'design' || skipToStage === 'replay' || skipToStage === 'connect') {
    const cached = loadArtifact<UXResearchOutput>(outputDir, 'research-brief.json');
    if (!cached) {
      output.write(errorMsg(`No cached research output found at ${outputDir}/research-brief.json\n`));
      process.exitCode = 1;
      return;
    }
    researchOutput = cached;
    output.write(infoMsg('  [1/3] Research -- loaded from cache\n'));
  } else {
    // Auto-reuse cached research if available (unless --fresh)
    const cachedResearch = !forceFresh ? loadArtifact<UXResearchOutput>(outputDir, 'research-brief.json') : null;
    if (cachedResearch) {
      researchOutput = cachedResearch;
      output.write(infoMsg('\n  [1/3] Research -- reusing cached results (use --fresh to redo)\n'));
    } else {
      output.write(infoMsg('\n  [1/3] Research -- analyzing requirements...\n'));
      if (options.mock) output.write(infoMsg('  [mock] Using saved LLM output for research\n'));
      const provider = makeProvider();
      const context = createContext(taskId, createMockMCPClient(), promptTraces, baseDir);

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
      saveArtifact(outputDir, 'research-brief.json', researchOutput);
      for (const trace of promptTraces) {
        saveTextArtifact(outputDir, `${trace.stage}-prompt.md`, formatPromptTrace(trace));
      }
      output.write(successMsg(`  Research complete (${(ms / 1000).toFixed(1)}s)\n`));
    }
  }

  // -- Stage 2: Planning --
  let planningOutput: UXPlanningOutput;

  if (skipToStage === 'design' || skipToStage === 'replay' || skipToStage === 'connect') {
    const cached = loadArtifact<UXPlanningOutput>(outputDir, 'planning-spec.json');
    if (!cached) {
      output.write(errorMsg(`No cached planning output found at ${outputDir}/planning-spec.json\n`));
      process.exitCode = 1;
      return;
    }
    planningOutput = cached;
    output.write(infoMsg('  [2/3] Planning -- loaded from cache\n'));
  } else {
    // Auto-reuse cached planning if available (unless --fresh)
    const cachedPlanning = !forceFresh ? loadArtifact<UXPlanningOutput>(outputDir, 'planning-spec.json') : null;
    if (cachedPlanning) {
      planningOutput = cachedPlanning;
      output.write(infoMsg('\n  [2/3] Planning -- reusing cached results (use --fresh to redo)\n'));
    } else {
      output.write(infoMsg('\n  [2/3] Planning -- building component spec...\n'));
      if (options.mock) output.write(infoMsg('  [mock] Using saved LLM output for planning\n'));
      const provider = makeProvider();
      const context = createContext(taskId, createMockMCPClient(), promptTraces, baseDir);

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
      saveArtifact(outputDir, 'planning-spec.json', planningOutput);
      for (const trace of promptTraces) {
        saveTextArtifact(outputDir, `${trace.stage}-prompt.md`, formatPromptTrace(trace));
      }
      output.write(successMsg(`  Planning complete (${(ms / 1000).toFixed(1)}s)\n`));
    }
  }

  // -- Stage: connect (test connection only) --
  if (skipToStage === 'connect') {
    const cached = loadArtifact<PenpotDesignOutput>(outputDir, 'penpot-design.json');
    if (!cached) {
      output.write(errorMsg(`No cached design output found at ${outputDir}/penpot-design.json\n`));
      process.exitCode = 1;
      return;
    }
    output.write(infoMsg('  [3/3] Design -- loaded from cache\n'));
    output.write('\n');
    output.write(infoMsg('='.repeat(60) + '\n'));
    output.write(infoMsg('  CONNECTION TEST COMPLETE\n'));
    output.write(infoMsg('='.repeat(60) + '\n'));
    output.write(infoMsg(`  Module: ${moduleId}\n`));
    output.write(infoMsg(`  Components: ${Object.keys(cached.penpotNodeIds).length}\n`));
    output.write(infoMsg(`  Project: ${cached.penpotProjectId}\n`));
    output.write(infoMsg('='.repeat(60) + '\n'));
    return;
  }

  // -- Stage: replay (re-execute cached script) --
  if (skipToStage === 'replay') {
    const cached = loadArtifact<PenpotDesignOutput>(outputDir, 'penpot-design.json');
    if (!cached?.script) {
      output.write(errorMsg(`No cached design script found in ${outputDir}/penpot-design.json\n`));
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
      penpotNodeIds: Object.keys(replayNodeIds).length > 0 ? replayNodeIds : cached.penpotNodeIds,
    };
    const artifactPath = saveArtifact(outputDir, 'penpot-design.json', updatedOutput);

    output.write(successMsg(`  Replay complete (${(ms / 1000).toFixed(1)}s)\n`));
    output.write('\n');
    output.write(infoMsg('='.repeat(60) + '\n'));
    output.write(infoMsg('  REPLAY COMPLETE\n'));
    output.write(infoMsg('='.repeat(60) + '\n'));
    output.write(infoMsg(`  Module: ${moduleId}\n`));
    output.write(infoMsg(`  Components: ${Object.keys(updatedOutput.penpotNodeIds).length}\n`));
    output.write(infoMsg(`  Artifact: ${artifactPath}\n`));
    output.write(infoMsg('='.repeat(60) + '\n'));
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

  const penpotInput: PenpotDesignInput = {
    specRef: planningOutput.specRef,
    moduleId,
    taskId,
    planningOutput,
    description,
    ...(projectDesignSystemPrompt ? { designSystemPrompt: projectDesignSystemPrompt } : {}),
    ...(componentCatalogPrompt ? { componentCatalogPrompt } : {}),
    viewportWidth: effectiveViewportWidth,
    ...(useV2 ? { useDesignSpecV2: true, rendererTokens, catalogMap: catalogMapV2 } : {}),
    ...(pageContext ? { pageContext } : {}),
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
  const artifactPath = saveArtifact(outputDir, 'penpot-design.json', designOutput);
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
  output.write(infoMsg(`  Components: ${Object.keys(designOutput.penpotNodeIds).length}\n`));
  output.write(infoMsg(`  Artifact: ${artifactPath}\n`));

  // Show cost summary if any traces have cost data
  const totalCost = promptTraces.reduce((sum, t) => sum + (t.cost?.totalCostUsd ?? 0), 0);
  if (totalCost > 0) {
    output.write(infoMsg(`  Total LLM Cost: $${totalCost.toFixed(4)}\n`));
  }
  output.write(infoMsg('='.repeat(60) + '\n'));

  // ── --evaluate flag: non-interactive CI/CD evaluation ──
  if (options.evaluate) {
    const threshold = options.evaluateThreshold ?? 75;
    output.write(infoMsg('\n  [evaluate] Running design evaluation...\n'));

    // Capture screenshot of root shape
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
        // try raw
        try { parsed = JSON.parse(exportText) as Record<string, unknown>; } catch { /* ignore */ }
      }
      const base64 = parsed?.base64 as string | undefined;
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
    } else {
      output.write(errorMsg(`  Evaluation failed: screenshot export error: ${exportResult.error.message}\n`));
      process.exitCode = 1;
    }
    return; // Skip feedback loop and implement — evaluate is terminal
  }

  // ── Build implement callback ──
  const createImplementFn = (): ImplementCallback => {
    return async (design) => {
      const implProvider = makeProvider();
      const implContext = createContext(`${taskId}_impl`, mcpClient, undefined, baseDir);

      const implInput: UXImplementationInput = {
        specRef: planningOutput.specRef,
        moduleId,
        taskId: `${taskId}_impl`,
        componentSpec: planningOutput,
        stage: 'layout',
        designSnapshot: design.screenshotPath || design.componentSnapshots
          ? { screenshotPath: design.screenshotPath, componentSnapshots: design.componentSnapshots }
          : undefined,
        designNodeIds: design.figmaNodeIds,
        designFileId: design.figmaFileId,
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

  // ── Interactive feedback loop ──
  const isTTY = 'isTTY' in process.stdin && (process.stdin as NodeJS.ReadStream).isTTY;
  if (!options.noWait && !options.implement && isTTY) {
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
      saveArtifact(outputDir, 'penpot-design.json', designOutput);
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
