/**
 * @module @agentforge/cli/commands/design-figma
 *
 * The `agentforge design:figma <description>` command.
 * Runs the full UX design pipeline (Research → Planning → Design)
 * with Figma integration via the TalkToFigma WebSocket bridge.
 *
 * This command:
 * 1. Starts the Figma bridge (Docker) if not running
 * 2. Auto-connects to the Figma plugin via well-known channel
 * 3. Runs Research → Planning → Design stages
 * 4. Optionally runs visual self-correction loop
 *
 * Connection is managed through the FigmaAdapter (DesignToolAdapter interface),
 * which encapsulates the env-var → session → Docker preflight strategies.
 */

import { resolve, join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { successMsg, errorMsg, infoMsg, warnMsg } from '../formatter.js';
import { findProjectRoot, loadDotEnv } from '../fs-utils.js';
import { verifyImplementation } from './impl-verify.js';
import {
  Ok,
  Err,
  createEventBus,
  createFigmaAdapter,
  createRealFs,
  loadDesignTokens,
  loadBrandSpec,
  toDesignTokens,
} from '@agentforge/core';
import type {
  MCPClient,
  LLMProviderRef,
  DesignTokensSpec,
  BrandSpec,
  DesignToolSession,
} from '@agentforge/core';
import { createClaudeProvider } from '@agentforge/providers';
import {
  runFigmaPreflight,
  PLUGIN_MANIFEST_REL,
  uxDashboardResearchWork,
  uxDashboardPlanningWork,
  uxDashboardDesignWork,
  executeDesignSteps,
  uxDashboardImplementationWork,
  writeImplementationFiles,
  createDesignCollaborationSession,
  runDesignFeedbackLoop,
  createReviewCallback,
  buildDesignSystemContext,
  buildDesignSystemContextFromSpec,
  loadDesignSystemPrompt,
} from '@agentforge/agents-ux';
import type {
  UXDashboardResearchInput,
  UXDashboardResearchOutput,
  UXDashboardPlanningInput,
  UXDashboardPlanningOutput,
  UXDashboardDesignInput,
  UXDashboardDesignOutput,
  UXDashboardImplementationInput,
  ImplementCallback,
} from '@agentforge/agents-ux';

// ============================================================================
// Types
// ============================================================================

interface DesignFigmaOptions {
  /**
   * Skip to a specific stage (loads prior stages from artifacts).
   * - 'planning': skip research, load from cache
   * - 'design': skip research + planning, load from cache
   * - 'replay': re-execute cached design steps into Figma (no LLM calls)
   * - 'connect': skip all stages, load design from cache — only tests connection
   */
  readonly stage?: 'research' | 'planning' | 'design' | 'replay' | 'connect';
  /** Module ID for the design. Default: derived from description. */
  readonly module?: string;
  /** Exit immediately after design without waiting for approval. */
  readonly noWait?: boolean;
  /** Skip feedback loop and go straight to code generation after design. */
  readonly implement?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

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

/** Create a mock filesystem for the agent context. */
const createMockFs = () => ({
  readFile: () => Err({ code: 'INVALID_STATE' as const, message: 'mock fs', recoverable: false }),
  writeFile: () => Ok(undefined),
  writeFileAtomic: () => Ok(undefined),
  exists: () => false,
  mkdir: () => Ok(undefined),
  rename: () => Ok(undefined),
  remove: () => Ok(undefined),
  listDir: () => Ok([] as readonly string[]),
  appendFile: () => Ok(undefined),
});

/** Create a mock MCP client. */
const createMockMCPClient = (): MCPClient => ({
  callTool: async () => Ok({}),
  listTools: async () => Ok([]),
  isAvailable: async () => true,
});

/** Create an agent context. */
const createContext = (taskId: string, mcpClient: MCPClient) => ({
  taskId,
  projectRoot: process.cwd(),
  eventBus: createEventBus(),
  fs: createMockFs(),
  mcpClient,
  runGovernance: async () => Ok({ status: 'proceed' as const }),
  resolveProvider: () => Err({ code: 'MCP_UNAVAILABLE' as const, message: 'not used', recoverable: false }),
  recordAudit: () => {},
});

/** Ensure output directory exists and return path. */
const ensureOutputDir = (moduleId: string): string => {
  const dir = resolve(process.cwd(), '.agentforge', 'previews', moduleId);
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

/** Load a JSON artifact. */
const loadArtifact = <T>(dir: string, filename: string): T | null => {
  const filePath = join(dir, filename);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
};

/**
 * Map a FigmaSession (from agents-ux preflight) to a DesignToolSession.
 * The agents-ux preflight returns FigmaSession with `wsUrl` field,
 * while DesignToolAdapter uses `url`.
 */
function mapPreflightToSession(
  preflightResult: { wsUrl: string; channel: string; connectedAt: string; documentName?: string; supportedTools?: readonly string[] },
): DesignToolSession {
  return {
    kind: 'figma',
    url: preflightResult.wsUrl,
    channel: preflightResult.channel,
    connectedAt: preflightResult.connectedAt,
    documentName: preflightResult.documentName,
    supportedTools: preflightResult.supportedTools,
  };
}

// ============================================================================
// Command
// ============================================================================

/**
 * Execute the design:figma command.
 * Runs the full UX pipeline with Figma integration.
 */
export async function designFigmaCommand(
  description: string,
  output: NodeJS.WritableStream = process.stdout,
  options: DesignFigmaOptions = {},
): Promise<void> {
  const moduleId = options.module ?? deriveModuleId(description);
  const taskId = `task_design_figma_${Date.now()}`;
  const skipToStage = options.stage;
  const outputDir = ensureOutputDir(moduleId);

  // Load .env file so ANTHROPIC_API_KEY is available
  loadDotEnv(findProjectRoot());

  output.write(infoMsg('='.repeat(60) + '\n'));
  output.write(infoMsg(`  AgentForge Figma Design Pipeline\n`));
  output.write(infoMsg(`  Module: ${moduleId}\n`));
  output.write(infoMsg(`  Description: ${description}\n`));
  output.write(infoMsg('='.repeat(60) + '\n'));

  // Validate API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    output.write(errorMsg('ANTHROPIC_API_KEY must be set\n'));
    process.exitCode = 1;
    return;
  }

  // ── Load PRD for app context ──
  const projectRoot = findProjectRoot();
  const prdPath = join(projectRoot, 'docs', 'prd.md');
  let prdContent: string | undefined;
  if (existsSync(prdPath)) {
    prdContent = readFileSync(prdPath, 'utf-8');
    output.write(infoMsg('  PRD loaded from docs/prd.md\n'));
  } else {
    output.write(warnMsg('  No PRD found at docs/prd.md — design will use description only.\n'));
    output.write(warnMsg('  Run `agentforge describe` first for better results.\n'));
  }

  // ── Load design system (tokens + brand) ──
  const realFs = createRealFs();
  let designTokens: DesignTokensSpec | undefined;
  let brandSpec: BrandSpec | undefined;

  const tokensResult = loadDesignTokens(projectRoot, realFs);
  if (tokensResult.ok) {
    designTokens = tokensResult.value;
    output.write(infoMsg('  Design tokens loaded from agentforge/spec/design-tokens.yaml\n'));
  }

  const brandResult = loadBrandSpec(projectRoot, realFs);
  if (brandResult.ok) {
    brandSpec = brandResult.value;
    output.write(infoMsg('  Brand spec loaded from agentforge/spec/brand.yaml\n'));
  }

  if (!designTokens && !brandSpec) {
    output.write(warnMsg('  No design system found — using defaults.\n'));
    output.write(warnMsg('  Run `agentforge design:system` first for brand-accurate designs.\n'));
  }

  // ── Stage 1: Research ──
  let researchOutput: UXDashboardResearchOutput;

  if (skipToStage === 'planning' || skipToStage === 'design' || skipToStage === 'replay' || skipToStage === 'connect') {
    const cached = loadArtifact<UXDashboardResearchOutput>(outputDir, 'research-brief.json');
    if (!cached) {
      output.write(errorMsg(`No cached research output found at ${outputDir}/research-brief.json\n`));
      process.exitCode = 1;
      return;
    }
    researchOutput = cached;
    output.write(infoMsg('  [1/3] Research — loaded from cache\n'));
  } else {
    output.write(infoMsg('\n  [1/3] Research — analyzing requirements...\n'));
    const provider = createClaudeProvider('claude-sonnet-4', { apiKey });
    const context = createContext(taskId, createMockMCPClient());

    const prdRequirements: string[] = [description];
    if (prdContent) {
      prdRequirements.push(prdContent);
    }

    const input: UXDashboardResearchInput = {
      moduleId,
      taskId,
      prdRequirements,
      ...(designTokens ? { existingTokens: toDesignTokens(designTokens) } : {}),
    };

    const t0 = Date.now();
    const result = await uxDashboardResearchWork(input, provider as unknown as LLMProviderRef, [], context);
    const ms = Date.now() - t0;

    if (!result.ok) {
      output.write(errorMsg(`Research failed: ${result.error.message}\n`));
      process.exitCode = 1;
      return;
    }

    researchOutput = result.value;
    saveArtifact(outputDir, 'research-brief.json', researchOutput);
    output.write(successMsg(`  Research complete (${(ms / 1000).toFixed(1)}s)\n`));
  }

  // ── Stage 2: Planning ──
  let planningOutput: UXDashboardPlanningOutput;

  if (skipToStage === 'design' || skipToStage === 'replay' || skipToStage === 'connect') {
    const cached = loadArtifact<UXDashboardPlanningOutput>(outputDir, 'planning-spec.json');
    if (!cached) {
      output.write(errorMsg(`No cached planning output found at ${outputDir}/planning-spec.json\n`));
      process.exitCode = 1;
      return;
    }
    planningOutput = cached;
    output.write(infoMsg('  [2/3] Planning — loaded from cache\n'));
  } else {
    output.write(infoMsg('\n  [2/3] Planning — building component spec...\n'));
    const provider = createClaudeProvider('claude-sonnet-4', { apiKey });
    const context = createContext(taskId, createMockMCPClient());

    const input: UXDashboardPlanningInput = {
      briefId: researchOutput.briefId,
      moduleId,
      taskId,
      designBrief: researchOutput,
    };

    const t0 = Date.now();
    const result = await uxDashboardPlanningWork(input, provider as unknown as LLMProviderRef, [], context);
    const ms = Date.now() - t0;

    if (!result.ok) {
      output.write(errorMsg(`Planning failed: ${result.error.message}\n`));
      process.exitCode = 1;
      return;
    }

    planningOutput = result.value;
    saveArtifact(outputDir, 'planning-spec.json', planningOutput);
    output.write(successMsg(`  Planning complete (${(ms / 1000).toFixed(1)}s)\n`));
  }

  // ── Figma connection ──
  // Create the Figma adapter with full preflight delegate from agents-ux.
  // The adapter encapsulates three connection strategies:
  //   1. Env-var: AGENTFORGE_MCP_FIGMA_WRITE_URL + AGENTFORGE_MCP_FIGMA_CHANNEL
  //   2. Cached session: .agentforge/figma-session.json
  //   3. Full preflight: Docker startup, plugin build, channel discovery
  const adapter = createFigmaAdapter({
    fullPreflight: async (opts) => {
      const result = await runFigmaPreflight(opts as Record<string, unknown> | undefined);
      if (!result.ok) return result;
      return Ok(mapPreflightToSession(result.value));
    },
  });

  let mcpClient: MCPClient;
  let disconnectFn: (() => void) | undefined;

  const manifestPath = resolve(process.cwd(), PLUGIN_MANIFEST_REL);
  const preflightResult = await adapter.runPreflight({
    log: (msg: string) => output.write(infoMsg(`  ${msg}\n`)),
    pluginManifestPath: manifestPath,
  });

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
    output.write(warnMsg(`  Figma: ${preflightResult.error.message}\n`));
    output.write(warnMsg('  Continuing with mock MCP (no Figma output)\n'));
    mcpClient = createMockMCPClient();
  }

  // ── Stage 3: Design (Figma) ──
  if (skipToStage === 'connect') {
    // --stage connect: skip design, load from cache, only test connection
    const cached = loadArtifact<UXDashboardDesignOutput>(outputDir, 'figma-design.json');
    if (!cached) {
      output.write(errorMsg(`No cached design output found at ${outputDir}/figma-design.json\n`));
      process.exitCode = 1;
      disconnectFn?.();
      return;
    }
    output.write(infoMsg('  [3/3] Design — loaded from cache\n'));
    output.write('\n');
    output.write(infoMsg('='.repeat(60) + '\n'));
    output.write(infoMsg('  CONNECTION TEST COMPLETE\n'));
    output.write(infoMsg('='.repeat(60) + '\n'));
    output.write(infoMsg(`  Module: ${moduleId}\n`));
    output.write(infoMsg(`  Components: ${Object.keys(cached.figmaNodeIds).length}\n`));
    output.write(infoMsg(`  Figma File: ${cached.figmaFileId}\n`));
    output.write(infoMsg('='.repeat(60) + '\n'));
    disconnectFn?.();
    return;
  }

  if (skipToStage === 'replay') {
    // --stage replay: re-execute cached design steps into Figma (no LLM calls)
    const cached = loadArtifact<UXDashboardDesignOutput>(outputDir, 'figma-design.json');
    if (!cached?.steps || cached.steps.length === 0) {
      output.write(errorMsg(`No cached design steps found in ${outputDir}/figma-design.json\n`));
      output.write(errorMsg('Run a full design first (without --stage) to generate steps.\n'));
      process.exitCode = 1;
      disconnectFn?.();
      return;
    }

    output.write(infoMsg(`\n  [3/3] Design — replaying ${cached.steps.length} cached steps into Figma...\n`));
    const t0 = Date.now();

    try {
      const result = await executeDesignSteps(cached.steps, mcpClient, moduleId);
      const ms = Date.now() - t0;

      // Save updated artifact with new node IDs (Figma assigns fresh IDs on replay)
      const updatedOutput: UXDashboardDesignOutput = {
        ...cached,
        figmaFileId: result.figmaFileId,
        figmaPageId: result.figmaPageId,
        figmaNodeIds: result.figmaNodeIds,
      };
      const artifactPath = saveArtifact(outputDir, 'figma-design.json', updatedOutput);

      output.write(successMsg(`  Replay complete (${(ms / 1000).toFixed(1)}s)\n`));
      output.write('\n');
      output.write(infoMsg('='.repeat(60) + '\n'));
      output.write(infoMsg('  REPLAY COMPLETE\n'));
      output.write(infoMsg('='.repeat(60) + '\n'));
      output.write(infoMsg(`  Module: ${moduleId}\n`));
      output.write(infoMsg(`  Steps: ${cached.steps.length}\n`));
      output.write(infoMsg(`  Components: ${Object.keys(result.figmaNodeIds).length}\n`));
      output.write(infoMsg(`  Figma File: ${result.figmaFileId}\n`));
      output.write(infoMsg(`  Artifact: ${artifactPath}\n`));
      output.write(infoMsg('='.repeat(60) + '\n'));
    } finally {
      disconnectFn?.();
    }
    return;
  }

  output.write(infoMsg('\n  [3/3] Design — creating Figma components...\n'));

  const provider = createClaudeProvider('claude-sonnet-4', { apiKey });
  const context = createContext(taskId, mcpClient);

  // Build project-specific design system prompt from tokens + brand
  let projectDesignSystemPrompt: string | undefined;
  if (designTokens && brandSpec) {
    const dsCtx = buildDesignSystemContextFromSpec(designTokens, brandSpec, planningOutput);
    projectDesignSystemPrompt = dsCtx.designSystemPrompt;
  }

  const input: UXDashboardDesignInput = {
    specRef: planningOutput.specRef,
    moduleId,
    taskId,
    planningOutput,
    description,
    ...(projectDesignSystemPrompt ? { designSystemPrompt: projectDesignSystemPrompt } : {}),
  };

  const t0 = Date.now();
  try {
    const result = await uxDashboardDesignWork(input, provider as unknown as LLMProviderRef, [], context);
    const ms = Date.now() - t0;

    if (!result.ok) {
      output.write(errorMsg(`Design failed: ${result.error.message}\n`));
      process.exitCode = 1;
      return;
    }

    let designOutput = result.value;
    const artifactPath = saveArtifact(outputDir, 'figma-design.json', designOutput);

    output.write(successMsg(`  Design complete (${(ms / 1000).toFixed(1)}s)\n`));
    output.write('\n');
    output.write(infoMsg('='.repeat(60) + '\n'));
    output.write(infoMsg('  PIPELINE COMPLETE\n'));
    output.write(infoMsg('='.repeat(60) + '\n'));
    output.write(infoMsg(`  Module: ${moduleId}\n`));
    output.write(infoMsg(`  Components: ${Object.keys(designOutput.figmaNodeIds).length}\n`));
    output.write(infoMsg(`  Figma File: ${designOutput.figmaFileId}\n`));
    output.write(infoMsg(`  Artifact: ${artifactPath}\n`));
    output.write(infoMsg('='.repeat(60) + '\n'));

    // ── Build implement callback ──
    const createImplementFn = (): ImplementCallback => {
      return async (design) => {
        const implProvider = createClaudeProvider('claude-sonnet-4', { apiKey });
        const implContext = createContext(`${taskId}_impl`, mcpClient);

        // Pass design snapshot data (screenshots + extracted styles) to the implementation agent
        const implInput: UXDashboardImplementationInput = {
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

        const implResult = await uxDashboardImplementationWork(
          implInput,
          implProvider as unknown as LLMProviderRef,
          [],
          implContext,
        );

        if (!implResult.ok) {
          return implResult as import('@agentforge/core').Result<never>;
        }

        const targetDir = process.cwd();
        const writtenPaths = writeImplementationFiles(implResult.value.files, targetDir);

        return Ok({ files: implResult.value.files, writtenPaths });
      };
    };

    // ── --implement flag: skip feedback loop, go straight to code gen ──
    if (options.implement) {
      output.write(infoMsg('\n  [implement] Generating code from design...\n'));
      const implementFn = createImplementFn();
      const implResult = await implementFn(designOutput);
      if (implResult.ok) {
        output.write(successMsg(`  Generated ${implResult.value.files.length} file(s):\n`));
        for (const path of implResult.value.writtenPaths) {
          output.write(infoMsg(`    ${path}\n`));
        }

        // ── Post-implementation verification ──
        output.write(infoMsg('\n  [verify] Starting post-implementation verification...\n'));
        await verifyImplementation({
          projectRoot: process.cwd(),
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
      const designSystemCtx = designTokens && brandSpec
        ? buildDesignSystemContextFromSpec(designTokens, brandSpec, planningOutput)
        : buildDesignSystemContext(planningOutput, loadDesignSystemPrompt());
      const session = createDesignCollaborationSession(
        mcpClient,
        provider as unknown as { complete: (prompt: { system: string; messages: { role: 'user' | 'assistant'; content: string }[] }, opts: { model: string; maxTokens: number; temperature: number }) => Promise<import('@agentforge/core').Result<{ content: string }>> },
        designOutput,
        designSystemCtx,
      );

      const planningSpec = JSON.stringify(planningOutput, null, 2);
      const reviewFn = createReviewCallback(provider as Parameters<typeof createReviewCallback>[0], planningSpec);
      const implementFn = createImplementFn();

      const loopResult = await runDesignFeedbackLoop({
        session,
        initialDesign: designOutput,
        input: process.stdin,
        output,
        reviewFn,
        implementFn,
      });

      designOutput = loopResult.finalDesign;
      if (loopResult.changeCount > 0) {
        saveArtifact(outputDir, 'figma-design.json', designOutput);
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
