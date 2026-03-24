/**
 * @module @agentforge/cli/commands/impl-verify
 *
 * Post-implementation verification: starts the project's dev server,
 * captures a browser screenshot, and compares it to the design screenshot
 * using an LLM vision evaluation.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { infoMsg, successMsg, errorMsg, warnMsg } from '../formatter.js';
import type { Result } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';

// ============================================================================
// Types
// ============================================================================

export interface VerifyOptions {
  /** Project root directory. */
  readonly projectRoot: string;
  /** Module ID of the design being verified. */
  readonly moduleId: string;
  /** Dev server command (default: 'npm run dev'). */
  readonly devCommand?: string;
  /** Port the dev server listens on (default: 3000). */
  readonly port?: number;
  /** Maximum seconds to wait for the dev server to be ready. */
  readonly startupTimeout?: number;
  /** Output stream for logging. */
  readonly output: NodeJS.WritableStream;
  /** LLM provider for visual comparison (optional). */
  readonly provider?: {
    complete: (
      prompt: { system: string; messages: { role: 'user'; content: string }[] },
      opts: { model: string; maxTokens: number; temperature: number },
    ) => Promise<Result<{ content: string }>>;
  };
}

export interface VerifyResult {
  /** Path to the browser screenshot of the running app. */
  readonly screenshotPath: string;
  /** Path to the design screenshot used for comparison. */
  readonly designScreenshotPath?: string;
  /** LLM visual comparison score (0-100). */
  readonly score?: number;
  /** LLM visual comparison summary. */
  readonly summary?: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Start the dev server and wait for it to be ready.
 * Returns the child process (caller must kill it when done).
 */
async function startDevServer(
  projectRoot: string,
  command: string,
  port: number,
  timeoutSec: number,
  output: NodeJS.WritableStream,
): Promise<Result<ChildProcess>> {
  const [cmd, ...args] = command.split(' ');
  const child = spawn(cmd, args, {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, PORT: String(port) },
  });

  // Collect stderr for debugging
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  // Wait for the server to be ready by polling the port
  const startTime = Date.now();
  const timeoutMs = timeoutSec * 1000;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${port}`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok || response.status === 404) {
        // Server is up (404 is fine — means the server responded)
        return Ok(child);
      }
    } catch {
      // Server not ready yet — wait and retry
    }

    // Check if process died
    if (child.exitCode !== null) {
      return Err({
        code: 'INVALID_STATE' as const,
        message: `Dev server exited with code ${child.exitCode}: ${stderr.slice(0, 300)}`,
        recoverable: false,
      });
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  child.kill();
  return Err({
    code: 'INVALID_STATE' as const,
    message: `Dev server did not start within ${timeoutSec}s. Last stderr: ${stderr.slice(0, 300)}`,
    recoverable: false,
  });
}

/**
 * Take a screenshot of the running app using a headless browser.
 * Uses Playwright if available, falls back to a basic fetch.
 */
async function takeAppScreenshot(
  url: string,
  outputPath: string,
): Promise<Result<string>> {
  try {
    // Try Playwright first
    const pw = await import('playwright');
    const browser = await pw.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    // Wait a moment for any animations/transitions
    await page.waitForTimeout(2000);
    await page.screenshot({ path: outputPath, fullPage: false });
    await browser.close();
    return Ok(outputPath);
  } catch {
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: 'Playwright not available. Install with: npx playwright install chromium',
      recoverable: true,
    });
  }
}

/**
 * Find the design screenshot to compare against.
 * Looks for root.png in the Penpot or Figma screenshots directory.
 */
function findDesignScreenshot(projectRoot: string, moduleId: string): string | undefined {
  const previewDir = join(projectRoot, '.agentforge', 'previews', moduleId, 'screenshots');

  // Prefer Penpot, then Figma
  for (const tool of ['penpot', 'figma']) {
    const rootPng = join(previewDir, tool, 'root.png');
    if (existsSync(rootPng)) {
      return rootPng;
    }
  }

  return undefined;
}

/**
 * Compare app screenshot against design screenshot using LLM vision.
 */
async function compareScreenshots(
  appScreenshotPath: string,
  designScreenshotPath: string,
  provider: VerifyOptions['provider'],
): Promise<Result<{ score: number; summary: string }>> {
  if (!provider) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: 'No LLM provider for visual comparison',
      recoverable: true,
    });
  }

  const appBase64 = readFileSync(appScreenshotPath).toString('base64');
  const designBase64 = readFileSync(designScreenshotPath).toString('base64');

  const result = await provider.complete(
    {
      system: `You are a visual design QA assistant. Compare a running app screenshot against the original design mockup.

Score 0-100 on visual fidelity:
- 90-100: Pixel-perfect match (colors, layout, typography, spacing)
- 70-89: Good match with minor differences (slight spacing, font rendering)
- 50-69: Recognizable but noticeable differences (wrong colors, missing elements)
- 0-49: Significantly different from the design

Return ONLY a JSON object: { "score": <number>, "summary": "<2-3 sentences>", "differences": ["<issue1>", "<issue2>"] }`,
      messages: [{
        role: 'user' as const,
        content: `Compare these two screenshots.

DESIGN MOCKUP (base64 PNG): data:image/png;base64,${designBase64.slice(0, 100)}...
(Full image provided as context)

RUNNING APP (base64 PNG): data:image/png;base64,${appBase64.slice(0, 100)}...
(Full image provided as context)

Rate how well the running app matches the design mockup.`,
      }],
    },
    { model: 'claude-sonnet-4', maxTokens: 1000, temperature: 0 },
  );

  if (!result.ok) {
    return Err({
      code: 'LLM_API_ERROR' as const,
      message: 'Visual comparison LLM call failed',
      recoverable: true,
    });
  }

  try {
    const content = (result.value as { content: string }).content;
    const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(content);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
    const parsed = JSON.parse(jsonStr) as { score: number; summary: string };
    return Ok({ score: parsed.score, summary: parsed.summary });
  } catch {
    return Ok({ score: 0, summary: 'Could not parse LLM comparison result' });
  }
}

// ============================================================================
// Main verification function
// ============================================================================

/**
 * Run post-implementation verification:
 * 1. Start the dev server
 * 2. Take a browser screenshot
 * 3. Compare against the design screenshot
 * 4. Report results
 */
export async function verifyImplementation(options: VerifyOptions): Promise<Result<VerifyResult>> {
  const {
    projectRoot,
    moduleId,
    output,
    devCommand = 'npm run dev',
    port = 3000,
    startupTimeout = 30,
    provider,
  } = options;

  // 1. Start dev server
  output.write(infoMsg(`\n  [verify] Starting dev server (${devCommand})...\n`));
  const serverResult = await startDevServer(projectRoot, devCommand, port, startupTimeout, output);

  if (!serverResult.ok) {
    output.write(errorMsg(`  [verify] ${serverResult.error.message}\n`));
    return serverResult as Result<never>;
  }

  const serverProcess = serverResult.value;
  output.write(successMsg(`  [verify] Dev server ready on port ${port}\n`));

  try {
    // 2. Take screenshot
    const screenshotDir = join(projectRoot, '.agentforge', 'previews', moduleId, 'screenshots', 'impl');
    mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = join(screenshotDir, 'app.png');

    output.write(infoMsg('  [verify] Capturing browser screenshot...\n'));
    const screenshotResult = await takeAppScreenshot(`http://localhost:${port}`, screenshotPath);

