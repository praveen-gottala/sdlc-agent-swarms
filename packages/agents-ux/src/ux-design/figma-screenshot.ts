/**
 * @module @agentforge/agents-ux/ux-design/figma-screenshot
 *
 * Captures screenshots of Figma nodes. Prefers the TalkToFigma bridge
 * `export_node_as_image` (reads directly from the local editor) so that
 * newly-created nodes are immediately available without waiting for
 * cloud sync. Falls back to the Figma REST API when no MCP client is
 * provided.
 */

import type { Result, MCPClient } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';
import type { ScreenshotResult } from '../types.js';

// Re-export for backward compatibility
export type { ScreenshotResult } from '../types.js';

/**
 * Capture a screenshot of a Figma node via the TalkToFigma bridge plugin.
 *
 * This reads directly from the local Figma editor — no cloud sync
 * needed — so freshly-created nodes are always available.
 *
 * @param mcpClient - MCP client connected to the TalkToFigma bridge
 * @param nodeId - Node ID to capture (e.g. "123:456")
 * @param scale - Image scale factor (default: 2)
 * @returns base64-encoded PNG screenshot
 */
export async function captureFigmaScreenshotViaBridge(
  mcpClient: MCPClient,
  nodeId: string,
  scale?: number,
): Promise<Result<ScreenshotResult>> {
  try {
    const exportResult = await mcpClient.callTool('figma-write', 'export_node_as_image', {
      nodeId,
      format: 'PNG',
      scale: scale ?? 2,
    });

    if (!exportResult.ok) {
      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: `Bridge export_node_as_image failed: ${exportResult.error.message}`,
        recoverable: true,
      });
    }

    const result = exportResult.value as Record<string, unknown>;
    const imageData = (result.imageData ?? result.data ?? result.base64 ?? '') as string;
    const imageUrl = (result.imageUrl ?? result.url ?? '') as string;

    if (!imageData && !imageUrl) {
      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: `Bridge export_node_as_image returned no image data (keys: ${Object.keys(result).join(', ')})`,
        recoverable: false,
      });
    }

    // If we got base64 data directly, use it
    if (imageData) {
      // Strip data URI prefix if present (e.g. "data:image/png;base64,...")
      const base64 = imageData.includes(',') ? imageData.split(',')[1] : imageData;
      return Ok({ imageUrl: imageUrl || 'bridge://export', base64 });
    }

    // Otherwise fetch the URL and convert
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: `Failed to fetch exported image from ${imageUrl}: ${imageResponse.status}`,
        recoverable: true,
      });
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return Ok({ imageUrl, base64 });
  } catch (err) {
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: `Bridge screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
      recoverable: true,
    });
  }
}

/**
 * Capture a screenshot of a Figma node via the Figma REST API.
 *
 * NOTE: The REST API reads from Figma's cloud state, not the local editor.
 * Nodes created via the plugin may not be available until the file syncs.
 * Prefer `captureFigmaScreenshotViaBridge` when an MCP client is available.
 *
 * @param figmaToken - Figma Personal Access Token
 * @param fileId - Figma file ID
 * @param nodeId - Node ID to capture (e.g. "123:456")
 * @param scale - Image scale factor (default: 2)
 * @param maxAttempts - Number of retry attempts (default: 6)
 * @returns base64-encoded PNG screenshot
 */
export async function captureFigmaScreenshot(
  figmaToken: string,
  fileId: string,
  nodeId: string,
  scale?: number,
  maxAttempts?: number,
): Promise<Result<ScreenshotResult>> {
  const encodedNodeId = encodeURIComponent(nodeId);
  const imageScale = scale ?? 2;
  const totalAttempts = maxAttempts ?? 6;
  const apiUrl = `https://api.figma.com/v1/images/${fileId}?ids=${encodedNodeId}&format=png&scale=${imageScale}`;

  const fetchImage = async (attempt: number): Promise<Result<ScreenshotResult>> => {
    try {
      const response = await fetch(apiUrl, {
        headers: { 'X-Figma-Token': figmaToken },
      });

      if (!response.ok) {
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: `Figma API returned ${response.status}: ${response.statusText}`,
          recoverable: response.status === 429,
        });
      }

      const data = await response.json() as { images?: Record<string, string | null>; err?: string };

      if (data.err) {
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: `Figma API error: ${data.err}`,
          recoverable: true,
        });
      }

      const imageUrl = data.images?.[nodeId] ?? null;

      if (!imageUrl) {
        if (attempt < totalAttempts - 1) {
          const delayMs = Math.min((attempt + 1) * 3000, 15000);
          // eslint-disable-next-line no-console
          console.warn(`        [screenshot] Attempt ${attempt + 1}/${totalAttempts}: null image URL for node ${nodeId}, retrying in ${delayMs / 1000}s (keys: ${Object.keys(data.images ?? {}).join(', ')})`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return fetchImage(attempt + 1);
        }
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: `Figma returned null image URL for node ${nodeId} after ${attempt + 1} attempts (response keys: ${Object.keys(data.images ?? {}).join(', ')})`,
          recoverable: false,
        });
      }

      // Fetch the actual image and convert to base64
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: `Failed to fetch image from ${imageUrl}: ${imageResponse.status}`,
          recoverable: true,
        });
      }

      const arrayBuffer = await imageResponse.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');

      return Ok({ imageUrl, base64 });
    } catch (err) {
      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: `Figma screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
        recoverable: true,
      });
    }
  };

  return fetchImage(0);
}
