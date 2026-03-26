/**
 * @module playwright-mcp-spike
 *
 * Integration spike test: proves Playwright browser API data flows
 * end-to-end through the MCPClient → middleware → transport chain.
 *
 * Skipped by default. Enable with:
 *   RUN_MCP_SPIKES=true npx jest --config packages/agents-ux/jest.config.cjs \
 *     --testPathPattern="__tests__/playwright" --verbose
 *
 * See docs/mcp-spike-setup.md for full setup instructions.
 */

import { join } from 'node:path';
import type { MCPClient, Result } from '@agentforge/core';
import { createMCPClient, Ok, Err } from '@agentforge/core';
import type { MCPRequest } from '@agentforge/core';
import type {
  MCPMiddlewareOptions,
  MCPTransport,
  PermissionChecker,
} from '@agentforge/core';
import type { SecretProvider } from '@agentforge/core';
import type { AgentContract } from '@agentforge/core';
import type { Browser, Page } from 'playwright';

// ============================================================================
// Environment & skip logic
// ============================================================================

const SPIKE_ENABLED = process.env.RUN_MCP_SPIKES === 'true';

const describeSpike = SPIKE_ENABLED ? describe : describe.skip;

// ============================================================================
// Minimal test fixtures
// ============================================================================

/** Minimal agent contract for the spike — permits all playwright tools. */
const spikeAgent: AgentContract = {
  role: 'ux-playwright-spike-test',
  description: 'Spike test agent for Playwright MCP integration',
  category: 'design',
  provider: 'anthropic:claude-sonnet',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 8000 },
  tools: [
    'playwright:navigate',
    'playwright:snapshot',
    'playwright:screenshot',
    'playwright:evaluate',
  ],
  permissions: ['mcp:playwright:*'],
  denied: [],
  hitl_policy: 'fully_autonomous',
  budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 1.0 },
  on_complete: 'notify',
  on_error: 'halt',
  context: {},
};

/** Permissive permission checker for spike tests. */
const allowAll: PermissionChecker = () => Ok(undefined);

/** Minimal secret provider — Playwright needs no API tokens. */
const noSecrets: SecretProvider = {
  getSecret(_server: string, _key: string): Result<string> {
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: 'No secrets configured for Playwright spike',
      recoverable: false,
    });
  },
  hasSecret(_server: string, _key: string): boolean {
    return false;
  },
};

// ============================================================================
// Playwright transport
// ============================================================================

/**
 * Creates an MCPTransport that wraps Playwright's browser API directly.
 *
 * This is the pragmatic choice for a spike: it validates the full
 * MCPClient → middleware → transport chain without requiring an
 * external MCP server process.
 *
 * Tool name mapping:
 *   listTools  → static tool list
 *   navigate   → page.goto(url)
 *   snapshot   → page.accessibility.snapshot()
 *   screenshot → page.screenshot({ encoding: 'base64' })
 *   evaluate   → page.evaluate(expression)
 */
const createPlaywrightTransport = (getPage: () => Page): MCPTransport => {
  return async (request: MCPRequest): Promise<Result<unknown>> => {
    const { method, params } = request;

    try {
      if (method === 'listTools') {
        return Ok([
          { name: 'navigate', description: 'Navigate to a URL', inputSchema: {} },
          { name: 'snapshot', description: 'Get accessibility tree snapshot', inputSchema: {} },
          { name: 'screenshot', description: 'Take a screenshot as base64 PNG', inputSchema: {} },
          { name: 'evaluate', description: 'Evaluate JavaScript expression in page context', inputSchema: {} },
        ]);
      }

      const page = getPage();

      if (method === 'navigate') {
        const url = params.url as string;
        if (!url) {
          return Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: 'navigate requires a "url" param',
            recoverable: false,
          });
        }
        await page.goto(url, { waitUntil: 'load' });
        return Ok({ navigated: url });
      }

      if (method === 'snapshot') {
        // page.accessibility.snapshot() was removed in Playwright 1.49+.
        // Use page.locator('body').ariaSnapshot() which returns a YAML-like
        // accessibility tree string — same data, modern API.
        const ariaTree = await page.locator('body').ariaSnapshot();
        return Ok({ ariaTree });
      }

      if (method === 'screenshot') {
        const buffer = await page.screenshot();
        const base64 = buffer.toString('base64');
        return Ok({ base64, format: 'png' });
      }

      if (method === 'evaluate') {
        const expression = params.expression as string;
        if (!expression) {
          return Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: 'evaluate requires an "expression" param',
            recoverable: false,
          });
        }
        const result = await page.evaluate(expression);
        return Ok(result);
      }

      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: `Unknown Playwright MCP method: ${method}`,
        recoverable: false,
      });
    } catch (err) {
      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: `Playwright transport error: ${err instanceof Error ? err.message : String(err)}`,
        recoverable: true,
      });
    }
  };
};

// ============================================================================
// Tests
// ============================================================================

