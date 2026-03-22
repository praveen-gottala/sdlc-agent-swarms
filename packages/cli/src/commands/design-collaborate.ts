/**
 * @module @agentforge/cli/commands/design-collaborate
 *
 * The `agentforge design:collaborate --module <id>` command.
 * Loads an existing Figma design artifact and enters the interactive
 * feedback loop for human-agent collaboration without re-running the pipeline.
 */

import { resolve, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { successMsg, errorMsg, infoMsg, warnMsg } from '../formatter.js';
import {
  Ok,
  createTalkToFigmaTransport,
  TALK_TO_FIGMA_TOOLS,
} from '@agentforge/core';
import type { MCPClient } from '@agentforge/core';
import { createClaudeProvider } from '@agentforge/providers';
import {
  loadFigmaSession,
  runFigmaPreflight,
  discoverChannels,
  createDesignCollaborationSession,
  runDesignFeedbackLoop,
  createReviewCallback,
  buildDesignSystemContext,
  loadDesignSystemPrompt,
} from '@agentforge/agents-ux';
import type { UXDashboardDesignOutput, DesignSystemContext } from '@agentforge/agents-ux';

// ============================================================================
// Types
// ============================================================================

/** Options for the design:collaborate command. */
export interface DesignCollaborateOptions {
  /** Module ID to load the design artifact for. */
  readonly module: string;
}

// ============================================================================
// Helpers
// ============================================================================

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

// ============================================================================
// Command
// ============================================================================

/**
 * Execute the design:collaborate command.
 * Loads an existing design artifact and enters the feedback loop.
 */
export async function designCollaborateCommand(
  output: NodeJS.WritableStream = process.stdout,
  options: DesignCollaborateOptions,
): Promise<void> {
  const { module: moduleId } = options;
  const outputDir = resolve(process.cwd(), '.agentforge', 'previews', moduleId);
  const artifactPath = join(outputDir, 'figma-design.json');

  // 1. Load existing design artifact
  if (!existsSync(artifactPath)) {
    output.write(errorMsg(`No design artifact found at ${artifactPath}\n`));
    output.write(infoMsg('  Run "agentforge design:figma" first to create a design.\n'));
    process.exitCode = 1;
    return;
  }

  let designOutput: UXDashboardDesignOutput;
  try {
    designOutput = JSON.parse(readFileSync(artifactPath, 'utf-8')) as UXDashboardDesignOutput;
  } catch {
    output.write(errorMsg(`Failed to parse design artifact at ${artifactPath}\n`));
    process.exitCode = 1;
    return;
  }

  output.write(infoMsg('='.repeat(60) + '\n'));
  output.write(infoMsg('  AgentForge Design Collaboration\n'));
  output.write(infoMsg('='.repeat(60) + '\n'));
  output.write(infoMsg(`  Module: ${moduleId}\n`));
  output.write(infoMsg(`  Components: ${Object.keys(designOutput.figmaNodeIds).length}\n`));
  output.write(infoMsg(`  Figma File: ${designOutput.figmaFileId}\n`));
  output.write(infoMsg('='.repeat(60) + '\n'));

  // 2. Validate API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    output.write(errorMsg('ANTHROPIC_API_KEY must be set\n'));
    process.exitCode = 1;
    return;
  }

  // 3. Connect to Figma
  let mcpClient: MCPClient;
  let disconnectFn: (() => void) | undefined;

  const envWsUrl = process.env.AGENTFORGE_MCP_FIGMA_WRITE_URL;
  const envChannel = process.env.AGENTFORGE_MCP_FIGMA_CHANNEL;

  if (envWsUrl) {
    let channelToUse = envChannel;

    if (!channelToUse) {
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
        output.write(errorMsg(`  Figma: ${preflightResult.error.message}\n`));
        output.write(errorMsg('  Cannot collaborate without a Figma connection.\n'));
        process.exitCode = 1;
        return;
      }
    }
  }

  // 4. Create collaboration session and enter feedback loop
  const provider = createClaudeProvider('claude-sonnet-4', { apiKey });

  // Build design system context from planning artifact (graceful degradation)
  const planningPath = join(outputDir, 'planning-spec.json');
  let designSystemCtx: DesignSystemContext | undefined;
  if (existsSync(planningPath)) {
    try {
      const planningData = JSON.parse(readFileSync(planningPath, 'utf-8')) as {
        componentTree: { name: string; props: string[]; children: unknown[] }[];
        tokenBindings: Record<string, string>;
      };
      designSystemCtx = buildDesignSystemContext(planningData, loadDesignSystemPrompt());
    } catch {
      // Graceful degradation — proceed without design system context
    }
  }

  const session = createDesignCollaborationSession(
    mcpClient,
    provider as unknown as { complete: (prompt: { system: string; messages: { role: 'user' | 'assistant'; content: string }[] }, opts: { model: string; maxTokens: number; temperature: number }) => Promise<import('@agentforge/core').Result<{ content: string }>> },
    designOutput,
    designSystemCtx,
  );

  // Build review callback (requires FIGMA_TOKEN + FILE_ID)
  const planningSpec = existsSync(planningPath)
    ? readFileSync(planningPath, 'utf-8')
    : JSON.stringify(designOutput);
  const reviewFn = createReviewCallback(provider as Parameters<typeof createReviewCallback>[0], planningSpec);

  if (reviewFn) {
    output.write(infoMsg('  Review: enabled (screenshot + evaluation after agent changes)\n'));
  } else {
    output.write(infoMsg('  Review: disabled (set AGENTFORGE_MCP_FIGMA_TOKEN and AGENTFORGE_MCP_FIGMA_FILE_ID to enable)\n'));
  }

  try {
    const loopResult = await runDesignFeedbackLoop({
      session,
      initialDesign: designOutput,
      input: process.stdin,
      output,
      reviewFn,
    });

    if (loopResult.changeCount > 0) {
      writeFileSync(artifactPath, JSON.stringify(loopResult.finalDesign, null, 2));
      output.write(infoMsg(`  Updated artifact with ${loopResult.changeCount} change(s).\n`));
    }

    if (loopResult.approved) {
      output.write(successMsg('  Design approved.\n'));
    } else {
      output.write(warnMsg('  Design not approved.\n'));
    }
  } finally {
    disconnectFn?.();
  }
}