    if (!screenshotResult.ok) {
      output.write(warnMsg(`  [verify] Screenshot failed: ${screenshotResult.error.message}\n`));
      return Ok({ screenshotPath: '' });
    }

    output.write(successMsg(`  [verify] Screenshot saved: ${screenshotPath}\n`));

    // 3. Find design screenshot for comparison
    const designScreenshotPath = findDesignScreenshot(projectRoot, moduleId);

    if (!designScreenshotPath) {
      output.write(warnMsg('  [verify] No design screenshot found for comparison.\n'));
      return Ok({ screenshotPath });
    }

    output.write(infoMsg(`  [verify] Comparing against: ${designScreenshotPath}\n`));

    // 4. Visual comparison via LLM
    if (provider) {
      output.write(infoMsg('  [verify] Running visual comparison...\n'));
      const compareResult = await compareScreenshots(screenshotPath, designScreenshotPath, provider);

      if (compareResult.ok) {
        const { score, summary } = compareResult.value;
        const quality = score >= 80 ? 'good' : score >= 50 ? 'needs work' : 'poor';
        output.write(infoMsg(`  [verify] Visual fidelity: ${score}/100 (${quality})\n`));
        output.write(infoMsg(`  [verify] ${summary}\n`));

        return Ok({
          screenshotPath,
          designScreenshotPath,
          score,
          summary,
        });
      } else {
        output.write(warnMsg(`  [verify] Comparison skipped: ${compareResult.error.message}\n`));
      }
    } else {
      output.write(warnMsg('  [verify] No LLM provider — skipping visual comparison.\n'));
      output.write(infoMsg(`  [verify] Compare manually:\n`));
      output.write(infoMsg(`    Design:  ${designScreenshotPath}\n`));
      output.write(infoMsg(`    App:     ${screenshotPath}\n`));
    }

    return Ok({ screenshotPath, designScreenshotPath });
  } finally {
    // Kill dev server
    serverProcess.kill('SIGTERM');
    // Give it a moment to clean up
    await new Promise((r) => setTimeout(r, 500));
    if (serverProcess.exitCode === null) {
      serverProcess.kill('SIGKILL');
    }
  }
}