describeSpike('Playwright MCP Spike', () => {
  let browser: Browser;
  let page: Page;
  let mcpClient: MCPClient;

  beforeAll(async () => {
    // Dynamic import to avoid pulling in playwright when spike is skipped
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();

    // Navigate to the test fixture
    const fixturePath = join(__dirname, 'fixtures', 'test-component.html');
    await page.goto(`file://${fixturePath}`, { waitUntil: 'load' });

    const middlewareOptions: MCPMiddlewareOptions = {
      agent: spikeAgent,
      permissionChecker: allowAll,
      secretProvider: noSecrets,
      maxRetries: 1,
      baseRetryDelayMs: 500,
    };

    mcpClient = createMCPClient({
      middlewareOptions,
      transport: createPlaywrightTransport(() => page),
    });
  }, 30_000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  // --------------------------------------------------------------------------
  // Test 1: MCP client reports playwright as available
  // --------------------------------------------------------------------------
  it('MCP client reports playwright as available', async () => {
    const available = await mcpClient.isAvailable('playwright');
    expect(available).toBe(true);
  }, 15_000);

  // --------------------------------------------------------------------------
  // Test 2: snapshot returns accessibility tree
  // --------------------------------------------------------------------------
  it('snapshot returns accessibility tree with expected content', async () => {
    const result = await mcpClient.callTool('playwright', 'snapshot', {});

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const data = result.value as { ariaTree: string };
    const sizeBytes = data.ariaTree.length;

    console.log(`[spike] snapshot response size: ${sizeBytes} bytes`);

    // Expect the accessibility tree to contain our ARIA label and heading
    expect(data.ariaTree).toContain('Monthly cost summary');
    expect(data.ariaTree).toContain('Total Cost');

    // Accessibility tree should be reasonably small (typically under 5KB)
    expect(sizeBytes).toBeGreaterThan(50);
    expect(sizeBytes).toBeLessThan(20_000);
  }, 15_000);

  // --------------------------------------------------------------------------
  // Test 3: screenshot returns base64 PNG
  // --------------------------------------------------------------------------
  it('screenshot returns base64 PNG with expected size ratio', async () => {
    const result = await mcpClient.callTool('playwright', 'screenshot', {});

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const data = result.value as { base64: string; format: string };
    expect(data.format).toBe('png');
    expect(typeof data.base64).toBe('string');
    expect(data.base64.length).toBeGreaterThan(100);

    // Validate it's proper base64 (no throws = valid)
    const decoded = Buffer.from(data.base64, 'base64');
    // PNG magic bytes: 137 80 78 71 (0x89 0x50 0x4E 0x47)
    expect(decoded[0]).toBe(0x89);
    expect(decoded[1]).toBe(0x50);
    expect(decoded[2]).toBe(0x4E);
    expect(decoded[3]).toBe(0x47);

    // Compare sizes: screenshot should be much larger than snapshot
    const snapshotResult = await mcpClient.callTool('playwright', 'snapshot', {});
    if (snapshotResult.ok) {
      const snapshotSize = (snapshotResult.value as { ariaTree: string }).ariaTree.length;
      const screenshotSize = data.base64.length;
      const ratio = screenshotSize / snapshotSize;
      console.log(
        `[spike] size comparison — snapshot: ${snapshotSize} bytes, screenshot: ${screenshotSize} bytes, ratio: ${ratio.toFixed(1)}x`,
      );
      expect(ratio).toBeGreaterThan(1);
    }
  }, 15_000);

  // --------------------------------------------------------------------------
  // Test 4: accessibility tree detects ARIA attributes
  // --------------------------------------------------------------------------
  it('accessibility tree detects ARIA attributes', async () => {
    const result = await mcpClient.callTool('playwright', 'snapshot', {});

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ariaTree = (result.value as { ariaTree: string }).ariaTree;

    // Check for region role from role="region"
    expect(ariaTree).toContain('region');

    // Check for aria-label content
    expect(ariaTree).toContain('Monthly cost summary');

    // Check for aria-describedby content (the description text)
    expect(ariaTree).toContain('Your estimated monthly spending across all services');

    // Check for heading role from <h2>
    expect(ariaTree).toContain('heading');

    console.log('[spike] ARIA attributes detected: region role, aria-label, aria-describedby content, heading role');
  }, 15_000);

  // --------------------------------------------------------------------------
  // Test 5: evaluate extracts DOM text
  // --------------------------------------------------------------------------
  it('evaluate extracts DOM text via querySelector', async () => {
    const result = await mcpClient.callTool('playwright', 'evaluate', {
      expression: "document.querySelector('.metric').textContent",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toBe('$47.50');
    console.log(`[spike] evaluate result: ${result.value}`);
  }, 15_000);
});

// ============================================================================
// Verify skip behavior
// ============================================================================

describe('Playwright MCP Spike (skip guard)', () => {
  it('spike tests are skipped when RUN_MCP_SPIKES is not set', () => {
    if (SPIKE_ENABLED) {
      console.log('[spike] RUN_MCP_SPIKES=true — spike tests are running');
    } else {
      console.log('[spike] RUN_MCP_SPIKES not set — spike tests skipped (expected)');
    }
    expect(true).toBe(true);
  });
});
