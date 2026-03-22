/**
 * @module @agentforge/agents-ux/ux-design/figma-screenshot
 *
 * Captures screenshots of Figma nodes via the Figma REST API.
 * Used by the visual self-correction loop to evaluate design output.
 */

import type { Result } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';

/** Result of a successful screenshot capture. */
export interface ScreenshotResult {
  readonly imageUrl: string;
  readonly base64: string;
}

/**
 * Capture a screenshot of a Figma node via the Figma REST API.
 *
 * @param figmaToken - Figma Personal Access Token
 * @param fileId - Figma file ID
 * @param nodeId - Node ID to capture (e.g. "123:456")
 * @param scale - Image scale factor (default: 2)
 * @returns base64-encoded PNG screenshot
 */
export async function captureFigmaScreenshot(
  figmaToken: string,
  fileId: string,
  nodeId: string,
  scale?: number,
): Promise<Result<ScreenshotResult>> {
  const encodedNodeId = encodeURIComponent(nodeId);
  const imageScale = scale ?? 2;
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
        if (attempt < 3) {
          // Figma may need time to render newly created nodes — retry with increasing delay
          const delayMs = (attempt + 1) * 3000; // 3s, 6s, 9s
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return fetchImage(attempt + 1);
        }
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: `Figma returned null image URL for node ${nodeId} after ${attempt + 1} attempts`,
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
