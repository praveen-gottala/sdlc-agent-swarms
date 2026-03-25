/**
 * @module @agentforge/agents-ux/ux-design/penpot-browser-review
 *
 * Interactive browser-based Penpot design review session.
 * Takes a workspace URL, navigates to it via Playwright, takes screenshots,
 * evaluates the design, and enters an interactive readline loop where the
 * user can provide feedback that gets applied via execute_code.
 */

import { createInterface } from 'node:readline/promises';
import type { Result, MCPClient } from '@agentforge/core';
import { Ok, Err, DEFAULT_MODEL } from '@agentforge/core';
import type { LLMProvider } from '@agentforge/providers';
import { evaluateDesign } from './design-evaluator.js';
import type { DesignEvaluation } from './design-evaluator.js';
import { takeCanvasScreenshot, readShapeState, waitForCanvasRender } from './penpot-browser-actions.js';
import { discoverPenpotAPI } from './penpot-browser-agent.js';

// Playwright Page type — kept as any to avoid hard dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = any;

// ============================================================================
// Types
// ============================================================================

/** Options for the interactive Penpot browser review session. */
export interface PenpotBrowserReviewOptions {
  /** Direct Penpot workspace URL (user must already be logged in). */
  readonly workspaceUrl: string;
  /** MCP client for execute_code calls. */
  readonly mcpClient: MCPClient;
  /** LLM provider for evaluation and fix generation. */
  readonly provider: LLMProvider;
  /** Input stream for readline. */
  readonly input: NodeJS.ReadableStream;
  /** Output stream for messages. */
  readonly output: NodeJS.WritableStream;
  /** Run browser headless (default: false). */
  readonly headless?: boolean;
  /** Optional design specification text for evaluation context. */
  readonly designSpec?: string;
  /** LLM model to use (default: DEFAULT_MODEL from @agentforge/core). Pass 'gpt-4o' for OpenAI. */
  readonly model?: string;
}

/** Result of the interactive review session. */
export interface PenpotBrowserReviewResult {
  readonly approved: boolean;
  readonly finalScore: number;
  readonly feedbackCount: number;
}

// ============================================================================
// LLM interface for fix generation (matches penpot-browser-adapter.ts)
// ============================================================================

interface FixLLMProvider {
  complete: (
    prompt: { system: string; messages: { role: 'user'; content: string }[] },
    opts: { model: string; maxTokens: number; temperature: number },
  ) => Promise<Result<{ content: string }>>;
}

// ============================================================================
// Constants
// ============================================================================

const HELP_TEXT = `
  Commands:
    review, r        — Re-capture screenshot and evaluate design
    approve, y       — Approve the design and exit
    quit, q          — Reject the design and exit
    help, h          — Show this help message
    <any text>       — Send as feedback to modify the design
`;

// ============================================================================
// Helpers
// ============================================================================

/** Format a design evaluation for display. */
function formatEvaluation(evaluation: DesignEvaluation, output: NodeJS.WritableStream): void {
  const qualityLabel = evaluation.overallQuality === 'good' ? 'good'
    : evaluation.overallQuality === 'needs_fixes' ? 'needs fixes'
    : 'poor';

  output.write(`  [review] Score: ${evaluation.score}/100 (${qualityLabel})\n`);

  if (evaluation.issues.length === 0) {
    output.write('  [review] No issues found.\n');
    return;
  }

  for (const issue of evaluation.issues) {
    output.write(`    [${issue.severity}] ${issue.component} — ${issue.description}\n`);
  }
}

/**
 * Generate and apply fixes from user feedback using LLM + execute_code.
 *
 * Reads shape state, builds a prompt with user feedback + state + API docs,
 * LLM generates JavaScript fix code, then executes via MCP execute_code.
 */
