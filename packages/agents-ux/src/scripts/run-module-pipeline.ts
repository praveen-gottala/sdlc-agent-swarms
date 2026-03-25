/**
 * @module run-module-pipeline
 *
 * Standalone script that runs the first 3 stages of the UX agent pipeline
 * (Research → Planning → Design) and stops for human approval before
 * implementation begins.
 *
 * Supports both Figma and Penpot via the DesignToolAdapter abstraction.
 *
 * Usage:
 *   RUN_E2E_PROOF=true ANTHROPIC_API_KEY=sk-ant-... \
 *   npx tsx packages/agents-ux/src/scripts/run-module-pipeline.ts --module cost-dashboard
 *
 * To resume from a specific stage (loads prior stage outputs from JSON):
 *   npx tsx packages/agents-ux/src/scripts/run-module-pipeline.ts \
 *     --module cost-dashboard --stage design
 *
 * To use Penpot instead of Figma:
 *   npx tsx packages/agents-ux/src/scripts/run-module-pipeline.ts \
 *     --module cost-dashboard --tool penpot
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';

// Load .env from repo root before reading env vars
dotenvConfig({ path: resolve(import.meta.dirname ?? __dirname, '../../../../.env') });

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AgentContext,
  MCPClient,
  LLMProviderRef,
  DesignToolAdapter,
} from '@agentforge/core';
import {
  Ok,
  Err,
  createEventBus,
  createFigmaAdapter,
  createPenpotAdapter,
  loadDesignTokens,
  loadBrandSpec,
  loadComponentLibrary,
  createRealFs,
  PREVIEW_DIR_REL,
  DEFAULT_MODEL,
} from '@agentforge/core';
import type { DesignTokensSpec, BrandSpec, ComponentLibrarySpec } from '@agentforge/core';
import { diskDesignTokensRequiredMessage } from '../disk-design-tokens-required.js';
import { runFigmaPreflight, PLUGIN_MANIFEST_REL } from './figma-preflight.js';

import { createClaudeProvider } from '@agentforge/providers';
import type {
  UXDashboardResearchInput,
  UXDashboardResearchOutput,
  UXDashboardPlanningInput,
  UXDashboardPlanningOutput,
  UXDashboardDesignInput,
  UXDashboardDesignOutput,
} from '../index.js';
import type { PenpotDesignInput, PenpotDesignOutput } from '../ux-design/ux-penpot-design.js';
import {
  uxDashboardResearchWork,
  uxDashboardPlanningWork,
  uxDashboardDesignWork,
  penpotDesignWork,
  createDesignCollaborationSession,
  runDesignFeedbackLoop,
  buildDesignSystemContext,
  buildDesignSystemContextFromSpec,
  loadDesignSystemPrompt,
} from '../index.js';

// ============================================================================
// Configuration
// ============================================================================

type DesignTool = 'figma' | 'penpot';
type PipelineStage = 'research' | 'planning' | 'design';

/** Configuration for a module pipeline run. */
interface PipelineRunConfig {
  readonly moduleId: string;
  readonly taskId: string;
  readonly prdRequirements: readonly string[];
  readonly tool: DesignTool;
  readonly description?: string;
  readonly dryRun?: boolean;
}

/** Registry of known modules and their PRD requirements. */
const MODULE_REGISTRY: Readonly<Record<string, Omit<PipelineRunConfig, 'tool'>>> = {
  'cost-dashboard': {
    moduleId: 'cost-dashboard',
    taskId: 'pipeline-001',
    prdRequirements: [
      'Display real-time cost breakdown by agent, phase, and provider',
      'Show budget utilization gauges with configurable thresholds (warning at 80%, critical at 95%)',
      'Render a cost-over-time line chart with daily/weekly/monthly granularity toggle',
      'Provide a sortable table of recent cost records with agent, model, tokens, and USD columns',
      'Support dark mode and WCAG 2.1 AA contrast ratios across all chart elements',
      'Export cost data as CSV or JSON from the table view',
    ],
  },
};

// ============================================================================
// Mock factories
// ============================================================================

/** Mock MCPClient — returns Ok({}) for all tool calls (ADR-024 fallback). */
const createMockMCPClient = (): MCPClient => ({
  callTool: async () => Ok({}),
  listTools: async () => Ok([]),
  isAvailable: async () => true,
});

