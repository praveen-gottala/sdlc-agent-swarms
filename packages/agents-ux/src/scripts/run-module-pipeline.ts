/**
 * @module run-module-pipeline
 *
 * Standalone script that runs the first 3 stages of the UX agent pipeline
 * (Research → Planning → Design) and stops for human approval before
 * implementation begins.
 *
 * Usage:
 *   RUN_E2E_PROOF=true ANTHROPIC_API_KEY=sk-ant-... \
 *   npx tsx packages/agents-ux/src/scripts/run-module-pipeline.ts --module cost-dashboard
 *
 * To resume from a specific stage (loads prior stage outputs from JSON):
 *   npx tsx packages/agents-ux/src/scripts/run-module-pipeline.ts \
 *     --module cost-dashboard --stage design
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
  FileSystem,
  LLMProviderRef,
} from '@agentforge/core';
import {
  Ok,
  Err,
  createEventBus,
  createTalkToFigmaTransport,
  TALK_TO_FIGMA_TOOLS,
} from '@agentforge/core';
import { loadFigmaSession, runFigmaPreflight, discoverChannels } from './figma-preflight.js';

import { createClaudeProvider } from '@agentforge/providers';
import type {
  UXDashboardResearchInput,
  UXDashboardResearchOutput,
  UXDashboardPlanningInput,
  UXDashboardPlanningOutput,
  UXDashboardDesignInput,
  UXDashboardDesignOutput,
} from '../index.js';
import {
  uxDashboardResearchWork,
  uxDashboardPlanningWork,
  uxDashboardDesignWork,
  createDesignCollaborationSession,
  runDesignFeedbackLoop,
  buildDesignSystemContext,
  loadDesignSystemPrompt,
} from '../index.js';

// ============================================================================
// Configuration
// ============================================================================

type PipelineStage = 'research' | 'planning' | 'design';

/** Configuration for a module pipeline run. */
interface PipelineRunConfig {
  readonly moduleId: string;
  readonly taskId: string;
  readonly prdRequirements: readonly string[];
}

