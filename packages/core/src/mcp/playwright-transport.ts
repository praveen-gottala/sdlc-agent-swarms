/**
 * @module @agentforge/core/mcp/playwright-transport
 *
 * MCP Transport that wraps a Playwright Page object.
 * Enables browser automation (navigate, screenshot, evaluate, click, fill, etc.)
 * to flow through the standard MCPClient → middleware → transport chain.
 *
 * Playwright is imported dynamically so non-browser pipelines pay no import cost.
 *
 * Promoted from spike: packages/agents-ux/__tests__/playwright-mcp-spike.test.ts
 */

import type { Result } from '../types/index.js';
import { Ok, Err } from '../types/index.js';
import type { MCPRequest, MCPTransport } from './mcp-middleware.js';
import type { ToolDefinition } from './mcp-client.js';

// Re-export the Page type name but avoid hard dependency on playwright
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlaywrightPage = any;

/** Configuration for the Playwright MCP transport. */
export interface PlaywrightTransportConfig {
  /** Whether to launch browser headless. Default: true */
  readonly headless?: boolean;
  /** Browser viewport width. Default: 1280 */
  readonly viewportWidth?: number;
  /** Browser viewport height. Default: 720 */
  readonly viewportHeight?: number;
}

/** Handle returned by createPlaywrightTransport for lifecycle management. */
export interface PlaywrightTransportHandle {
  /** The MCPTransport that routes calls to Playwright. */
  readonly transport: MCPTransport;
  /** The raw Playwright Page object for direct use. */
  readonly page: PlaywrightPage;
  /** Close browser and release resources. */
  close(): Promise<void>;
}

/** Static tool definitions exposed by this transport. */
const PLAYWRIGHT_TOOLS: readonly ToolDefinition[] = [
  { name: 'navigate', description: 'Navigate to a URL', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'snapshot', description: 'Get accessibility tree snapshot of the page', inputSchema: { type: 'object', properties: {} } },
  { name: 'screenshot', description: 'Take a screenshot as base64 PNG', inputSchema: { type: 'object', properties: { clip: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } } } } } },
  { name: 'evaluate', description: 'Evaluate JavaScript expression in page context', inputSchema: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] } },
  { name: 'click', description: 'Click an element by CSS selector', inputSchema: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] } },
  { name: 'fill', description: 'Fill an input element with a value', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, value: { type: 'string' } }, required: ['selector', 'value'] } },
  { name: 'type', description: 'Type text via keyboard', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'pressKey', description: 'Press a keyboard key', inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } },
  { name: 'drag', description: 'Drag from one point to another', inputSchema: { type: 'object', properties: { from: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } }, to: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } } }, required: ['from', 'to'] } },
  { name: 'waitFor', description: 'Wait for a selector to appear', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, timeout: { type: 'number' } }, required: ['selector'] } },
];

/**
 * Create an MCPTransport backed by a Playwright Page object.
 *
 * @param getPage - Function that returns the active Playwright Page.
 *   Using a getter allows deferred initialization.
 * @returns MCPTransport that routes tool calls to Playwright browser APIs.
 */
