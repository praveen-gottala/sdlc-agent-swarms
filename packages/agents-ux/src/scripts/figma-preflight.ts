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
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import type { Result } from '@agentforge/core';
import { Ok, Err, createTalkToFigmaTransport, DEFAULT_MAX_AGE_MS, DEFAULT_SERVICE_URLS } from '@agentforge/core';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SESSION_PATH = '.agentforge/figma-session.json';

// ============================================================================
// Types
// ============================================================================

/** Cached Figma session info. */
export interface FigmaSession {
  readonly wsUrl: string;
  readonly channel: string;
  readonly connectedAt: string;
  readonly documentName?: string;
  readonly supportedTools?: readonly string[];
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
// Plugin auto-build
// ============================================================================

/** Path to the built plugin directory, relative to repo root. */
export const PLUGIN_DIST_DIR = 'docker/talk-to-figma/figma-plugin/dist';
/** Path to the build metadata written by build-figma-plugin.sh. */
const PLUGIN_BUILD_META = `${PLUGIN_DIST_DIR}/.build-meta.json`;
/** Path to the plugin manifest, relative to repo root. */
export const PLUGIN_MANIFEST_REL = `${PLUGIN_DIST_DIR}/manifest.json`;
/** Path to the build script, relative to repo root. */
const PLUGIN_BUILD_SCRIPT = 'docker/talk-to-figma/build-figma-plugin.sh';
/** Path to the patch source, relative to repo root. */
const PLUGIN_PATCH_SOURCE = 'docker/talk-to-figma/patch-plugin-commands.js';

/** Build metadata written by the build script. */
interface BuildMeta {
  readonly upstreamSha: string;
  readonly patchHash: string;
  readonly builtAt: string;
}

/**
 * Compute SHA-256 hash of a file's contents.
 */
function fileHash(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Check if the plugin dist is stale.
 *
 * Stale when:
 * - dist/ doesn't exist at all (no build meta)
 * - patch-plugin-commands.js hash differs from what was used to build
 *
 * The build script writes .build-meta.json with the upstream SHA and
 * patch hash used for the build, so we can detect drift in either.
 */
function isPluginDistStale(repoRoot: string): boolean {
  const metaPath = resolve(repoRoot, PLUGIN_BUILD_META);
  if (!existsSync(metaPath)) return true;

  const patchPath = resolve(repoRoot, PLUGIN_PATCH_SOURCE);
  if (!existsSync(patchPath)) return false;

  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as BuildMeta;
    const currentPatchHash = fileHash(patchPath);
    return meta.patchHash !== currentPatchHash;
  } catch {
    // Corrupt meta file — rebuild
    return true;
  }
}

/** Result of plugin build check. */
export interface PluginBuildResult {
  /** Whether a rebuild was performed (vs already up to date). */
  readonly rebuilt: boolean;
  /** Whether the rebuild was due to a patch update (vs first build). */
  readonly wasUpdate: boolean;
}

/**
 * Ensure the patched Figma plugin has been built and is up to date.
 * Rebuilds if `dist/code.js` doesn't exist or if `patch-plugin-commands.js`
 * has been modified since the last build.
 *
 * Returns `rebuilt: true` when the dist was regenerated. Callers should
 * prompt the user to re-run the plugin in Figma since Figma only reads
 * code.js when the plugin starts — a disk rebuild doesn't hot-reload.
 */
export function ensureFigmaPluginBuilt(repoRoot: string): Result<PluginBuildResult> {
  if (!isPluginDistStale(repoRoot)) {
    return Ok({ rebuilt: false, wasUpdate: false });
  }

  const scriptPath = resolve(repoRoot, PLUGIN_BUILD_SCRIPT);
  if (!existsSync(scriptPath)) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: `Plugin build script not found: ${scriptPath}`,
      recoverable: true,
    });
  }

  const metaPath = resolve(repoRoot, PLUGIN_BUILD_META);
  const wasUpdate = existsSync(metaPath);
  const reason = wasUpdate ? 'patch changed, rebuilding' : 'not found, building';
  // eslint-disable-next-line no-console
  console.log(`  [preflight] Patched Figma plugin ${reason}...`);
  try {
    execSync(`bash "${scriptPath}"`, {
      cwd: repoRoot,
      stdio: 'pipe',
      timeout: 120000,
    });
    // eslint-disable-next-line no-console
    console.log('  [preflight] Plugin built successfully');
    return Ok({ rebuilt: true, wasUpdate });
  } catch (err) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: `Plugin build failed: ${err instanceof Error ? err.message : String(err)}`,
      recoverable: true,
    });
  }
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
// Tool discovery
// ============================================================================