/** Mock governance — always proceed. */
const createMockGovernance = () => async () =>
  Ok({ status: 'proceed' as const });

// ============================================================================
// Adapter factory
// ============================================================================

/**
 * Create the appropriate DesignToolAdapter based on the selected tool.
 * For Figma, wires in the full preflight delegate from agents-ux.
 */
function createAdapter(tool: DesignTool): DesignToolAdapter {
  if (tool === 'penpot') {
    return createPenpotAdapter();
  }

  return createFigmaAdapter({
    fullPreflight: async (opts) => {
      const result = await runFigmaPreflight(opts as Record<string, unknown> | undefined);
      if (!result.ok) return result;
      return Ok({
        kind: 'figma' as const,
        url: result.value.wsUrl,
        channel: result.value.channel,
        connectedAt: result.value.connectedAt,
        documentName: result.value.documentName,
        supportedTools: result.value.supportedTools,
      });
    },
  });
}

// ============================================================================
// Context factory
// ============================================================================

/** Create an AgentContext with the given MCPClient. */
const createPipelineContext = (taskId: string, mcpClient: MCPClient): AgentContext => ({
  taskId,
  projectRoot: process.cwd(),
  eventBus: createEventBus(),
  fs: createRealFs(),
  mcpClient,
  runGovernance: createMockGovernance(),
  resolveProvider: () => Err({ code: 'MCP_UNAVAILABLE' as const, message: 'not used', recoverable: false }),
  recordAudit: () => {},
});

// ============================================================================
// Artifact I/O
// ============================================================================

const getOutputDir = (moduleId: string): string =>
  resolve(process.cwd(), PREVIEW_DIR_REL, moduleId);