export function createPlaywrightTransportFromPage(getPage: () => PlaywrightPage): MCPTransport {
  return async (request: MCPRequest): Promise<Result<unknown>> => {
    const { method, params } = request;

    try {
      if (method === 'listTools') {
        return Ok([...PLAYWRIGHT_TOOLS]);
      }

      const page = getPage();

      switch (method) {
        case 'navigate': {
          const url = params.url as string;
          if (!url) {
            return Err({ code: 'MCP_UNAVAILABLE' as const, message: 'navigate requires a "url" param', recoverable: false });
          }
          await page.goto(url, { waitUntil: 'load', timeout: 30000 });
          return Ok({ navigated: url });
        }

        case 'snapshot': {
          const ariaTree = await page.locator('body').ariaSnapshot();
          return Ok({ ariaTree });
        }

        case 'screenshot': {
          const clip = params.clip as { x: number; y: number; width: number; height: number } | undefined;
          const screenshotOpts: Record<string, unknown> = {};
          if (clip) {
            screenshotOpts.clip = clip;
          }
          const buffer = await page.screenshot(screenshotOpts);
          const base64 = buffer.toString('base64');
          return Ok({ base64, format: 'png' });
        }

        case 'evaluate': {
          const expression = params.expression as string;
          if (!expression) {
            return Err({ code: 'MCP_UNAVAILABLE' as const, message: 'evaluate requires an "expression" param', recoverable: false });
          }
          const result = await page.evaluate(expression);
          return Ok(result);
        }

        case 'click': {
          const selector = params.selector as string;
          if (!selector) {
            return Err({ code: 'MCP_UNAVAILABLE' as const, message: 'click requires a "selector" param', recoverable: false });
          }
          await page.click(selector, { timeout: 10000 });
          return Ok({ clicked: selector });
        }

        case 'fill': {
          const selector = params.selector as string;
          const value = params.value as string;
          if (!selector || value === undefined) {
            return Err({ code: 'MCP_UNAVAILABLE' as const, message: 'fill requires "selector" and "value" params', recoverable: false });
          }
          await page.fill(selector, value, { timeout: 10000 });
          return Ok({ filled: selector });
        }

        case 'type': {
          const text = params.text as string;
          if (!text) {
            return Err({ code: 'MCP_UNAVAILABLE' as const, message: 'type requires a "text" param', recoverable: false });
          }
          await page.keyboard.type(text);
          return Ok({ typed: text.length });
        }

        case 'pressKey': {
          const key = params.key as string;
          if (!key) {
            return Err({ code: 'MCP_UNAVAILABLE' as const, message: 'pressKey requires a "key" param', recoverable: false });
          }
          await page.keyboard.press(key);
          return Ok({ pressed: key });
        }

        case 'drag': {
          const from = params.from as { x: number; y: number };
          const to = params.to as { x: number; y: number };
          if (!from || !to) {
            return Err({ code: 'MCP_UNAVAILABLE' as const, message: 'drag requires "from" and "to" params', recoverable: false });
          }
          await page.mouse.move(from.x, from.y);
          await page.mouse.down();
          await page.mouse.move(to.x, to.y, { steps: 10 });
          await page.mouse.up();
          return Ok({ dragged: { from, to } });
        }

        case 'waitFor': {
          const selector = params.selector as string;
          const timeout = (params.timeout as number) ?? 10000;
          if (!selector) {
            return Err({ code: 'MCP_UNAVAILABLE' as const, message: 'waitFor requires a "selector" param', recoverable: false });
          }
          await page.waitForSelector(selector, { timeout });
          return Ok({ found: selector });
        }

        default:
          return Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: `Unknown Playwright MCP method: ${method}`,
            recoverable: false,
          });
      }
    } catch (err) {
      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: `Playwright transport error: ${err instanceof Error ? err.message : String(err)}`,
        recoverable: true,
      });
    }
  };
}

/**
 * Launch a Playwright browser and create a full transport handle.
 * Playwright is dynamically imported so this module can be imported
 * without playwright being installed.
 *
 * @param config - Browser launch options
 * @returns Handle with transport, page, and close function
 */
export async function createPlaywrightTransport(
  config: PlaywrightTransportConfig = {},
): Promise<PlaywrightTransportHandle> {
  const { chromium } = await import('playwright');

  const headless = config.headless ?? true;
  const width = config.viewportWidth ?? 1280;
  const height = config.viewportHeight ?? 720;

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();

  const transport = createPlaywrightTransportFromPage(() => page);

  return {
    transport,
    page,
    async close(): Promise<void> {
      await browser.close();
    },
  };
}

/** Tool definitions exposed by the Playwright transport. */
export { PLAYWRIGHT_TOOLS };