/**
 * Discover supported tools from the patched bridge's /tools endpoint.
 * Returns the list of verified tool names the bridge supports.
 *
 * Falls back to empty array if the endpoint is not available (unpatched bridge).
 */
export async function discoverTools(bridgeHttpUrl: string): Promise<string[]> {
  try {
    const response = await fetch(`${bridgeHttpUrl}/tools`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return [];
    const data = await response.json() as { tools?: string[] };
    return data.tools ?? [];
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
 * 1b. Auto-build patched Figma plugin if dist/ not present
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
  const wsUrl = options?.wsUrl ?? DEFAULT_SERVICE_URLS.figmaWsBridge;
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

  // 1b. Auto-build patched Figma plugin if not present or outdated
  const pluginBuild = ensureFigmaPluginBuilt(repoRoot);
  let pluginRebuilt = false;
  if (!pluginBuild.ok) {
    // Non-fatal — warn but continue (plugin may have been built manually elsewhere)
    // eslint-disable-next-line no-console
    console.warn(`  [preflight] Plugin build warning: ${pluginBuild.error.message}`);
  } else if (pluginBuild.value.rebuilt) {
    pluginRebuilt = true;
    const manifestAbsPath = resolve(repoRoot, PLUGIN_MANIFEST_REL);
    if (pluginBuild.value.wasUpdate) {
      // Patch was updated — plugin in Figma is running stale code
      // eslint-disable-next-line no-console
      console.log('  [preflight] Plugin commands were updated and rebuilt.');
      // eslint-disable-next-line no-console
      console.log('  [preflight] Please re-run the plugin in Figma to load the new version.');
    } else {
      // First build — user needs to import the manifest into Figma
      // eslint-disable-next-line no-console
      console.log('  [preflight] Load in Figma: Plugins > Development > Import plugin from manifest...');
      // eslint-disable-next-line no-console
      console.log(`  [preflight] Select: ${manifestAbsPath}`);
    }
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
      const manifestAbsPath = resolve(repoRoot, PLUGIN_MANIFEST_REL);
      // eslint-disable-next-line no-console
      console.log('  [preflight] No active Figma plugin detected.');
      if (pluginRebuilt) {
        // eslint-disable-next-line no-console
        console.log('  [preflight] Plugin was just rebuilt — re-run it in Figma to pick up changes.');
      } else {
        // eslint-disable-next-line no-console
        console.log(`  [preflight] Load plugin: Figma > Plugins > Development > Import plugin from manifest...`);
        // eslint-disable-next-line no-console
        console.log(`  [preflight] Manifest: ${manifestAbsPath}`);
      }
      sendSystemNotification(
        'AgentForge — Figma Connection Needed',
        pluginRebuilt
          ? 'Plugin rebuilt — re-run TalkToFigma in Figma and click Connect.'
          : 'Load the patched plugin in Figma and click Connect.',
      );
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

  // 6. Discover supported tools and validate plugin has custom commands
  const supportedTools = await discoverTools(bridgeHttpUrl);
  if (supportedTools.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`  [preflight] Discovered ${supportedTools.length} supported tools from bridge`);
  }

  // Validate the plugin supports AgentForge custom commands by sending a
  // lightweight test command. If the plugin returns "Unknown command", the
  // user is running the unpatched upstream plugin and needs to rebuild.
  const customCommandCheck = await connection.callTool('get_pages', {});
  if (!customCommandCheck.ok) {
    const errMsg = customCommandCheck.error?.message ?? '';
    if (errMsg.includes('Unknown command')) {
      // eslint-disable-next-line no-console
      console.warn('  [preflight] WARNING: Figma plugin is missing AgentForge custom commands.');
      // eslint-disable-next-line no-console
      console.warn('  [preflight] Run "npm run figma:build-plugin" and reload the plugin in Figma.');
      // eslint-disable-next-line no-console
      console.warn('  [preflight] See docs/cli/design.md for setup instructions.');
    }
  }

  // 7. Save session
  const session: FigmaSession = {
    wsUrl,
    channel: connection.channel,
    connectedAt: new Date().toISOString(),
    documentName,
    ...(supportedTools.length > 0 ? { supportedTools } : {}),
  };

  saveFigmaSession(session, sessionPath);
  // eslint-disable-next-line no-console
  console.log(`  [preflight] Session saved to ${sessionPath} (step 7)`);

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