/** Registry of known modules and their PRD requirements. */
const MODULE_REGISTRY: Readonly<Record<string, PipelineRunConfig>> = {
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
// Mock factories (same pattern as e2e-cost-dashboard.test.ts)
// ============================================================================

/** Mock FileSystem — returns Err for reads, Ok for writes. */
const createMockFs = (): FileSystem => ({
  readFile: () => Err({ code: 'INVALID_STATE' as const, message: 'mock fs: no file', recoverable: false }),
  writeFile: () => Ok(undefined),
  writeFileAtomic: () => Ok(undefined),
  exists: () => false,
  mkdir: () => Ok(undefined),
  rename: () => Ok(undefined),
  remove: () => Ok(undefined),
  listDir: () => Ok([]),
  appendFile: () => Ok(undefined),
});

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
// MCP Client adapter for TalkToFigma
// ============================================================================

interface FigmaBridgeHandle {
  readonly client: MCPClient;
  readonly disconnect: () => void;
}

/**
 * Create an MCPClient backed by the TalkToFigma WebSocket bridge.
 * Routes all tool calls (regardless of server prefix) through the bridge.
 */
const createFigmaBridgeMCPClient = (wsUrl: string, channel?: string): FigmaBridgeHandle => {
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

  return {
    client,
    disconnect: () => connection.disconnect(),
  };
};

// ============================================================================
// Context factory
// ============================================================================

/** Create an AgentContext with the given MCPClient. */
const createPipelineContext = (taskId: string, mcpClient: MCPClient): AgentContext => ({
  taskId,
  projectRoot: process.cwd(),
  eventBus: createEventBus(),
  fs: createMockFs(),
  mcpClient,
  runGovernance: createMockGovernance(),
  resolveProvider: () => Err({ code: 'MCP_UNAVAILABLE' as const, message: 'not used', recoverable: false }),
  recordAudit: () => {},
});

// ============================================================================
// Artifact I/O
// ============================================================================

const getOutputDir = (moduleId: string): string =>
  resolve(process.cwd(), '.agentforge', 'previews', moduleId);

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
): Promise<StageResult<UXDashboardResearchOutput>> => {
  console.log('\n  [1/3] Research — analyzing PRD requirements...');

  const input: UXDashboardResearchInput = {
    moduleId: config.moduleId,
    taskId: config.taskId,
    prdRequirements: [...config.prdRequirements],
  };

  const provider = createClaudeProvider('claude-opus-4', {
    apiKey,
  });
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

  const provider = createClaudeProvider('claude-sonnet-4', {
    apiKey,
  });
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

/** Extended result from runDesign that exposes the Figma connection for reuse. */
interface DesignStageResult extends StageResult<UXDashboardDesignOutput> {
  readonly disconnectFn?: () => void;
  readonly mcpClient: MCPClient;
  readonly provider: ReturnType<typeof createClaudeProvider>;
}

const runDesign = async (
  config: PipelineRunConfig,
  planningOutput: UXDashboardPlanningOutput,
  apiKey: string,
  outputDir: string,
): Promise<DesignStageResult> => {
  console.log('\n  [3/3] Design — creating Figma components...');

  const input: UXDashboardDesignInput = {
    specRef: planningOutput.specRef,
    moduleId: config.moduleId,
    taskId: config.taskId,
    planningOutput,
  };

  // Priority: env var override > session file > preflight auto-detect > mock
  const envWsUrl = process.env.AGENTFORGE_MCP_FIGMA_WRITE_URL;
  const envChannel = process.env.AGENTFORGE_MCP_FIGMA_CHANNEL;

  let mcpClient: MCPClient | undefined;
  let disconnectFn: (() => void) | undefined;

  if (envWsUrl) {
    // Explicit env var — run channel discovery if no channel specified
    const wsUrl = envWsUrl;
    let channelToUse = envChannel;

    if (!channelToUse) {
      // Discover the Figma plugin's channel via the bridge's /channels endpoint
      const bridgeHttpUrl = wsUrl.replace('ws://', 'http://').replace('wss://', 'https://');
      const channels = await discoverChannels(bridgeHttpUrl);

      if (channels.length > 0) {
        channelToUse = channels[channels.length - 1];
        console.log(`        Figma bridge: ${wsUrl} (discovered channel: ${channelToUse})`);
      } else {
        // No plugin connected — prompt user and poll
        console.log(`        Figma bridge: ${wsUrl}`);
        console.log('');
        console.log('  ┌──────────────────────────────────────────────────────────────┐');
        console.log('  │  No Figma plugin detected.                                  │');
        console.log('  │                                                              │');
        console.log('  │  1. Open Figma                                               │');
        console.log('  │  2. Open the TalkToFigma plugin (Plugins → TalkToFigma)      │');
        console.log('  │  3. Click "Connect" in the plugin                            │');
        console.log('  │                                                              │');
        console.log('  │  Waiting for plugin to connect...                            │');
        console.log('  └──────────────────────────────────────────────────────────────┘');
        console.log('');

        const pollStart = Date.now();
        const maxWaitMs = 120000;
        while (Date.now() - pollStart < maxWaitMs) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const found = await discoverChannels(bridgeHttpUrl);
          if (found.length > 0) {
            channelToUse = found[0];
            console.log(`        Figma plugin connected! (channel: ${channelToUse})`);
            break;
          }
          const elapsed = Math.round((Date.now() - pollStart) / 1000);
          process.stdout.write(`\r        Waiting for Figma plugin... (${elapsed}s)`);
        }

        if (!channelToUse) {
          console.log(`\n        Figma plugin not detected within ${maxWaitMs / 1000}s — using mock MCP`);
          mcpClient = createMockMCPClient();
        }
      }
    } else {
      console.log(`        Figma bridge: ${wsUrl} (channel: ${channelToUse})`);
    }

    if (!mcpClient) {
      const bridge = createFigmaBridgeMCPClient(wsUrl, channelToUse);
      mcpClient = bridge.client;
      disconnectFn = bridge.disconnect;
    }
  } else {
    // Try session file first
    const sessionResult = loadFigmaSession();
    if (sessionResult.ok) {
      const session = sessionResult.value;
      console.log(`        Figma bridge: reusing session (channel: ${session.channel}, doc: ${session.documentName ?? 'unknown'})`);
      const bridge = createFigmaBridgeMCPClient(session.wsUrl, session.channel);
      mcpClient = bridge.client;
      disconnectFn = bridge.disconnect;
    } else {
      // Try preflight auto-detect
      console.log('        Figma bridge: running preflight...');
      const preflightResult = await runFigmaPreflight();
      if (preflightResult.ok) {
        const session = preflightResult.value;
        console.log(`        Figma bridge: connected (channel: ${session.channel}, doc: ${session.documentName ?? 'unknown'})`);
        const bridge = createFigmaBridgeMCPClient(session.wsUrl, session.channel);
        mcpClient = bridge.client;
        disconnectFn = bridge.disconnect;
      } else {
        console.log(`        Figma bridge: preflight failed (${preflightResult.error.message}) — using mock MCP`);
        mcpClient = createMockMCPClient();
      }
    }
  }

  // Fallback — should never reach here unset, but satisfies TypeScript
  if (!mcpClient) {
    mcpClient = createMockMCPClient();
  }

  const provider = createClaudeProvider('claude-sonnet-4', {
    apiKey,
  });
  const context = createPipelineContext(config.taskId, mcpClient);

  const t0 = Date.now();
  const result = await uxDashboardDesignWork(
    input,
    provider as unknown as LLMProviderRef,
    [],
    context,
  );
  const durationMs = Date.now() - t0;

  if (!result.ok) {
    disconnectFn?.();
    throw new Error(`Design failed: ${result.error.message}`);
  }

  const artifactPath = saveArtifact(outputDir, 'figma-design.json', result.value);
  console.log(`        figmaFileId=${result.value.figmaFileId}, ` +
    `nodes=${Object.keys(result.value.figmaNodeIds).length}, ` +
    `breakpoints=${result.value.breakpoints.join(',')}`);

  return { output: result.value, durationMs, artifactPath, disconnectFn, mcpClient, provider };
};

