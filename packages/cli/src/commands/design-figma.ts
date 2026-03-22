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
 */

import { resolve, join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { successMsg, errorMsg, infoMsg, warnMsg } from '../formatter.js';
import {
  Ok,
  Err,
  createEventBus,
  createTalkToFigmaTransport,
  TALK_TO_FIGMA_TOOLS,
} from '@agentforge/core';
import type {
  MCPClient,
  LLMProviderRef,
} from '@agentforge/core';
import { createClaudeProvider } from '@agentforge/providers';
import {
  loadFigmaSession,
  runFigmaPreflight,
  discoverChannels,
  uxDashboardResearchWork,
  uxDashboardPlanningWork,
  uxDashboardDesignWork,
  uxDashboardImplementationWork,
  writeImplementationFiles,
  createDesignCollaborationSession,
  runDesignFeedbackLoop,
  createReviewCallback,
  buildDesignSystemContext,
  loadDesignSystemPrompt,
} from '@agentforge/agents-ux';
import type {
  UXDashboardResearchInput,
  UXDashboardResearchOutput,
  UXDashboardPlanningInput,
  UXDashboardPlanningOutput,
  UXDashboardDesignInput,
  UXDashboardImplementationInput,
  ImplementCallback,
} from '@agentforge/agents-ux';

// ============================================================================
// Types
// ============================================================================

interface DesignFigmaOptions {
  /** Skip to a specific stage (loads prior stages from artifacts). */
  readonly stage?: 'research' | 'planning' | 'design';
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

/** Create an MCP client backed by TalkToFigma. */
const createFigmaMCPClient = (wsUrl: string, channel: string): { client: MCPClient; disconnect: () => void } => {
  const { connection } = createTalkToFigmaTransport({
    websocketUrl: wsUrl,
    channel,
  });

  const client: MCPClient = {
    callTool: async (_server: string, method: string, params: Readonly<Record<string, unknown>>) => {
      if (!connection.isConnected()) {
        const r = await connection.connect();
        if (!r.ok) return r;
      }
      return connection.callTool(method, params);
    },
    listTools: async () => Ok([...TALK_TO_FIGMA_TOOLS]),
    isAvailable: async () => connection.isConnected(),
  };

  return { client, disconnect: () => connection.disconnect() };
};

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

  // ── Stage 1: Research ──
  let researchOutput: UXDashboardResearchOutput;

  if (skipToStage === 'planning' || skipToStage === 'design') {
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

    const input: UXDashboardResearchInput = {
      moduleId,
      taskId,
      prdRequirements: [description],
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

  if (skipToStage === 'design') {
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

  // ── Stage 3: Design (Figma) ──
  output.write(infoMsg('\n  [3/3] Design — creating Figma components...\n'));

  // Connect to Figma
  let mcpClient: MCPClient;
  let disconnectFn: (() => void) | undefined;

  const envWsUrl = process.env.AGENTFORGE_MCP_FIGMA_WRITE_URL;
  const envChannel = process.env.AGENTFORGE_MCP_FIGMA_CHANNEL;

  if (envWsUrl) {
    let channelToUse = envChannel;

    if (!channelToUse) {
      // Discover the Figma plugin's channel via the bridge
      const bridgeHttpUrl = envWsUrl.replace('ws://', 'http://').replace('wss://', 'https://');
      const channels = await discoverChannels(bridgeHttpUrl);

      if (channels.length > 0) {
        channelToUse = channels[channels.length - 1];
        output.write(infoMsg(`  Figma bridge: ${envWsUrl} (discovered channel: ${channelToUse})\n`));
      } else {
        output.write(infoMsg(`  Figma bridge: ${envWsUrl}\n`));
        output.write(warnMsg('\n  No Figma plugin detected.\n'));
        output.write(infoMsg('  1. Open Figma\n'));
        output.write(infoMsg('  2. Open the TalkToFigma plugin (Plugins → TalkToFigma)\n'));
        output.write(infoMsg('  3. Click "Connect" in the plugin\n\n'));
        output.write(infoMsg('  Waiting for plugin to connect...\n'));

        const pollStart = Date.now();
        const maxWaitMs = 120000;
        while (Date.now() - pollStart < maxWaitMs) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const found = await discoverChannels(bridgeHttpUrl);
          if (found.length > 0) {
            channelToUse = found[0];
            output.write(successMsg(`  Figma plugin connected! (channel: ${channelToUse})\n`));
            break;
          }
          const elapsed = Math.round((Date.now() - pollStart) / 1000);
          output.write(infoMsg(`  Waiting for Figma plugin... (${elapsed}s)\n`));
        }

        if (!channelToUse) {
          channelToUse = 'agentforge';
          output.write(warnMsg(`  Plugin not detected within ${maxWaitMs / 1000}s — using fallback channel\n`));
        }
      }
    } else {
      output.write(infoMsg(`  Figma bridge: ${envWsUrl} (channel: ${channelToUse})\n`));
    }

    const bridge = createFigmaMCPClient(envWsUrl, channelToUse);
    mcpClient = bridge.client;
    disconnectFn = bridge.disconnect;
  } else {
    // Try session, then preflight
    const sessionResult = loadFigmaSession();
    if (sessionResult.ok) {
      output.write(infoMsg(`  Figma: reusing session (doc: ${sessionResult.value.documentName})\n`));
      const bridge = createFigmaMCPClient(sessionResult.value.wsUrl, sessionResult.value.channel);
      mcpClient = bridge.client;
      disconnectFn = bridge.disconnect;
    } else {
      output.write(infoMsg('  Figma: running preflight...\n'));
      const preflightResult = await runFigmaPreflight();
      if (preflightResult.ok) {
        output.write(successMsg(`  Figma: connected (doc: ${preflightResult.value.documentName})\n`));
        const bridge = createFigmaMCPClient(preflightResult.value.wsUrl, preflightResult.value.channel);
        mcpClient = bridge.client;
        disconnectFn = bridge.disconnect;
      } else {
        output.write(warnMsg(`  Figma: ${preflightResult.error.message}\n`));
        output.write(warnMsg('  Continuing with mock MCP (no Figma output)\n'));
        mcpClient = createMockMCPClient();
      }
    }
  }

  const provider = createClaudeProvider('claude-sonnet-4', { apiKey });
  const context = createContext(taskId, mcpClient);

  const input: UXDashboardDesignInput = {
    specRef: planningOutput.specRef,
    moduleId,
    taskId,
    planningOutput,
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

        const implInput: UXDashboardImplementationInput = {
          specRef: planningOutput.specRef,
          moduleId,
          taskId: `${taskId}_impl`,
          componentSpec: planningOutput,
          stage: 'layout',
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

        const targetDir = resolve(process.cwd(), 'packages', 'dashboard', 'src', 'components', 'dashboard');
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
      } else {
        output.write(errorMsg(`  Implementation failed: ${implResult.error.message}\n`));
      }
    }

    // ── Interactive feedback loop ──
    const isTTY = 'isTTY' in process.stdin && (process.stdin as NodeJS.ReadStream).isTTY;
    if (!options.noWait && !options.implement && isTTY) {
      const designSystemCtx = buildDesignSystemContext(planningOutput, loadDesignSystemPrompt());
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