async function applyFeedback(
  page: Page,
  mcpClient: MCPClient,
  llm: FixLLMProvider,
  apiDocs: string,
  feedback: string,
  output: NodeJS.WritableStream,
  model: string,
): Promise<Result<void>> {
  // Read current shape state
  const stateResult = await readShapeState(page);
  const shapeStateJson = stateResult.ok && stateResult.value.shapes.length > 0
    ? JSON.stringify(stateResult.value.shapes, null, 2)
    : '(shape state unavailable — use screenshot for reference)';

  const fixPrompt = {
    system: `You are a Penpot design modifier. Given user feedback about a design, generate JavaScript code to apply the requested changes using the Penpot Plugin API.
The code runs via execute_code.

PENPOT PLUGIN API REFERENCE:
${apiDocs || '(unavailable)'}

CRITICAL RULES:
- Use penpot.createBoard() for containers — NOT createFrame (does not exist)
- Use penpot.createText("content") — text content MUST be in constructor
- Use shape.resize(w, h) — width/height are READ-ONLY
- Fills/strokes replace entire array: shape.fills = [{ fillColor: '#HEX', fillOpacity: 1 }]
- NEVER use: createFrame, shape.width=, shape.height=, shape.text=

FINDING SHAPES (findByName is auto-injected — just call it):
- \`const shape = findByName(penpot.currentPage.root, 'ShapeName');\` — recursive search by name
- \`if (!shape) return { skipped: true, reason: 'shape not found' };\` — guard against missing shapes

ACTUAL SHAPE STATE:
${shapeStateJson}

Return ONLY a JSON object: { "fixes": [{ "code": "...", "description": "..." }] }`,
    messages: [{
      role: 'user' as const,
      content: `User feedback: "${feedback}"\n\nGenerate Penpot Plugin API JavaScript code to apply the requested changes. Use the actual shape state above for precise modifications.`,
    }],
  };

  const fixResult = await llm.complete(fixPrompt, {
    model,
    maxTokens: 8000,
    temperature: 0,
  });

  if (!fixResult.ok) {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `Fix generation failed: ${fixResult.error.message}`,
      recoverable: true,
    });
  }

  // Parse fix steps
  const fixOutput = (fixResult.value as { content: string }).content;
  let fixes: Array<{ code: string; description: string }> = [];
  try {
    const fenceMatch = /```json\s*\n?([\s\S]*?)```/.exec(fixOutput);
    const fixJson = fenceMatch ? fenceMatch[1].trim() : fixOutput.trim();
    const parsed = JSON.parse(fixJson) as { fixes?: Array<{ code: string; description: string }> };
    fixes = parsed.fixes ?? [];
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: 'Could not parse fix steps from LLM output',
      recoverable: true,
    });
  }

  // Execute fixes
  let fixedCount = 0;
  let failedCount = 0;

  for (const fix of fixes.slice(0, 5)) {
    const wrappedFix = `
function findByName(parent, name) {
  for (const c of parent.children || []) {
    if (c.name === name) return c;
    const found = findByName(c, name);
    if (found) return found;
  }
  return null;
}
try {
${fix.code}
} catch (e) {
  return { __error: true, message: e.message || String(e) };
}
`;
    const toolResult = await mcpClient.callTool('penpot', 'execute_code', { code: wrappedFix });

    if (toolResult.ok) {
      const content = toolResult.value as { content?: Array<{ text?: string }> };
      const text = Array.isArray(content.content)
        ? content.content.map(c => c.text ?? '').join('')
        : '';
      try {
        const parsed = JSON.parse(text) as { result?: Record<string, unknown> };
        if (parsed.result && (parsed.result as Record<string, unknown>).__error) {
          output.write(`  [fix] ${fix.description} → ERR: ${(parsed.result as Record<string, unknown>).message}\n`);
          failedCount++;
        } else {
          fixedCount++;
          output.write(`  [fix] ${fix.description} → OK\n`);
        }
      } catch {
        fixedCount++;
        output.write(`  [fix] ${fix.description} → OK\n`);
      }
    } else {
      output.write(`  [fix] ${fix.description} → ERR: ${toolResult.error.message}\n`);
      failedCount++;
    }
  }

  if (fixedCount === 0 && failedCount > 0) {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `All ${failedCount} fix(es) failed`,
      recoverable: true,
    });
  }

  return Ok(undefined);
}

// ============================================================================
// Main review function
// ============================================================================

/**
 * Run an interactive Penpot design review session.
 *
 * 1. Launch Playwright, navigate to workspaceUrl (user already logged in)
 * 2. Wait for canvas render
 * 3. Discover Penpot API docs via MCP
 * 4. Take initial screenshot + evaluate design
 * 5. Show score + issues
 * 6. Enter readline loop for interactive feedback
 * 7. Close browser on exit
 */