// ============================================================================
// Pipeline orchestrator
// ============================================================================

interface PipelineSummary {
  readonly research: StageResult<UXDashboardResearchOutput>;
  readonly planning: StageResult<UXDashboardPlanningOutput>;
  readonly design: DesignStageResult;
}

const runPipeline = async (
  config: PipelineRunConfig,
  apiKey: string,
  skipToStage?: PipelineStage,
): Promise<PipelineSummary> => {
  const outputDir = ensureOutputDir(config.moduleId);

  // --- Research ---
  let research: StageResult<UXDashboardResearchOutput>;
  if (skipToStage === 'planning' || skipToStage === 'design') {
    console.log('\n  [1/3] Research — loading from artifact...');
    const output = loadArtifact<UXDashboardResearchOutput>(outputDir, 'research-brief.json');
    const artifactPath = join(outputDir, 'research-brief.json');
    research = { output, durationMs: 0, artifactPath };
    console.log(`        (loaded) constraints=${output.designConstraints.length}`);
  } else {
    research = await runResearch(config, apiKey, outputDir);
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
  const design = await runDesign(config, planning.output, apiKey, outputDir);

  return { research, planning, design };
};

// ============================================================================
// Approval summary
// ============================================================================

const printApprovalSummary = (config: PipelineRunConfig, summary: PipelineSummary): void => {
  const { research, planning, design } = summary;
  const figmaUrl = design.output.figmaFileId
    ? `https://www.figma.com/file/${design.output.figmaFileId}`
    : '(mock — no Figma bridge configured)';

  const formatTime = (ms: number): string =>
    ms > 0 ? `${(ms / 1000).toFixed(1)}s` : 'cached';

  console.log('\n' + '='.repeat(72));
  console.log('  PIPELINE COMPLETE — APPROVAL REQUIRED');
  console.log('='.repeat(72));
  console.log(`  Module: ${config.moduleId}`);
  console.log('');
  console.log('  Stages:');
  console.log(`    [OK] Research  (${formatTime(research.durationMs)}) → ${research.artifactPath}`);
  console.log(`    [OK] Planning  (${formatTime(planning.durationMs)}) → ${planning.artifactPath}`);
  console.log(`    [OK] Design    (${formatTime(design.durationMs)}) → ${design.artifactPath}`);
  console.log('');
  console.log('  Figma:');
  console.log(`    File: ${figmaUrl}`);
  console.log(`    Components created: ${Object.keys(design.output.figmaNodeIds).length}`);
  console.log(`    Breakpoints: ${design.output.breakpoints.join(', ') || 'none'}`);
  console.log('');
  console.log('  Review the design in Figma, then approve to continue.');
  console.log('');
  console.log('  To resume with implementation:');
  console.log(`    npx tsx packages/agents-ux/src/scripts/run-module-pipeline.ts \\`);
  console.log(`      --module ${config.moduleId} --stage implementation`);
  console.log('='.repeat(72));
};

// ============================================================================
// CLI argument parsing
// ============================================================================

interface CLIArgs {
  readonly module: string;
  readonly stage?: PipelineStage;
  readonly noWait?: boolean;
}

const parseArgs = (argv: readonly string[]): CLIArgs => {
  let moduleId: string | undefined;
  let stage: PipelineStage | undefined;
  let noWait = false;

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
    } else if (argv[i] === '--no-wait') {
      noWait = true;
    }
  }

  if (!moduleId) {
    console.error('Usage: run-module-pipeline.ts --module <id> [--stage <research|planning|design>] [--no-wait]');
    console.error(`Available modules: ${Object.keys(MODULE_REGISTRY).join(', ')}`);
    process.exit(1);
  }

  return { module: moduleId, stage, noWait };
};

