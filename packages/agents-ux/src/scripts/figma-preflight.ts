/**
 * @module @agentforge/agents-ux/scripts/figma-preflight
 *
 * Pre-flight check for the Figma MCP bridge connection.
 * Auto-detects WebSocket server, starts Docker if needed,
 * discovers the Figma plugin's channel via the bridge's /channels endpoint,
 * and caches session info for reuse.
 *
 * Architecture:
 *   The WebSocket bridge has channels (rooms). The Figma plugin generates
 *   a random channel ID on connect. Our patched bridge exposes GET /channels
 *   to list active channels. The agent queries this endpoint to discover
 *   which channel the plugin is on, then joins it automatically.
 *
 *   Plugin connects → bridge tracks channel → agent queries /channels →
 *   agent joins same channel → both sides communicate.
 *
 * Usage (standalone):
 *   npx tsx packages/agents-ux/src/scripts/figma-preflight.ts
 *
 * Usage (programmatic — fully automated from agent):
 *   import { runFigmaPreflight } from './figma-preflight.js';
 *   const session = await runFigmaPreflight();
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import type { Result } from '@agentforge/core';
import { Ok, Err, createTalkToFigmaTransport } from '@agentforge/core';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SESSION_PATH = '.agentforge/figma-session.json';
const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// Types
// ============================================================================

/** Cached Figma session info. */
export interface FigmaSession {
  readonly wsUrl: string;
  readonly channel: string;
  readonly connectedAt: string;
  readonly documentName?: string;
}

/** Options for the preflight check. */
export interface PreflightOptions {
  /** Path to session file. Default: .agentforge/figma-session.json */
  readonly sessionPath?: string;
  /** WebSocket URL. Default: ws://localhost:3055 */
  readonly wsUrl?: string;
  /** Explicit channel to join (skips discovery). Override via env AGENTFORGE_MCP_FIGMA_CHANNEL. */
  readonly channel?: string;
  /** Maximum session age in ms. Default: 30 minutes */
  readonly maxAgeMs?: number;
  /** Repository root for docker compose. Default: process.cwd() */
  readonly repoRoot?: string;
  /** Timeout for WebSocket check in ms. Default: 5000 */
  readonly wsCheckTimeoutMs?: number;
  /** Maximum time to wait for plugin connection in ms. Default: 120000 */
  readonly pluginWaitMs?: number;
}

// ============================================================================
// Session management
// ============================================================================

/**
 * Load a cached Figma session from disk.
 * Returns Err if file missing, corrupt, or session too old.
 */
export function loadFigmaSession(
  sessionPath?: string,
  maxAgeMs?: number,
): Result<FigmaSession> {
  const filePath = resolve(process.cwd(), sessionPath ?? DEFAULT_SESSION_PATH);
  const maxAge = maxAgeMs ?? DEFAULT_MAX_AGE_MS;

  if (!existsSync(filePath)) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: `Session file not found: ${filePath}`,
      recoverable: true,
    });
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const session = JSON.parse(raw) as FigmaSession;

    if (!session.wsUrl || !session.channel || !session.connectedAt) {
      return Err({
        code: 'INVALID_STATE' as const,
        message: 'Session file is missing required fields',
        recoverable: true,
      });
    }

    const age = Date.now() - new Date(session.connectedAt).getTime();
    if (age > maxAge) {
      return Err({
        code: 'INVALID_STATE' as const,
        message: `Session expired (${Math.round(age / 60000)}min old, max ${Math.round(maxAge / 60000)}min)`,
        recoverable: true,
      });
    }

    return Ok(session);
  } catch {
    return Err({
      code: 'INVALID_STATE' as const,
      message: 'Failed to parse session file',
      recoverable: true,
    });
  }
}

/** Save a session to disk. */
function saveFigmaSession(session: FigmaSession, sessionPath?: string): void {
  const filePath = resolve(process.cwd(), sessionPath ?? DEFAULT_SESSION_PATH);
  const dir = resolve(filePath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(session, null, 2));
}

// ============================================================================
// WebSocket server check
// ============================================================================

/**
 * Check if the WebSocket server is reachable.
 * Opens a connection briefly and closes it.
 */
