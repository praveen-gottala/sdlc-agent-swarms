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

import { resolve, join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { successMsg, errorMsg, infoMsg, warnMsg } from '../formatter.js';
import { findProjectRoot, loadDotEnv } from '../fs-utils.js';
import { verifyImplementation } from './impl-verify.js';
import {
  Ok,
  Err,
  createEventBus,
  createPenpotAdapter,
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
} from '@agentforge/core';
import { createClaudeProvider } from '@agentforge/providers';
import {
  runPenpotPreflight,
  loadPenpotSession,
  uxDashboardResearchWork,
  uxDashboardPlanningWork,
  penpotDesignWork,
  buildDesignSystemContextFromSpec,
  uxDashboardImplementationWork,
  writeImplementationFiles,
  runDesignFeedbackLoop,
  discoverPenpotAPI,
  createPenpotCollaborationSession,
  createPenpotReviewCallback,
  mapPenpotToDesignOutput,
} from '@agentforge/agents-ux';
import type {
  UXDashboardResearchInput,
  UXDashboardResearchOutput,
  UXDashboardPlanningInput,
  UXDashboardPlanningOutput,
  PenpotDesignInput,
  PenpotDesignOutput,
  UXDashboardImplementationInput,
  ImplementCallback,
} from '@agentforge/agents-ux';

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
  /** Exit immediately after design without waiting for approval. */
  readonly noWait?: boolean;
  /** Skip feedback loop and generate code directly after design. */
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
  callTool: async (_server: string) => Ok({}),
  listTools: async (_server: string) => Ok([]),
  isAvailable: async (_server: string) => true,
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

// ============================================================================
// Command
// ============================================================================

/**
 * Execute the design:penpot command.
 * Runs the full UX pipeline with Penpot integration.
 */
export async function designPenpotCommand(
  description: string,
  output: NodeJS.WritableStream = process.stdout,
  options: DesignPenpotOptions = {},
): Promise<void> {
  const moduleId = options.module ?? deriveModuleId(description);
  const taskId = `task_design_penpot_${Date.now()}`;
  const skipToStage = options.stage;
  const outputDir = ensureOutputDir(moduleId);

  output.write(infoMsg('='.repeat(60) + '\n'));
  output.write(infoMsg(`  AgentForge Penpot Design Pipeline\n`));
  output.write(infoMsg(`  Module: ${moduleId}\n`));
  output.write(infoMsg(`  Description: ${description}\n`));
  output.write(infoMsg('='.repeat(60) + '\n'));

  // Load .env file so ANTHROPIC_API_KEY is available
  const projectRoot = findProjectRoot();
  loadDotEnv(projectRoot);

  // ── Load PRD for app context ──
  const prdPath = join(projectRoot, 'docs', 'prd.md');
  let prdContent: string | undefined;
  if (existsSync(prdPath)) {
    prdContent = readFileSync(prdPath, 'utf-8');
    output.write(infoMsg('  PRD loaded from docs/prd.md\n'));
  } else {
    output.write(warnMsg('  No PRD found at docs/prd.md — design will use description only.\n'));
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

  // Validate API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    output.write(errorMsg('ANTHROPIC_API_KEY must be set\n'));
    process.exitCode = 1;
    return;
  }

  // -- Stage 1: Research --
  let researchOutput: UXDashboardResearchOutput;

  if (skipToStage === 'planning' || skipToStage === 'design' || skipToStage === 'replay' || skipToStage === 'connect') {
    const cached = loadArtifact<UXDashboardResearchOutput>(outputDir, 'research-brief.json');
    if (!cached) {
      output.write(errorMsg(`No cached research output found at ${outputDir}/research-brief.json\n`));
      process.exitCode = 1;
      return;
    }
    researchOutput = cached;
    output.write(infoMsg('  [1/3] Research -- loaded from cache\n'));
  } else {
    output.write(infoMsg('\n  [1/3] Research -- analyzing requirements...\n'));
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

  // -- Stage 2: Planning --
  let planningOutput: UXDashboardPlanningOutput;

  if (skipToStage === 'design' || skipToStage === 'replay' || skipToStage === 'connect') {
    const cached = loadArtifact<UXDashboardPlanningOutput>(outputDir, 'planning-spec.json');
    if (!cached) {
      output.write(errorMsg(`No cached planning output found at ${outputDir}/planning-spec.json\n`));
      process.exitCode = 1;
      return;
    }
    planningOutput = cached;
    output.write(infoMsg('  [2/3] Planning -- loaded from cache\n'));
  } else {
    output.write(infoMsg('\n  [2/3] Planning -- building component spec...\n'));
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

  // -- Penpot connection --
  let mcpClient: MCPClient;
  let disconnectFn: (() => void) | undefined;
  const adapter = createPenpotAdapter();

  const mcpUrl = process.env.AGENTFORGE_MCP_PENPOT_URL ?? 'http://localhost:4401/mcp';

  // Try session, then preflight
  const sessionResult = loadPenpotSession();
  if (sessionResult.ok) {
    output.write(infoMsg(`  Penpot: reusing session (tools: ${sessionResult.value.supportedTools?.length ?? 0})\n`));
    const handle = adapter.createMCPClient({ url: sessionResult.value.url });
    mcpClient = handle.client;
    disconnectFn = handle.disconnect;
  } else {
    output.write(infoMsg('  Penpot: running preflight...\n'));
    const preflightResult = await runPenpotPreflight({ mcpUrl });
    if (preflightResult.ok) {
      output.write(successMsg(`  Penpot: connected (tools: ${preflightResult.value.supportedTools?.length ?? 0})\n`));
      const handle = adapter.createMCPClient({ url: preflightResult.value.url });
      mcpClient = handle.client;
      disconnectFn = handle.disconnect;
    } else {
      output.write(warnMsg(`  Penpot: ${preflightResult.error.message}\n`));
      output.write(warnMsg('  Continuing with mock MCP (no Penpot output)\n'));
      mcpClient = createMockMCPClient();
    }
  }

  // -- Stage: connect (test connection only) --
  if (skipToStage === 'connect') {
    const cached = loadArtifact<PenpotDesignOutput>(outputDir, 'penpot-design.json');
    if (!cached) {
      output.write(errorMsg(`No cached design output found at ${outputDir}/penpot-design.json\n`));
      process.exitCode = 1;
      disconnectFn?.();
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
    disconnectFn?.();
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

    try {
      const wrappedScript = `
try {
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
    } finally {
      disconnectFn?.();
    }
    return;
  }

  // -- Stage 3: Design (Penpot) --
  output.write(infoMsg('\n  [3/3] Design -- creating Penpot components...\n'));

  const provider = createClaudeProvider('claude-sonnet-4', { apiKey });

  // Build project-specific design system prompt from tokens + brand
  let projectDesignSystemPrompt: string | undefined;
  if (designTokens && brandSpec) {
    const dsCtx = buildDesignSystemContextFromSpec(designTokens, brandSpec, planningOutput);
    projectDesignSystemPrompt = dsCtx.designSystemPrompt;
  }

  const penpotInput: PenpotDesignInput = {
    specRef: planningOutput.specRef,
    moduleId,
    taskId,
    planningOutput,
    description,
    ...(projectDesignSystemPrompt ? { designSystemPrompt: projectDesignSystemPrompt } : {}),
  };

  const t0 = Date.now();
  try {
    const result = await penpotDesignWork(penpotInput, provider, mcpClient);
    const ms = Date.now() - t0;

    if (!result.ok) {
      output.write(errorMsg(`Design failed: ${result.error.message}\n`));
      process.exitCode = 1;
      return;
    }

    const designOutput = result.value;
    const artifactPath = saveArtifact(outputDir, 'penpot-design.json', designOutput);

    output.write(successMsg(`  Design complete (${(ms / 1000).toFixed(1)}s)\n`));
    output.write('\n');
    output.write(infoMsg('='.repeat(60) + '\n'));
    output.write(infoMsg('  PIPELINE COMPLETE\n'));
    output.write(infoMsg('='.repeat(60) + '\n'));
    output.write(infoMsg(`  Module: ${moduleId}\n`));
    output.write(infoMsg(`  Components: ${Object.keys(designOutput.penpotNodeIds).length}\n`));
    output.write(infoMsg(`  Artifact: ${artifactPath}\n`));
    output.write(infoMsg('='.repeat(60) + '\n'));

    // ── Build implement callback ──
    const createImplementFn = (): ImplementCallback => {
      return async (design) => {
        const implProvider = createClaudeProvider('claude-sonnet-4', { apiKey });
        const implContext = createContext(`${taskId}_impl`, mcpClient);

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