const ensureOutputDir = (moduleId: string): string => {
  const dir = getOutputDir(moduleId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const saveArtifact = (dir: string, filename: string, data: unknown): string => {
  const filePath = join(dir, filename);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
};

const loadArtifact = <T>(dir: string, filename: string): T => {
  const filePath = join(dir, filename);
  if (!existsSync(filePath)) {
    throw new Error(`Required artifact not found: ${filePath}`);
  }
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
};

/** Get the design artifact filename for the given tool. */
const designArtifactName = (tool: DesignTool): string =>
  tool === 'penpot' ? 'penpot-design.json' : 'figma-design.json';

// ============================================================================
// Stage runners
// ============================================================================

interface StageResult<T> {
  readonly output: T;
  readonly durationMs: number;
  readonly artifactPath: string;
}

const runResearch = async (
  config: PipelineRunConfig,
  apiKey: string,
  outputDir: string,
  designTokensSpec?: DesignTokensSpec,
): Promise<StageResult<UXDashboardResearchOutput>> => {
  console.log('\n  [1/3] Research — analyzing PRD requirements...');

  const input: UXDashboardResearchInput = {
    moduleId: config.moduleId,
    taskId: config.taskId,
    prdRequirements: [...config.prdRequirements],
    ...(designTokensSpec ? { designTokensSpec } : {}),
  };

  const provider = createClaudeProvider('claude-opus-4-6', { apiKey });
  const context = createPipelineContext(config.taskId, createMockMCPClient());

  const t0 = Date.now();
  const result = await uxDashboardResearchWork(
    input,
    provider as unknown as LLMProviderRef,
    [],
    context,
  );
  const durationMs = Date.now() - t0;

  if (!result.ok) {
    throw new Error(`Research failed: ${result.error.message}`);
  }

  const artifactPath = saveArtifact(outputDir, 'research-brief.json', result.value);
  console.log(`        constraints=${result.value.designConstraints.length}, ` +
    `requirements=${result.value.requirementIds.length}, ` +
    `a11y=${result.value.accessibilityRequirements.length}`);

  return { output: result.value, durationMs, artifactPath };
};

const runPlanning = async (
  config: PipelineRunConfig,
  researchOutput: UXDashboardResearchOutput,
  apiKey: string,
  outputDir: string,
): Promise<StageResult<UXDashboardPlanningOutput>> => {
  console.log('\n  [2/3] Planning — building component spec...');

  const input: UXDashboardPlanningInput = {
    briefId: researchOutput.briefId,
    moduleId: config.moduleId,
    taskId: config.taskId,
    designBrief: researchOutput,
  };

  const provider = createClaudeProvider(DEFAULT_MODEL, { apiKey });
  const context = createPipelineContext(config.taskId, createMockMCPClient());

  const t0 = Date.now();
  const result = await uxDashboardPlanningWork(
    input,
    provider as unknown as LLMProviderRef,
    [],
    context,
  );
  const durationMs = Date.now() - t0;

  if (!result.ok) {
    throw new Error(`Planning failed: ${result.error.message}`);
  }

  const artifactPath = saveArtifact(outputDir, 'planning-spec.json', result.value);
  console.log(`        components=${result.value.componentTree.length}, ` +
    `tokens=${Object.keys(result.value.tokenBindings).length}, ` +
    `responsive=${result.value.responsiveRules.length}, ` +
    `stages=${result.value.implementationStages.map(s => s.stage).join(',')}`);

  return { output: result.value, durationMs, artifactPath };
};

/** Unified design output that normalizes Figma/Penpot differences. */
interface UnifiedDesignOutput {
  readonly moduleId: string;
  readonly nodeIds: Readonly<Record<string, string>>;
  readonly fileId: string;
  readonly pageId: string;
  readonly breakpoints: readonly string[];
  /** Raw output from the tool-specific design agent. */
  readonly raw: UXDashboardDesignOutput | PenpotDesignOutput;
}

/** Extended result from runDesign that exposes the connection for reuse. */
interface DesignStageResult extends StageResult<UnifiedDesignOutput> {
  readonly disconnectFn?: () => void;
  readonly mcpClient: MCPClient;
  readonly provider: ReturnType<typeof createClaudeProvider>;
}

const runDesign = async (
  config: PipelineRunConfig,
  planningOutput: UXDashboardPlanningOutput,
  apiKey: string,
  outputDir: string,
  projectDesignSystemPrompt?: string,
): Promise<DesignStageResult> => {
  const tool = config.tool;
  console.log(`\n  [3/3] Design — creating ${tool === 'penpot' ? 'Penpot' : 'Figma'} components...`);

  // ── Connect via adapter ──
  const adapter = createAdapter(tool);
  let mcpClient: MCPClient;
  let disconnectFn: (() => void) | undefined;

  const preflightOpts: Record<string, unknown> = {
    log: (msg: string) => console.log(`        ${msg}`),
  };

  if (tool === 'figma') {
    const manifestPath = resolve(process.cwd(), PLUGIN_MANIFEST_REL);
    preflightOpts.pluginManifestPath = manifestPath;
  }

  const preflightResult = await adapter.runPreflight(preflightOpts);

  if (preflightResult.ok) {
    const session = preflightResult.value;
    const handle = adapter.createMCPClient({
      url: session.url,
      channel: session.channel,
      supportedTools: session.supportedTools as string[] | undefined,
    });
    mcpClient = handle.client;
    disconnectFn = handle.disconnect;
  } else {
    if (config.dryRun) {
      console.warn(`        ${tool}: ${preflightResult.error.message}`);
      console.warn(`        [dry-run] Continuing with mock MCP (no ${tool} output)`);
      mcpClient = createMockMCPClient();
    } else {
      throw new Error(
        `${tool} plugin not connected: ${preflightResult.error.message}\n` +
        `  Use --dry-run to proceed without a design tool.`
      );
    }
  }

  const provider = createClaudeProvider(DEFAULT_MODEL, { apiKey });
  const context = createPipelineContext(config.taskId, mcpClient);

  const t0 = Date.now();
  let unified: UnifiedDesignOutput;

  if (tool === 'penpot') {
    // Penpot design path
    const input: PenpotDesignInput = {
      specRef: planningOutput.specRef,
      moduleId: config.moduleId,
      taskId: config.taskId,
      planningOutput,
      description: config.description,
    };

    const result = await penpotDesignWork(input, provider, mcpClient);
    if (!result.ok) {
      disconnectFn?.();
      throw new Error(`Design failed: ${result.error.message}`);
    }

    unified = {
      moduleId: config.moduleId,
      nodeIds: result.value.penpotNodeIds,
      fileId: result.value.penpotProjectId,
      pageId: result.value.penpotPageId,
      breakpoints: result.value.breakpoints,
      raw: result.value,
    };
  } else {
    // Figma design path
    const input: UXDashboardDesignInput = {
      specRef: planningOutput.specRef,
      moduleId: config.moduleId,
      taskId: config.taskId,
      planningOutput,
      designSystemPrompt: projectDesignSystemPrompt,
    };

    const result = await uxDashboardDesignWork(
      input,
      provider as unknown as LLMProviderRef,
      [],
      context,
    );
    if (!result.ok) {
      disconnectFn?.();
      throw new Error(`Design failed: ${result.error.message}`);
    }

    unified = {
      moduleId: config.moduleId,
      nodeIds: result.value.figmaNodeIds,
      fileId: result.value.figmaFileId,
      pageId: result.value.figmaPageId,
      breakpoints: result.value.breakpoints,
      raw: result.value,
    };
  }

  const durationMs = Date.now() - t0;
  const artifactPath = saveArtifact(outputDir, designArtifactName(tool), unified.raw);

  console.log(`        fileId=${unified.fileId}, ` +
    `nodes=${Object.keys(unified.nodeIds).length}, ` +
    `breakpoints=${unified.breakpoints.join(',')}`);

  return { output: unified, durationMs, artifactPath, disconnectFn, mcpClient, provider };
};

// ============================================================================
// Pipeline orchestrator
// ============================================================================

interface PipelineSummary {
  readonly research: StageResult<UXDashboardResearchOutput>;
  readonly planning: StageResult<UXDashboardPlanningOutput>;
  readonly design: DesignStageResult;
}

/** Load project design tokens from disk and build a design system prompt string. */
const loadProjectDesignSystemPrompt = (projectRoot: string): string | undefined => {
  const fs = createRealFs();
  const tokensResult = loadDesignTokens(projectRoot, fs);
  const brandResult = loadBrandSpec(projectRoot, fs);

  if (!tokensResult.ok) {
    return undefined;
  }

  const tokens = tokensResult.value;
  const brand = brandResult.ok ? brandResult.value : undefined;

  // Build structured design system context and extract the prompt string
  const placeholderPlanning = {
    componentTree: [] as { name: string; props: readonly string[]; children: readonly unknown[] }[],
    tokenBindings: {} as Record<string, string>,
  };
  const ctx = buildDesignSystemContextFromSpec(
    tokens,
    brand ?? {
      version: '1.0',
      created_by: 'pipeline',
      identity: { tone: 'professional', audience: 'general' },
      illustration_style: { direction: 'minimal', description: 'Simple and clean' },
      motion_principles: { page_transitions: 'fade', interaction_feel: 'snappy', easing: 'ease-in-out', duration_base_ms: 200 },
      accessibility: { wcag_level: 'AA' },
    },
    placeholderPlanning,
  );
  return ctx.designSystemPrompt;
};

/** Load project design tokens and brand for structured use. */
const loadProjectTokens = (projectRoot: string): { tokens?: DesignTokensSpec; brand?: BrandSpec; componentLibrary?: ComponentLibrarySpec } => {
  const fs = createRealFs();
  const tokensResult = loadDesignTokens(projectRoot, fs);
  const brandResult = loadBrandSpec(projectRoot, fs);
  const componentLibResult = loadComponentLibrary(projectRoot, fs);
  return {
    tokens: tokensResult.ok ? tokensResult.value : undefined,
    brand: brandResult.ok ? brandResult.value : undefined,
    componentLibrary: componentLibResult.ok ? componentLibResult.value : undefined,
  };
};

const runPipeline = async (
  config: PipelineRunConfig,
  apiKey: string,
  skipToStage?: PipelineStage,
): Promise<PipelineSummary> => {
  const outputDir = ensureOutputDir(config.moduleId);
  const projectRoot = process.cwd();

  // ── Load project design tokens (required — pipeline hard-stops if missing) ──
  const projectTokens = loadProjectTokens(projectRoot);
  if (!projectTokens.tokens) {
    console.error(diskDesignTokensRequiredMessage(projectRoot));
    process.exit(1);
  }
  const designSystemPrompt = loadProjectDesignSystemPrompt(projectRoot);
  console.log('  Design tokens loaded from agentforge/spec/design-tokens.yaml');
  if (projectTokens.componentLibrary) {
    console.log(`  Component library: ${projectTokens.componentLibrary.library_name}`);
  }

  // --- Research ---
  let research: StageResult<UXDashboardResearchOutput>;
  if (skipToStage === 'planning' || skipToStage === 'design') {
    console.log('\n  [1/3] Research — loading from artifact...');
    const output = loadArtifact<UXDashboardResearchOutput>(outputDir, 'research-brief.json');
    const artifactPath = join(outputDir, 'research-brief.json');
    research = { output, durationMs: 0, artifactPath };
    console.log(`        (loaded) constraints=${output.designConstraints.length}`);
  } else {
    research = await runResearch(config, apiKey, outputDir, projectTokens.tokens);
  }

  // --- Planning ---
  let planning: StageResult<UXDashboardPlanningOutput>;
  if (skipToStage === 'design') {
    console.log('\n  [2/3] Planning — loading from artifact...');
    const output = loadArtifact<UXDashboardPlanningOutput>(outputDir, 'planning-spec.json');
    const artifactPath = join(outputDir, 'planning-spec.json');
    planning = { output, durationMs: 0, artifactPath };
    console.log(`        (loaded) components=${output.componentTree.length}`);
  } else {
    planning = await runPlanning(config, research.output, apiKey, outputDir);
  }

  // --- Design ---
  const design = await runDesign(config, planning.output, apiKey, outputDir, designSystemPrompt);

  return { research, planning, design };
};

// ============================================================================
// Approval summary
// ============================================================================

const printApprovalSummary = (config: PipelineRunConfig, summary: PipelineSummary): void => {
  const { research, planning, design } = summary;
  const tool = config.tool;
  const designUrl = tool === 'figma'
    ? (design.output.fileId ? `https://www.figma.com/file/${design.output.fileId}` : '(mock — no Figma bridge configured)')
    : (design.output.fileId ? `Penpot project: ${design.output.fileId}` : '(mock — no Penpot connection)');

  const formatTime = (ms: number): string =>
    ms > 0 ? `${(ms / 1000).toFixed(1)}s` : 'cached';

  console.log('\n' + '='.repeat(72));
  console.log('  PIPELINE COMPLETE — APPROVAL REQUIRED');
  console.log('='.repeat(72));
  console.log(`  Module: ${config.moduleId}`);
  console.log(`  Tool: ${tool}`);
  console.log('');
  console.log('  Stages:');
  console.log(`    [OK] Research  (${formatTime(research.durationMs)}) → ${research.artifactPath}`);
  console.log(`    [OK] Planning  (${formatTime(planning.durationMs)}) → ${planning.artifactPath}`);
  console.log(`    [OK] Design    (${formatTime(design.durationMs)}) → ${design.artifactPath}`);
  console.log('');
  console.log(`  ${tool === 'figma' ? 'Figma' : 'Penpot'}:`);
  console.log(`    ${designUrl}`);
  console.log(`    Components created: ${Object.keys(design.output.nodeIds).length}`);
  console.log(`    Breakpoints: ${design.output.breakpoints.join(', ') || 'none'}`);
  console.log('');
  console.log(`  Review the design in ${tool === 'figma' ? 'Figma' : 'Penpot'}, then approve to continue.`);
  console.log('');
  console.log('  To resume with implementation:');
  console.log(`    npx tsx packages/agents-ux/src/scripts/run-module-pipeline.ts \\`);
  console.log(`      --module ${config.moduleId} --tool ${tool} --stage implementation`);
  console.log('='.repeat(72));
};

// ============================================================================
// CLI argument parsing
// ============================================================================

interface CLIArgs {
  readonly module: string;
  readonly stage?: PipelineStage;
  readonly noWait?: boolean;
  readonly tool: DesignTool;
  readonly dryRun?: boolean;
}

const parseArgs = (argv: readonly string[]): CLIArgs => {
  let moduleId: string | undefined;
  let stage: PipelineStage | undefined;
  let noWait = false;
  let tool: DesignTool = 'figma';
  let dryRun = false;

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--module' && i + 1 < argv.length) {
      moduleId = argv[++i];
    } else if (argv[i] === '--stage' && i + 1 < argv.length) {
      const val = argv[++i];
      if (val === 'research' || val === 'planning' || val === 'design') {
        stage = val;
      } else {
        console.error(`Unknown stage: ${val}. Valid: research, planning, design`);
        process.exit(1);
      }
    } else if (argv[i] === '--tool' && i + 1 < argv.length) {
      const val = argv[++i];
      if (val === 'figma' || val === 'penpot') {
        tool = val;
      } else {
        console.error(`Unknown tool: ${val}. Valid: figma, penpot`);
        process.exit(1);
      }
    } else if (argv[i] === '--no-wait') {
      noWait = true;
    } else if (argv[i] === '--dry-run') {
      dryRun = true;
    }
  }

  if (!moduleId) {
    console.error('Usage: run-module-pipeline.ts --module <id> [--tool figma|penpot] [--stage <research|planning|design>] [--no-wait] [--dry-run]');
    console.error(`Available modules: ${Object.keys(MODULE_REGISTRY).join(', ')}`);
    process.exit(1);
  }

  return { module: moduleId, stage, noWait, tool, dryRun };
};

