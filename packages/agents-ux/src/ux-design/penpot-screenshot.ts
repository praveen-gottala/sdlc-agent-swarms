/**
 * @module @agentforge/agents-ux/ux-design/penpot-screenshot
 *
 * Captures screenshots of Penpot design nodes via the MCP server.
 * Uses the adapter's captureScreenshot method which tries multiple
 * export tool names discovered dynamically.
 */

import type { Result, MCPClient } from '@agentforge/core';
import { createPenpotAdapter } from '@agentforge/core';
import type { ScreenshotResult } from '../types.js';

/**
 * Capture a screenshot of a Penpot node via the MCP server.
 *
 * @param mcpClient - MCP client connected to Penpot MCP server
 * @param nodeId - Node ID to capture
 * @returns base64-encoded PNG screenshot
 */
export async function capturePenpotScreenshot(
  mcpClient: MCPClient,
  nodeId: string,
): Promise<Result<ScreenshotResult>> {
  const adapter = createPenpotAdapter();
  return adapter.captureScreenshot(mcpClient, nodeId);
}
