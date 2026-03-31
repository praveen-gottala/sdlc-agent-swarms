/**
 * @module @agentforge/designspec-renderer/renderer/browser/screenshot-session
 *
 * Persistent browser session for iterative DesignSpec rendering.
 * Extracts shared setup logic (temp dir, static server, Playwright launch)
 * from screenshot.ts so the browser can be kept alive across re-renders.
 */
import { createServer, type Server } from 'http';
import { existsSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { ensureBrowserAppBuilt } from './build.js';
import type { DesignSpecV2 } from '../../types/design-spec-v2.js';
import type { RendererTokens } from '../../types/tokens.js';
import type { CatalogMap } from '../../types/catalog.js';
import type { ScreenshotResult, ScreenshotOptions } from './screenshot.js';
import type { DOMLayoutData } from './dom-extraction.js';

/** Persistent browser session for iterative re-rendering of DesignSpec. */
export interface BrowserSession {
  /** Overwrite spec.json and re-render, returning a new screenshot. */
  rerender(spec: DesignSpecV2): Promise<ScreenshotResult>;
  /** Extract DOM layout data from the current page. */
  extractDOM(): Promise<DOMLayoutData>;
  /** Close browser, stop server, remove temp dir. */
  close(): Promise<void>;
}

// Playwright Page type — kept as any to avoid hard dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlaywrightPage = any;

/**
 * Open a persistent browser session for a DesignSpec.
 * Returns the session handle and the initial screenshot.
 */
export async function openBrowserSession(
  spec: DesignSpecV2,
  tokens: RendererTokens,
  catalog: CatalogMap,
  options?: ScreenshotOptions,
): Promise<{ session: BrowserSession; initial: ScreenshotResult }> {
  // 1. Ensure browser app is built
  const distDir = await ensureBrowserAppBuilt();

  // 2. Create temp directory with dist + data files
  const tempDir = path.join(tmpdir(), `designspec-session-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  cpSync(distDir, tempDir, { recursive: true });

  const dataDir = path.join(tempDir, 'data');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(path.join(dataDir, 'spec.json'), JSON.stringify(spec));
  writeFileSync(path.join(dataDir, 'tokens.json'), JSON.stringify(tokens));
  writeFileSync(path.join(dataDir, 'catalog.json'), JSON.stringify(catalog));

  // 3. Start static file server
  const server = await startStaticServer(tempDir);
  const port = (server.address() as { port: number }).port;

  // 4. Launch Playwright
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const viewportWidth = options?.width ?? spec.width ?? 1440;
  await page.setViewportSize({ width: viewportWidth, height: 900 });

  // 5. Initial render
  const initial = await renderPage(page, port, dataDir);

  const session: BrowserSession = {
    async rerender(newSpec: DesignSpecV2): Promise<ScreenshotResult> {
      // Overwrite spec.json and re-navigate to force React remount
      writeFileSync(path.join(dataDir, 'spec.json'), JSON.stringify(newSpec));
      return renderPage(page, port, dataDir);
    },

    async extractDOM(): Promise<DOMLayoutData> {
      const { extractDOMLayout } = await import('./dom-extraction.js');
      return extractDOMLayout(page);
    },

    async close(): Promise<void> {
      await browser.close();
      server.close();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };

  return { session, initial };
}

// ─── Internal Helpers ─────────────────────────────────────

async function renderPage(
  page: PlaywrightPage,
  port: number,
  _dataDir: string,
): Promise<ScreenshotResult> {
  await page.goto(`http://localhost:${port}/index.html`, {
    waitUntil: 'networkidle',
  });

  await page.waitForFunction(
    () => document.body.dataset.ready === 'true',
    { timeout: 15000 },
  );

  // Small delay for CSS paint
  await page.waitForTimeout(200);

  const screenshot = (await page.screenshot({ fullPage: true })) as Buffer;
  const html: string = await page.content();

  return { screenshot, html };
}

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
      // Strip query string (cache-busting params like ?t=...) before resolving file path
      const urlPath = (req.url ?? '/').split('?')[0];
      const filePath = path.join(rootDir, urlPath === '/' ? '/index.html' : urlPath);

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
