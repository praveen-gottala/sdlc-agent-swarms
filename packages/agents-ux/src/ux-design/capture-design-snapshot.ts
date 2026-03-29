/**
 * @module @agentforge/agents-ux/ux-design/capture-design-snapshot
 *
 * Tool-agnostic design snapshot capture. Works with both Figma and Penpot
 * via a capture function callback. Saves screenshots as PNG files and
 * extracts per-component properties from the design tool.
 *
 * Used by both uxDesignWork (Figma) and penpotDesignWork (Penpot)
 * after the design stage completes.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Result, MCPClient } from '@agentforge/core';
import type { ComponentSnapshot, DesignSnapshotData, ScreenshotResult } from '../types.js';

// ============================================================================
// Types
// ============================================================================

/** Which design tool captured the snapshot — used for directory naming. */
export type DesignToolName = 'figma' | 'penpot';

/** Function that captures a screenshot of a single node. */
export type CaptureScreenshotFn = (
  mcpClient: MCPClient,
  nodeId: string,
) => Promise<Result<ScreenshotResult>>;

/** Function that extracts properties/styles from a single node. */
export type ExtractPropertiesFn = (
  mcpClient: MCPClient,
  nodeId: string,
) => Promise<Result<Record<string, unknown>>>;

/** Configuration for the snapshot capture. */
export interface CaptureDesignSnapshotConfig {
  /** Design tool name (determines screenshot subdirectory). */
  readonly tool: DesignToolName;
  /** Module ID (determines preview directory). */
  readonly moduleId: string;
  /** Project root directory. */
  readonly projectRoot: string;
  /** Map of component name → node ID. */
  readonly nodeIds: Readonly<Record<string, string>>;
  /** Map of component name → node type (FRAME, TEXT, etc.). */
  readonly nodeTypes?: Readonly<Record<string, string>>;
  /** Connected MCP client. */
  readonly mcpClient: MCPClient;
  /** Function to capture a screenshot of a node. */
  readonly captureScreenshot: CaptureScreenshotFn;
  /** Function to extract properties from a node. Optional — if not provided, properties are skipped. */
  readonly extractProperties?: ExtractPropertiesFn;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Capture a design snapshot — screenshots + properties for all components.
 *
 * Saves screenshots as PNG files to:
 *   .agentforge/previews/<moduleId>/screenshots/<tool>/root.png
 *   .agentforge/previews/<moduleId>/screenshots/<tool>/<ComponentName>.png
 *
 * Returns snapshot metadata (paths + properties) for inclusion in the
 * design output JSON.
 */
export async function captureDesignSnapshot(
  config: CaptureDesignSnapshotConfig,
): Promise<DesignSnapshotData> {
  const {
    tool,
    moduleId,
    projectRoot,
    nodeIds,
    nodeTypes,
    mcpClient,
    captureScreenshot,
    extractProperties,
  } = config;

  let screenshotPath: string | undefined;
  const componentSnapshots: ComponentSnapshot[] = [];

  const screenshotsDir = resolve(
    projectRoot,
    '.agentforge',
    'previews',
    moduleId,
    'screenshots',
    tool,
  );

  const rootNodeId = Object.values(nodeIds)[0];
  if (!rootNodeId) {
    return {};
  }

  // eslint-disable-next-line no-console
  console.log(`\n        [Phase D] Capturing ${tool} design snapshot`);

  // Ensure screenshots directory exists
  if (!existsSync(screenshotsDir)) {
    mkdirSync(screenshotsDir, { recursive: true });
  }

  // Full-page screenshot of root component
  const rootResult = await captureScreenshot(mcpClient, rootNodeId);
  if (rootResult.ok) {
    const pngPath = join(screenshotsDir, 'root.png');
    writeFileSync(pngPath, Buffer.from(rootResult.value.base64, 'base64'));
    screenshotPath = `screenshots/${tool}/root.png`;
    // eslint-disable-next-line no-console
    console.log(`        [snapshot] Root screenshot saved: ${pngPath}`);
  } else {
    // eslint-disable-next-line no-console
    console.warn(`        [snapshot] Root screenshot failed: ${rootResult.error.message}`);
  }

  // Per-component: capture screenshot + extract properties
  // Fail-fast: if too many consecutive exports fail, stop trying (stale IDs)
  const MAX_CONSECUTIVE_FAILURES = 5;
  let consecutiveFailures = 0;

  for (const [name, nodeId] of Object.entries(nodeIds)) {
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      // eslint-disable-next-line no-console
      console.warn(`        [snapshot] Stopping exports — ${MAX_CONSECUTIVE_FAILURES} consecutive failures (likely stale node IDs after corrections)`);
      break;
    }

    const snap: ComponentSnapshot = {
      nodeId,
      name,
      nodeType: nodeTypes?.[name],
    };

    // Extract properties (styles, layout, text)
    let properties: Record<string, unknown> | undefined;
    if (extractProperties) {
      const propsResult = await extractProperties(mcpClient, nodeId);
      if (propsResult.ok) {
        properties = propsResult.value;
      }
    }

    // Capture component screenshot
    let componentScreenshotPath: string | undefined;
    const compResult = await captureScreenshot(mcpClient, nodeId);
    if (compResult.ok) {
      consecutiveFailures = 0;
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const pngPath = join(screenshotsDir, `${safeName}.png`);
      writeFileSync(pngPath, Buffer.from(compResult.value.base64, 'base64'));
      componentScreenshotPath = `screenshots/${tool}/${safeName}.png`;
    } else {
      consecutiveFailures++;
    }

    componentSnapshots.push({
      ...snap,
      ...(componentScreenshotPath ? { screenshotPath: componentScreenshotPath } : {}),
      ...(properties ? { properties } : {}),
    });
  }

  // eslint-disable-next-line no-console
  console.log(`        [snapshot] Captured ${componentSnapshots.length} ${tool} components (screenshots + properties)`);

  return {
    ...(screenshotPath ? { screenshotPath } : {}),
    ...(componentSnapshots.length > 0 ? { componentSnapshots } : {}),
  };
}