// ============================================================================
// Main
// ============================================================================

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv);

  const moduleConfig = MODULE_REGISTRY[args.module];
  if (!moduleConfig) {
    console.error(`Unknown module: ${args.module}`);
    console.error(`Available modules: ${Object.keys(MODULE_REGISTRY).join(', ')}`);
    process.exit(1);
  }

  const config: PipelineRunConfig = { ...moduleConfig, tool: args.tool, dryRun: args.dryRun };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY must be set');
    process.exit(1);
  }

  console.log('='.repeat(72));
  console.log(`  AgentForge UX Pipeline — ${config.moduleId} (${config.tool})`);
  console.log('='.repeat(72));
  if (args.stage) {
    console.log(`  Skipping to: ${args.stage} (loading prior stages from artifacts)`);
  }

  // Load project tokens for use in the feedback loop
  const mainProjectTokens = loadProjectTokens(process.cwd());
  const mainDesignSystemPrompt = loadProjectDesignSystemPrompt(process.cwd());

  let summary: PipelineSummary | undefined;
  try {
    summary = await runPipeline(config, apiKey, args.stage);
    printApprovalSummary(config, summary);

    // ── Interactive feedback loop (Figma only for now) ──
    const isTTY = 'isTTY' in process.stdin && (process.stdin as NodeJS.ReadStream).isTTY;
    if (!args.noWait && isTTY && summary.design.mcpClient && config.tool === 'figma') {
      const rawDesign = summary.design.output.raw as UXDashboardDesignOutput;
      const designSystemCtx = buildDesignSystemContext(
        summary.planning.output,
        mainDesignSystemPrompt ?? loadDesignSystemPrompt(),
        mainProjectTokens.tokens,
        mainProjectTokens.brand,
      );
      const session = createDesignCollaborationSession(
        summary.design.mcpClient,
        summary.design.provider as unknown as { complete: (prompt: { system: string; messages: { role: 'user' | 'assistant'; content: string }[] }, opts: { model: string; maxTokens: number; temperature: number }) => Promise<import('@agentforge/core').Result<{ content: string }>> },
        rawDesign,
        designSystemCtx,
      );

      const loopResult = await runDesignFeedbackLoop({
        session,
        initialDesign: rawDesign,
        input: process.stdin,
        output: process.stdout,
      });

      if (loopResult.changeCount > 0) {
        const outputDir = ensureOutputDir(config.moduleId);
        saveArtifact(outputDir, designArtifactName(config.tool), loopResult.finalDesign);
        console.log(`  Updated artifact with ${loopResult.changeCount} change(s).`);
      }

      if (loopResult.approved) {
        console.log('  Design approved.');
      } else {
        console.log('  Design not approved.');
      }
    }
  } catch (err) {
    console.error('\n  PIPELINE FAILED');
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  } finally {
    summary?.design.disconnectFn?.();
  }
};

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
