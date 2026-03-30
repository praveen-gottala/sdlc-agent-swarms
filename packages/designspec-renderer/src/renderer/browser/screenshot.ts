/**
 * Takes a screenshot of a DesignSpec v2 by rendering it in a headless browser
 * with real shadcn/ui components.
 *
 * Strategy: pre-build + static serve + JSON file injection.
 * Playwright is imported dynamically — callers must have it installed.
 */
import { createServer, type Server } from 'http';
import { existsSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { ensureBrowserAppBuilt } from './build.js';
import type { DesignSpecV2 } from '../../types/design-spec-v2.js';
import type { RendererTokens } from '../../types/tokens.js';
import type { CatalogMap } from '../../types/catalog.js';

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
  // 1. Ensure browser app is built
  const distDir = await ensureBrowserAppBuilt();

  // 2. Create temp directory with dist + data files
  const tempDir = path.join(tmpdir(), `designspec-preview-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  // Copy dist to temp
  cpSync(distDir, tempDir, { recursive: true });

  // Write data files
  const dataDir = path.join(tempDir, 'data');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(path.join(dataDir, 'spec.json'), JSON.stringify(spec));
  writeFileSync(path.join(dataDir, 'tokens.json'), JSON.stringify(tokens));
  writeFileSync(path.join(dataDir, 'catalog.json'), JSON.stringify(catalog));

  // 3. Start static file server
  const server = await startStaticServer(tempDir);
  const port = (server.address() as { port: number }).port;

  let screenshot: Buffer;
  let html: string;

  try {
    // 4. Launch Playwright
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();
      const viewportWidth = options?.width ?? spec.width ?? 1440;
      await page.setViewportSize({ width: viewportWidth, height: 900 });

      // 5. Navigate and wait for render
      await page.goto(`http://localhost:${port}/index.html`, {
        waitUntil: 'networkidle',
      });

      // Wait for React to finish rendering
      await page.waitForFunction(
        () => document.body.dataset.ready === 'true',
        { timeout: 15000 },
      );

      // Small delay for CSS paint
      await page.waitForTimeout(200);

      // 6. Screenshot
      screenshot = (await page.screenshot({ fullPage: true })) as Buffer;
      html = await page.content();
    } finally {
      await browser.close();
    }
  } finally {
    // 7. Cleanup
    server.close();
    rmSync(tempDir, { recursive: true, force: true });
  }

  // Write to file if path specified
  if (options?.outputPath) {
    const outDir = path.dirname(options.outputPath);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    writeFileSync(options.outputPath, screenshot);
  }

  return { screenshot, html };
}

// ─── Static File Server ─────────────────────────────────

function startStaticServer(rootDir: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.woff2': 'font/woff2',
    };

    const server = createServer((req, res) => {
      let filePath = path.join(rootDir, req.url === '/' ? '/index.html' : req.url!);

      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const ext = path.extname(filePath);
      const contentType = mimeTypes[ext] ?? 'application/octet-stream';
      const content = readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });

    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });

    server.on('error', reject);
  });
}
