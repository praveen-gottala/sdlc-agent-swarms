/**
 * @module @agentforge/agents-ux/ux-design/penpot-browser-agent
 *
 * Penpot Browser Design Agent: full pipeline using Playwright for
 * browser automation (login, navigation, screenshots, state reading)
 * and execute_code for shape creation/modification.
 *
 * Pipeline:
 * 1. Browser setup — launch Playwright, navigate to Penpot
 * 2. Login — fill login form, navigate to project
 * 3. API discovery — discoverPenpotAPI (reused from ux-penpot-design)
 * 4. Phase A — LLM generates single JS design script
 * 5. Phase B — execute via single execute_code call
 * 6. Phase C — runCorrectionLoop with browser-based adapter
 * 7. Cleanup — browser.close()
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AgentContract,
  Result,
  MCPClient,
} from '@agentforge/core';
import {
  Ok,
  Err,
  DEFAULT_SERVICE_URLS,
  debugLog,
  logDefaults,
  parsePromptFrontmatter,
} from '@agentforge/core';
import type { LLMProvider as EvalLLMProvider } from '@agentforge/providers';
import type { UXPlanningOutput } from '../ux-planning/ux-planning.js';
import { parsePenpotDesignScript } from './ux-penpot-design.js';
import { runCorrectionLoop } from './correction-loop.js';
import { createPenpotBrowserCorrectionAdapter } from './penpot-browser-adapter.js';
import { loginToPenpot, navigateToProject, waitForCanvasRender } from './penpot-browser-actions.js';

// ============================================================================
// Types
// ============================================================================

/** Input for the browser-based Penpot design agent. */
export interface PenpotBrowserDesignInput {
  readonly specRef: string;
  readonly moduleId: string;
  readonly taskId: string;
  readonly planningOutput: UXPlanningOutput;
  readonly designSystemPrompt?: string;
  readonly componentCatalogPrompt?: string;
  readonly description?: string;
  /** Target viewport width in pixels (default: 1440). */
  readonly viewportWidth?: number;
  /** Override model resolved from provider registry. Falls back to contract default. */
  readonly resolvedModel?: string;
}

/** Output produced by the browser-based Penpot design agent. */
export interface PenpotBrowserDesignOutput {
  readonly penpotProjectId: string;
  readonly penpotPageId: string;
  readonly penpotNodeIds: Readonly<Record<string, string>>;
  readonly moduleId: string;
  readonly breakpoints: readonly string[];
}

/** Options for the browser design pipeline. */
export interface PenpotBrowserDesignOptions {
  /** Run browser headless (no visible window). Default: false */
  readonly headless?: boolean;
  /** Penpot UI URL. Default: http://localhost:9001 */
  readonly penpotUrl?: string;
  /** Penpot login email. */
  readonly email?: string;
  /** Penpot login password. */
  readonly password?: string;
  /** Project name to navigate to after login. */
  readonly projectName?: string;
}

// ============================================================================
// Contract
// ============================================================================

export const PENPOT_BROWSER_DESIGN_CONTRACT: AgentContract = {
  role: 'penpot_browser_design',
  description: 'Creates Penpot designs using Playwright browser automation for screenshots and state inspection',
  category: 'design',
  provider: 'claude-sonnet-4-6',
  execution: { mode: 'complete', progress_events: true, max_context_tokens: 40000 },
  tools: [
    'penpot:execute_code', 'penpot:high_level_overview',
    'penpot:penpot_api_info',
    'playwright:navigate', 'playwright:screenshot',
    'playwright:evaluate', 'playwright:click',
  ],
  permissions: ['read_spec', 'read_design', 'write_design', 'read_design_system'],
  denied: ['write_code', 'create_branch', 'merge_pr'],
  hitl_policy: 'full_approval',
  budget: { max_tokens_per_task: 50000, max_cost_per_task_usd: 2.0 },
  on_complete: 'PenpotBrowserDesignReady',
  on_error: 'retry(max=2) then notify_human + pause',
  context: {},
};

// ============================================================================
// System prompt
// ============================================================================

let systemPromptCache: string | undefined;

const loadPenpotSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-penpot-design-system.md');
  const raw = readFileSync(promptPath, 'utf-8');
  const parsed = parsePromptFrontmatter(raw);
  systemPromptCache = parsed.body;
  return systemPromptCache;
};

// ============================================================================
// LLM interface
// ============================================================================

interface LLMProvider {
  complete: (
    prompt: { system: string; messages: { role: 'user'; content: string }[] },
    opts: { model: string; maxTokens: number; temperature: number },
  ) => Promise<Result<{ content: string }>>;
}

// ============================================================================
// Dynamic API Discovery (reused from ux-penpot-design)
// ============================================================================

/**
 * Fetch live Penpot API documentation from the MCP server.
 * Falls back to empty string if server is unavailable.
 */
export async function discoverPenpotAPI(mcpClient: MCPClient): Promise<string> {
  const parts: string[] = [];

  const overviewResult = await mcpClient.callTool('penpot', 'high_level_overview', {});
  if (overviewResult.ok) {
    const content = overviewResult.value as { content?: Array<{ text?: string }> };
    if (Array.isArray(content.content)) {
      parts.push(content.content.map(c => c.text ?? '').join(''));
    }
  }

  for (const type of ['Board', 'FlexLayout', 'Fill', 'Stroke']) {
    const typeResult = await mcpClient.callTool('penpot', 'penpot_api_info', { type });
    if (typeResult.ok) {
      const content = typeResult.value as { content?: Array<{ text?: string }> };
      if (Array.isArray(content.content)) {
        parts.push(content.content.map(c => c.text ?? '').join(''));
      }
    }
  }

  return parts.join('\n\n');
}

// ============================================================================
// Work function
// ============================================================================

/**
 * Execute the Penpot browser design pipeline.
 *
 * Phase A: LLM generates a single JavaScript design script
 * Phase B: Execute the script via a single Penpot MCP execute_code call
 * Phase C: Visual self-correction loop using Playwright screenshots + state reading
 */
