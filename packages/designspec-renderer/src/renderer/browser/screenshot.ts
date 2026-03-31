/**
 * Takes a screenshot of a DesignSpec v2 by rendering it in a headless browser
 * with real shadcn/ui components.
 *
 * Strategy: pre-build + static serve + JSON file injection.
 * Playwright is imported dynamically — callers must have it installed.
 *
 * Now a thin wrapper around openBrowserSession() for backward compatibility.
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import type { DesignSpecV2 } from '../../types/design-spec-v2.js';
import type { RendererTokens } from '../../types/tokens.js';
import type { CatalogMap } from '../../types/catalog.js';
import { openBrowserSession } from './screenshot-session.js';

export interface ScreenshotOptions {
  /** Viewport width in pixels (default: spec.width or 1440). */
  width?: number;
  /** Output file path for the screenshot. If omitted, only returns buffer. */
  outputPath?: string;
}

export interface ScreenshotResult {
  /** PNG screenshot buffer. */
  screenshot: Buffer;
  /** Rendered HTML string. */
  html: string;
}

/**
 * Render a DesignSpec to a browser screenshot with real shadcn components.
 */
export async function screenshotDesignSpec(
  spec: DesignSpecV2,
  tokens: RendererTokens,
  catalog: CatalogMap,
  options?: ScreenshotOptions,
): Promise<ScreenshotResult> {
  const { session, initial } = await openBrowserSession(spec, tokens, catalog, options);
  await session.close();

  // Write to file if path specified
  if (options?.outputPath) {
    const outDir = path.dirname(options.outputPath);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    writeFileSync(options.outputPath, initial.screenshot);
  }

  return initial;
}