export async function runPenpotBrowserReview(
  options: PenpotBrowserReviewOptions,
): Promise<PenpotBrowserReviewResult> {
  const {
    workspaceUrl,
    mcpClient,
    provider,
    input,
    output,
    headless = false,
    designSpec = 'General design quality review',
    model = provider.models?.[0] ?? DEFAULT_MODEL,
  } = options;

  // Wrap provider to override model in evaluateDesign calls
  const evalProvider: LLMProvider = {
    ...provider,
    complete: (prompt, opts) => provider.complete(prompt, { ...opts, model }),
  };

  output.write('\n  AgentForge Penpot Design Review\n');
  output.write(`  URL: ${workspaceUrl}\n`);

  // ── 1. Browser setup ──
  output.write('  [browser] Launching Playwright...\n');

  let browser;
  let page: Page;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    page = await context.newPage();
  } catch (err) {
    output.write(`  [browser] Failed to launch: ${err instanceof Error ? err.message : String(err)}\n`);
    return { approved: false, finalScore: 0, feedbackCount: 0 };
  }

  let lastScore = 0;
  let feedbackCount = 0;

  try {
    // ── 2. Navigate to workspace URL ──
    output.write('  [browser] Navigating to workspace...\n');
    await page.goto(workspaceUrl, { waitUntil: 'load', timeout: 30000 });

    // ── 3. Check for login page and wait if needed ──
    const isLoginPage = await page.$('input[type="email"], input[name="email"], input[id="email"]');
    if (isLoginPage) {
      output.write('  [browser] Login page detected. Please log in manually in the browser window...\n');
      output.write('  [browser] Waiting for workspace to load (up to 5 minutes)...\n');
      // Wait for the workspace to appear — the URL will contain /workspace after login
      // and the canvas/viewport element will be present
      await page.waitForSelector('.viewport, .render-area, canvas, [class*="viewport"]', {
        timeout: 300000, // 5 minutes for manual login
      });
      output.write('  [browser] Login successful, workspace loaded.\n');
    }

    // ── 4. Wait for canvas ──
    await waitForCanvasRender(page, 8000);
    output.write('  [browser] Canvas loaded.\n');

    // ── 5. Discover API docs ──
    const apiDocs = await discoverPenpotAPI(mcpClient);

    // ── 6. Initial screenshot + evaluation ──
    output.write('  [review] Capturing screenshot...\n');
    const screenshotResult = await takeCanvasScreenshot(page);
    if (!screenshotResult.ok) {
      output.write(`  [review] Screenshot failed: ${screenshotResult.error.message}\n`);
      return { approved: false, finalScore: 0, feedbackCount: 0 };
    }

    const evalResult = await evaluateDesign(
      screenshotResult.value.base64,
      designSpec,
      evalProvider,
    );

    if (evalResult.ok) {
      lastScore = evalResult.value.score;
      formatEvaluation(evalResult.value, output);
    } else {
      output.write(`  [review] Evaluation failed: ${evalResult.error.message}\n`);
    }

    // ── 6. Non-TTY: auto-approve ──
    if (!('isTTY' in input && (input as NodeJS.ReadStream).isTTY)) {
      output.write('  Non-interactive mode — auto-approving.\n');
      return { approved: true, finalScore: lastScore, feedbackCount: 0 };
    }

    // ── 7. Interactive readline loop ──
    output.write('\n  Type feedback, or: review/r  approve/y  quit/q  help/h\n\n');

    const rl = createInterface({
      input: input as NodeJS.ReadableStream,
      output: output as NodeJS.WritableStream,
      terminal: true,
    });

    try {
      for await (const line of rl) {
        const trimmed = line.trim();
        if (trimmed === '') continue;

        const lower = trimmed.toLowerCase();

        if (lower === 'approve' || lower === 'y') {
          output.write('  Design approved.\n');
          return { approved: true, finalScore: lastScore, feedbackCount };
        }

        if (lower === 'quit' || lower === 'q') {
          output.write('  Design rejected.\n');
          return { approved: false, finalScore: lastScore, feedbackCount };
        }

        if (lower === 'help' || lower === 'h') {
          output.write(HELP_TEXT);
          continue;
        }

        if (lower === 'review' || lower === 'r') {
          output.write('  [review] Capturing screenshot...\n');
          await waitForCanvasRender(page, 3000);
          const ssResult = await takeCanvasScreenshot(page);
          if (!ssResult.ok) {
            output.write(`  [review] Screenshot failed: ${ssResult.error.message}\n`);
            continue;
          }
          const eResult = await evaluateDesign(ssResult.value.base64, designSpec, evalProvider);
          if (eResult.ok) {
            lastScore = eResult.value.score;
            formatEvaluation(eResult.value, output);
          } else {
            output.write(`  [review] Evaluation failed: ${eResult.error.message}\n`);
          }
          continue;
        }

        // Treat as feedback — generate and apply fixes
        output.write(`  Applying feedback: "${trimmed}"...\n`);
        const fixLlm = provider as unknown as FixLLMProvider;
        const result = await applyFeedback(page, mcpClient, fixLlm, apiDocs, trimmed, output, model);

        if (result.ok) {
          feedbackCount++;
          // Wait for render, then auto-review
          await waitForCanvasRender(page, 3000);
          output.write('  [review] Evaluating changes...\n');
          const ssResult = await takeCanvasScreenshot(page);
          if (ssResult.ok) {
            const eResult = await evaluateDesign(ssResult.value.base64, designSpec, evalProvider);
            if (eResult.ok) {
              lastScore = eResult.value.score;
              formatEvaluation(eResult.value, output);
            }
          }
        } else {
          output.write(`  Feedback failed: ${result.error.message}\n`);
        }
      }
    } finally {
      rl.close();
    }

    // EOF reached
    return { approved: false, finalScore: lastScore, feedbackCount };
  } finally {
    output.write('  [browser] Closing browser...\n');
    await browser.close();
  }
}