// ============================================================================
// Main
// ============================================================================

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv);

  const config = MODULE_REGISTRY[args.module];
  if (!config) {
    console.error(`Unknown module: ${args.module}`);
    console.error(`Available modules: ${Object.keys(MODULE_REGISTRY).join(', ')}`);
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY must be set');
    process.exit(1);
  }

  console.log('='.repeat(72));
  console.log(`  AgentForge UX Pipeline — ${config.moduleId}`);
  console.log('='.repeat(72));
  if (args.stage) {
    console.log(`  Skipping to: ${args.stage} (loading prior stages from artifacts)`);
  }

  let summary: PipelineSummary | undefined;
  try {
    summary = await runPipeline(config, apiKey, args.stage);
    printApprovalSummary(config, summary);

    // ── Interactive feedback loop ──
    const isTTY = 'isTTY' in process.stdin && (process.stdin as NodeJS.ReadStream).isTTY;
    if (!args.noWait && isTTY && summary.design.mcpClient) {
      const designSystemCtx = buildDesignSystemContext(summary.planning.output, loadDesignSystemPrompt());
      const session = createDesignCollaborationSession(
        summary.design.mcpClient,
        summary.design.provider as unknown as { complete: (prompt: { system: string; messages: { role: 'user' | 'assistant'; content: string }[] }, opts: { model: string; maxTokens: number; temperature: number }) => Promise<import('@agentforge/core').Result<{ content: string }>> },
        summary.design.output,
        designSystemCtx,
      );

      const loopResult = await runDesignFeedbackLoop({
        session,
        initialDesign: summary.design.output,
        input: process.stdin,
        output: process.stdout,
      });

      if (loopResult.changeCount > 0) {
        const outputDir = ensureOutputDir(config.moduleId);
        saveArtifact(outputDir, 'figma-design.json', loopResult.finalDesign);
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