export async function checkWebSocketServer(
  wsUrl: string,
  timeoutMs?: number,
): Promise<Result<void>> {
  const timeout = timeoutMs ?? 5000;

  return new Promise<Result<void>>((resolve) => {
    const timer = setTimeout(() => {
      resolve(Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: `WebSocket server at ${wsUrl} did not respond within ${timeout}ms`,
        recoverable: true,
      }));
    }, timeout);

    try {
      const ws = new WebSocket(wsUrl);

      ws.addEventListener('open', () => {
        clearTimeout(timer);
        ws.close();
        resolve(Ok(undefined));
      });

      ws.addEventListener('error', () => {
        clearTimeout(timer);
        resolve(Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: `WebSocket server at ${wsUrl} is not reachable`,
          recoverable: true,
        }));
      });
    } catch (err) {
      clearTimeout(timer);
      resolve(Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: `WebSocket check failed: ${err instanceof Error ? err.message : String(err)}`,
        recoverable: true,
      }));
    }
  });
}

// ============================================================================
// Docker auto-start
// ============================================================================

/**
 * Start the figma-bridge Docker container.
 * Runs `docker compose up -d figma-bridge` from the repo root.
 */
export async function startFigmaBridgeDocker(
  repoRoot: string,
): Promise<Result<void>> {
  try {
    execSync('docker compose up -d figma-bridge', {
      cwd: repoRoot,
      stdio: 'pipe',
      timeout: 60000,
    });

    // Wait for container to become healthy
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return Ok(undefined);
  } catch (err) {
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: `Failed to start Docker bridge: ${err instanceof Error ? err.message : String(err)}`,
      recoverable: true,
    });
  }
}

// ============================================================================
// Channel discovery
// ============================================================================

/**
 * Discover active channels from the patched bridge's /channels endpoint.
 * Returns the list of channel names that have connected clients.
 *
 * Falls back to empty array if the endpoint is not available (unpatched bridge).
 */