export async function penpotBrowserDesignWork(
  input: PenpotBrowserDesignInput,
  provider: unknown,
  mcpClient: MCPClient,
  options: PenpotBrowserDesignOptions = {},
): Promise<Result<PenpotBrowserDesignOutput>> {
  const { moduleId, planningOutput, designSystemPrompt, componentCatalogPrompt, description, viewportWidth, resolvedModel } = input;
  const llm = provider as unknown as LLMProvider;
  const effectiveModel = resolvedModel ?? PENPOT_BROWSER_DESIGN_CONTRACT.provider;

  if (!resolvedModel) {
    debugLog(`[penpot-browser] resolvedModel not set, falling back to contract default: ${PENPOT_BROWSER_DESIGN_CONTRACT.provider}`);
  }

  const headless = options.headless ?? false;
  const penpotUrl = options.penpotUrl ?? DEFAULT_SERVICE_URLS.penpotUi;
  const email = options.email ?? process.env.PENPOT_EMAIL ?? '';
  const password = options.password ?? process.env.PENPOT_PASSWORD ?? '';

  logDefaults('penpotBrowserDesignWork:options', {
    headless: [options.headless, 'false'],
    penpotUrl: [options.penpotUrl, `'${DEFAULT_SERVICE_URLS.penpotUi}'`],
    email: [options.email || process.env.PENPOT_EMAIL, "''"],
    password: [options.password || process.env.PENPOT_PASSWORD, "''"],
  });

  // ── 1. Browser setup ──
  // eslint-disable-next-line no-console
  console.log(`        [browser] Launching Playwright (headless: ${headless})...`);

  let browser;
  let page;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    page = await context.newPage();
  } catch (err) {
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: `Failed to launch browser: ${err instanceof Error ? err.message : String(err)}`,
      recoverable: false,
    });
  }

  try {
    // ── 2. Login ──
    if (email && password) {
      // eslint-disable-next-line no-console
      console.log(`        [browser] Navigating to ${penpotUrl}...`);
      await page.goto(penpotUrl, { waitUntil: 'load', timeout: 30000 });

      // eslint-disable-next-line no-console
      console.log('        [browser] Logging in...');
      const loginResult = await loginToPenpot(page, email, password);
      if (!loginResult.ok) {
        return loginResult as Result<never>;
      }
      // eslint-disable-next-line no-console
      console.log('        [browser] Logged in successfully');

      // Navigate to project if specified
      if (options.projectName) {
        const navResult = await navigateToProject(page, options.projectName);
        if (!navResult.ok) {
          // eslint-disable-next-line no-console
          console.warn(`        [browser] Could not navigate to project "${options.projectName}": ${navResult.error.message}`);
        }
      }
    } else {
      // Without credentials, just navigate to the URL (user may already be logged in)
      // eslint-disable-next-line no-console
      console.log(`        [browser] Navigating to ${penpotUrl} (no credentials, assuming logged in)...`);
      await page.goto(penpotUrl, { waitUntil: 'load', timeout: 30000 });
    }

    // ── 3. API discovery ──
    const apiDocs = await discoverPenpotAPI(mcpClient);
    // eslint-disable-next-line no-console
    console.log(`        [browser] Discovered ${apiDocs.length} chars of API docs from MCP server`);

    // ── Phase A: Generate design script via LLM ──
    // eslint-disable-next-line no-console
    console.log('\n        [Phase A] Generating design script...');

    const rawPrompt = loadPenpotSystemPrompt();

    logDefaults('penpotBrowserDesignWork:promptSubstitution', {
      designSystemPrompt: [designSystemPrompt, "'(No project design system provided...)'"],
      apiDocs: [apiDocs, "'(API docs unavailable...)'"],
      componentCatalogPrompt: [componentCatalogPrompt, "'(No component catalog available)'"],
    });

    const systemPrompt = rawPrompt
      .replace('{{DESIGN_SYSTEM}}', designSystemPrompt || '(No project design system provided — use the token names from the rules below as guidance)')
      .replace('{{PENPOT_API_DOCS}}', apiDocs || '(API docs unavailable — use the rules above)')
      .replace('{{COMPONENT_CATALOG}}', componentCatalogPrompt || '(No component catalog available)');

    const userMessageParts = [
      `Module ID: ${moduleId}`,
    ];

    if (viewportWidth) {
      userMessageParts.push(`\nViewport Width: ${viewportWidth}px`);
      userMessageParts.push(`IMPORTANT: The root board MUST use resize(${viewportWidth}, estimatedHeight). All child layouts must fit within ${viewportWidth}px width.`);
    }

    if (description) {
      userMessageParts.push(`\nApp Description: ${description}`);
      userMessageParts.push(`\nIMPORTANT: Design this screen for the app described above. Use the componentTree below to determine which components to create. Populate all text with realistic, domain-appropriate content that matches this app.`);
    }

    userMessageParts.push(`\nPlanning Output:\n${JSON.stringify(planningOutput, null, 2)}`);

    const userMessage = userMessageParts.join('\n');

    const completionResult = await llm.complete(
      {
        system: systemPrompt,
        messages: [{ role: 'user' as const, content: userMessage }],
      },
      {
        model: effectiveModel,
        maxTokens: 32000,
        temperature: 0,
      },
    );

    if (!completionResult.ok) {
      const err = completionResult.error as unknown as Record<string, unknown>;
      const detail = typeof err.message === 'string'
        ? err.message
        : typeof err.raw === 'string'
          ? err.raw
          : undefined;
      const message = detail
        ? `LLM completion failed (${String(err.code ?? 'unknown')}): ${detail}`
        : `LLM completion failed (${String(err.code ?? 'unknown')})`;
      return Err({
        code: 'LLM_API_ERROR' as const,
        message,
        recoverable: true,
      });
    }

    const completion = completionResult.value as { content: string; finishReason?: string };
    if (completion.finishReason === 'max_tokens') {
      // eslint-disable-next-line no-console
      console.error('        [penpot] LLM output truncated (hit maxTokens limit)');
      return Err({
        code: 'LLM_TRUNCATED',
        message: 'Penpot design script was truncated — LLM hit maxTokens limit. Try reducing component count or increasing maxTokens.',
        recoverable: true,
      });
    }
    const llmOutput = completion.content;
    const parseResult = parsePenpotDesignScript(llmOutput);
    if (!parseResult.ok) {
      return parseResult as Result<never>;
    }

    const { script, breakpoints } = parseResult.value;

    // ── Phase B: Execute design script ──
    // eslint-disable-next-line no-console
    console.log('\n        [Phase B] Executing design script...');

    const penpotNodeIds: Record<string, string> = {};

    const wrappedScript = `
try {
  ${script}
} catch (e) {
  return { __error: true, message: e.message || String(e), stack: e.stack };
}
`;

    const scriptT0 = Date.now();
    const toolResult = await mcpClient.callTool('penpot', 'execute_code', {
      code: wrappedScript,
    });
    const scriptMs = Date.now() - scriptT0;

    if (toolResult.ok) {
      const result = toolResult.value as Record<string, unknown>;
      const content = result.content as Array<{ text?: string }> | undefined;
      if (Array.isArray(content)) {
        const text = content.map(c => c.text ?? '').join('');

        if (text.includes('No Penpot plugin instances')) {
          // eslint-disable-next-line no-console
          console.error('\n        FATAL: Penpot plugin disconnected.');
          return Err({ code: 'MCP_UNAVAILABLE', message: 'Penpot plugin disconnected', recoverable: true });
        }

        try {
          const parsed = JSON.parse(text) as { result?: Record<string, unknown> };
          const resultVal = parsed.result;

          if (resultVal?.__error) {
            // eslint-disable-next-line no-console
            console.error(`        [penpot] Script error: ${resultVal.message} (${scriptMs}ms)`);
          } else {
            const nodeIds = resultVal?.nodeIds as Record<string, string> | undefined;
            if (nodeIds) {
              Object.assign(penpotNodeIds, nodeIds);
            }
            const shapeCount = Object.keys(nodeIds ?? {}).length;
            // eslint-disable-next-line no-console
            console.log(`        [penpot] Script complete: ${shapeCount} components created (${scriptMs}ms)`);
          }

          const logOutput = (parsed as Record<string, unknown>).log as string | undefined;
          if (logOutput?.trim()) {
            // eslint-disable-next-line no-console
            console.log(`        [penpot] Log: ${logOutput.trim().slice(0, 300)}`);
          }
        } catch {
          // eslint-disable-next-line no-console
          console.warn(`        [penpot] Non-JSON response: ${text.slice(0, 200)}`);
        }
      }
    } else {
      // eslint-disable-next-line no-console
      console.error(`        [penpot] Script execution failed: ${toolResult.error.message}`);
    }

    // ── Phase C: Visual self-correction loop (browser-based) ──
    // eslint-disable-next-line no-console
    console.log('\n        [Phase C] Browser-based self-correction loop');

    // Wait for Penpot to render the created shapes
    await waitForCanvasRender(page, 5000);

    const browserAdapter = createPenpotBrowserCorrectionAdapter(
      page,
      mcpClient,
      llm,
      apiDocs,
    );

    const evalProvider = provider as unknown as EvalLLMProvider;
    const correctionResult = await runCorrectionLoop(browserAdapter, {
      maxCorrections: 3,
      qualityThreshold: 80,
      renderDelayMs: 3000,
      designSpec: JSON.stringify(planningOutput, null, 2),
      provider: evalProvider,
    });

    // eslint-disable-next-line no-console
    console.log(`        [browser] Correction loop: score ${correctionResult.finalScore}/100, ${correctionResult.iterations} iterations, threshold ${correctionResult.thresholdMet ? 'met' : 'not met'}`);

    return Ok({
      penpotProjectId: `penpot-${moduleId}`,
      penpotPageId: `page-${moduleId}`,
      penpotNodeIds,
      moduleId,
      breakpoints,
    });
  } finally {
    // ── 7. Cleanup ──
    // eslint-disable-next-line no-console
    console.log('        [browser] Closing browser...');
    await browser.close();
  }
}