export async function discoverChannels(bridgeHttpUrl: string): Promise<string[]> {
  try {
    const response = await fetch(`${bridgeHttpUrl}/channels`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return [];
    const data = await response.json() as { channels?: string[] };
    return data.channels ?? [];
  } catch {
    return [];
  }
}

// ============================================================================
// System notification
// ============================================================================

/**
 * Send a system notification to alert the user.
 * Falls back silently if notifications are unavailable.
 */
function sendSystemNotification(title: string, message: string): void {
  try {
    if (process.platform === 'darwin') {
      execSync(
        `osascript -e 'display notification "${message}" with title "${title}"'`,
        { stdio: 'pipe', timeout: 5000 },
      );
    }
    if (process.platform === 'linux') {
      execSync(`notify-send "${title}" "${message}"`, { stdio: 'pipe', timeout: 5000 });
    }
  } catch {
    // Best-effort
  }
}

// ============================================================================
// Full preflight
// ============================================================================

/**
 * Run the full Figma preflight check:
 *
 * 1. Try reusing existing session (< 30 min old)
 * 2. Check WS server → auto-start Docker if needed
 * 3. Discover the plugin's channel via GET /channels
 *    - If no channels found, notify user to open the plugin and poll
 * 4. Join the discovered channel
 * 5. Validate with get_document_info
 * 6. Save session for future reuse
 */
export async function runFigmaPreflight(
  options?: PreflightOptions,
): Promise<Result<FigmaSession>> {
  const wsUrl = options?.wsUrl ?? 'ws://localhost:3055';
  const sessionPath = options?.sessionPath ?? DEFAULT_SESSION_PATH;
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const repoRoot = options?.repoRoot ?? process.cwd();
  const pluginWaitMs = options?.pluginWaitMs ?? 120000;

  // Explicit channel override (env var or option)
  const explicitChannel = options?.channel ?? process.env.AGENTFORGE_MCP_FIGMA_CHANNEL;

  // 1. Try reusing existing session
  const existingSession = loadFigmaSession(sessionPath, maxAgeMs);
  if (existingSession.ok) {
    const wsCheck = await checkWebSocketServer(existingSession.value.wsUrl, options?.wsCheckTimeoutMs);
    if (wsCheck.ok) {
      // eslint-disable-next-line no-console
      console.log(`  [preflight] Reusing session (channel: ${existingSession.value.channel}, doc: ${existingSession.value.documentName})`);
      return existingSession;
    }
    // eslint-disable-next-line no-console
    console.log('  [preflight] Cached session invalid, reconnecting...');
  }

  // 2. Check WS server
  let wsCheck = await checkWebSocketServer(wsUrl, options?.wsCheckTimeoutMs);
  if (!wsCheck.ok) {
    // eslint-disable-next-line no-console
    console.log('  [preflight] WebSocket server not running, starting Docker...');
    const dockerResult = await startFigmaBridgeDocker(repoRoot);
    if (!dockerResult.ok) {
      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: `Cannot start Figma bridge: ${dockerResult.error.message}`,
        recoverable: true,
      });
    }

    wsCheck = await checkWebSocketServer(wsUrl, options?.wsCheckTimeoutMs);
    if (!wsCheck.ok) {
      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: 'WebSocket server still not reachable after Docker start',
        recoverable: true,
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(`  [preflight] WebSocket server OK at ${wsUrl}`);

  // 3. Discover channel
  const bridgeHttpUrl = wsUrl.replace('ws://', 'http://').replace('wss://', 'https://');
  let channelToJoin: string | undefined = explicitChannel;

  if (!channelToJoin) {
    // Try channel discovery endpoint (available on our patched Docker bridge)
    const channels = await discoverChannels(bridgeHttpUrl);

    if (channels.length === 1) {
      channelToJoin = channels[0];
      // eslint-disable-next-line no-console
      console.log(`  [preflight] Auto-discovered plugin channel: ${channelToJoin}`);
    } else if (channels.length > 1) {
      // Multiple channels — pick the most recent (last one)
      channelToJoin = channels[channels.length - 1];
      // eslint-disable-next-line no-console
      console.log(`  [preflight] Multiple channels found (${channels.join(', ')}), using: ${channelToJoin}`);
    } else {
      // No channels yet — plugin not connected. Notify user and poll.
      // eslint-disable-next-line no-console
      console.log('  [preflight] No active Figma plugin detected.');
      sendSystemNotification(
        'AgentForge — Figma Connection Needed',
        'Open Figma and start the TalkToFigma plugin to continue.',
      );
      // eslint-disable-next-line no-console
      console.log('  [preflight] Open Figma > Plugins > TalkToFigma > Connect');
      // eslint-disable-next-line no-console
      console.log('  [preflight] Waiting for plugin to connect...');

      const pollStart = Date.now();
      while (Date.now() - pollStart < pluginWaitMs) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const found = await discoverChannels(bridgeHttpUrl);
        if (found.length > 0) {
          channelToJoin = found[0];
          // eslint-disable-next-line no-console
          console.log(`  [preflight] Plugin connected! Channel: ${channelToJoin}`);
          break;
        }
        const elapsed = Math.round((Date.now() - pollStart) / 1000);
        // eslint-disable-next-line no-console
        console.log(`  [preflight] Still waiting... (${elapsed}s)`);
      }
    }
  }

  if (!channelToJoin) {
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: `No Figma plugin detected within ${pluginWaitMs / 1000}s. Open the TalkToFigma plugin in Figma.`,
      recoverable: true,
    });
  }

  // 4. Join the discovered channel
  const { connection } = createTalkToFigmaTransport({
    websocketUrl: wsUrl,
    channel: channelToJoin,
  });
  const connectResult = await connection.connect();
  if (!connectResult.ok) {
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: `Failed to join channel ${channelToJoin}: ${connectResult.error.message}`,
      recoverable: true,
    });
  }

  // eslint-disable-next-line no-console
  console.log(`  [preflight] Joined channel: ${connection.channel}`);

  // 5. Validate plugin responds
  const docResult = await connection.callTool('get_document_info', {});
  let documentName = 'Unknown';
  if (docResult.ok) {
    const docInfo = docResult.value as Record<string, unknown>;
    documentName = String(docInfo.name ?? docInfo.documentName ?? 'Unknown');
    // eslint-disable-next-line no-console
    console.log(`  [preflight] Document: "${documentName}"`);
    sendSystemNotification('AgentForge', `Connected to Figma: ${documentName}`);
  } else {
    // eslint-disable-next-line no-console
    console.log('  [preflight] Plugin on channel but no document info — continuing anyway');
  }

  // 6. Save session
  const session: FigmaSession = {
    wsUrl,
    channel: connection.channel,
    connectedAt: new Date().toISOString(),
    documentName,
  };

  saveFigmaSession(session, sessionPath);
  // eslint-disable-next-line no-console
  console.log(`  [preflight] Session saved to ${sessionPath}`);

  connection.disconnect();

  return Ok(session);
}

// ============================================================================
// CLI entry point
// ============================================================================

if (process.argv[1]?.endsWith('figma-preflight.ts') || process.argv[1]?.endsWith('figma-preflight.js')) {
  runFigmaPreflight()
    .then((result) => {
      if (result.ok) {
        // eslint-disable-next-line no-console
        console.log('\n  Preflight complete!');
        // eslint-disable-next-line no-console
        console.log(`  Channel: ${result.value.channel}`);
        // eslint-disable-next-line no-console
        console.log(`  Document: ${result.value.documentName ?? 'unknown'}`);
        process.exit(0);
      } else {
        // eslint-disable-next-line no-console
        console.error(`\n  Preflight failed: ${result.error.message}`);
        process.exit(1);
      }
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Unhandled error:', err);
      process.exit(1);
    });
}
