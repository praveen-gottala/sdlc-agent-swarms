import { createPlaywrightTransportFromPage, PLAYWRIGHT_TOOLS } from './playwright-transport.js';
import type { MCPRequest } from './mcp-middleware.js';

// ---------------------------------------------------------------------------
// Inline mock page (core has no dependency on agents-ux test utils)
// ---------------------------------------------------------------------------

function createMockPage() {
  const ariaSnapshot = jest.fn().mockResolvedValue('<aria-tree />');
  return {
    goto: jest.fn().mockResolvedValue(undefined),
    locator: jest.fn().mockReturnValue({ ariaSnapshot }),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-png')),
    evaluate: jest.fn().mockResolvedValue(42),
    click: jest.fn().mockResolvedValue(undefined),
    fill: jest.fn().mockResolvedValue(undefined),
    keyboard: {
      type: jest.fn().mockResolvedValue(undefined),
      press: jest.fn().mockResolvedValue(undefined),
    },
    mouse: {
      move: jest.fn().mockResolvedValue(undefined),
      down: jest.fn().mockResolvedValue(undefined),
      up: jest.fn().mockResolvedValue(undefined),
    },
    waitForSelector: jest.fn().mockResolvedValue(undefined),
  };
}

function req(method: string, params: Record<string, unknown> = {}): MCPRequest {
  return { server: 'playwright', method, params };
}

describe('createPlaywrightTransportFromPage', () => {
  // -----------------------------------------------------------------------
  // listTools
  // -----------------------------------------------------------------------
  it('listTools returns 10 tools with name, description, inputSchema', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('listTools'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tools = result.value as Array<{ name: string; description: string; inputSchema: object }>;
    expect(tools).toHaveLength(10);
    for (const tool of tools) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
    }
  });

  // -----------------------------------------------------------------------
  // navigate
  // -----------------------------------------------------------------------
  it('navigate calls page.goto and returns Ok({ navigated })', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('navigate', { url: 'https://example.com' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ navigated: 'https://example.com' });
    expect(page.goto).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ waitUntil: 'load' }));
  });

  it('navigate returns Err on missing url', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('navigate', {}));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('url');
  });

  // -----------------------------------------------------------------------
  // snapshot
  // -----------------------------------------------------------------------
  it('snapshot calls ariaSnapshot and returns Ok({ ariaTree })', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('snapshot'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ ariaTree: '<aria-tree />' });
    expect(page.locator).toHaveBeenCalledWith('body');
  });

  // -----------------------------------------------------------------------
  // screenshot
  // -----------------------------------------------------------------------
  it('screenshot returns base64 encoded buffer', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('screenshot'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const v = result.value as { base64: string; format: string };
      expect(v.format).toBe('png');
      expect(v.base64).toBe(Buffer.from('fake-png').toString('base64'));
    }
  });

  it('screenshot passes clip when provided', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const clip = { x: 10, y: 20, width: 300, height: 200 };
    await transport(req('screenshot', { clip }));
    expect(page.screenshot).toHaveBeenCalledWith({ clip });
  });

  // -----------------------------------------------------------------------
  // evaluate
  // -----------------------------------------------------------------------
  it('evaluate calls page.evaluate and returns its result', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('evaluate', { expression: '1+1' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
    expect(page.evaluate).toHaveBeenCalledWith('1+1');
  });

  it('evaluate returns Err on missing expression', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('evaluate', {}));
    expect(result.ok).toBe(false);
  });

  // -----------------------------------------------------------------------
  // click
  // -----------------------------------------------------------------------
  it('click calls page.click with timeout', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('click', { selector: '#btn' }));
    expect(result.ok).toBe(true);
    expect(page.click).toHaveBeenCalledWith('#btn', { timeout: 10000 });
  });

  it('click returns Err on missing selector', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('click', {}));
    expect(result.ok).toBe(false);
  });

  // -----------------------------------------------------------------------
  // fill
  // -----------------------------------------------------------------------
  it('fill calls page.fill with selector and value', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('fill', { selector: 'input', value: 'hello' }));
    expect(result.ok).toBe(true);
    expect(page.fill).toHaveBeenCalledWith('input', 'hello', { timeout: 10000 });
  });

  it('fill returns Err on missing selector or value', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('fill', { selector: 'input' }));
    expect(result.ok).toBe(false);
  });

  // -----------------------------------------------------------------------
  // type
  // -----------------------------------------------------------------------
  it('type calls keyboard.type', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('type', { text: 'abc' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ typed: 3 });
    expect(page.keyboard.type).toHaveBeenCalledWith('abc');
  });

  it('type returns Err on missing text', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('type', {}));
    expect(result.ok).toBe(false);
  });

  // -----------------------------------------------------------------------
  // pressKey
  // -----------------------------------------------------------------------
  it('pressKey calls keyboard.press', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('pressKey', { key: 'Enter' }));
    expect(result.ok).toBe(true);
    expect(page.keyboard.press).toHaveBeenCalledWith('Enter');
  });

  it('pressKey returns Err on missing key', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('pressKey', {}));
    expect(result.ok).toBe(false);
  });

  // -----------------------------------------------------------------------
  // drag
  // -----------------------------------------------------------------------
  it('drag performs mouse move/down/move(steps)/up sequence', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const from = { x: 10, y: 20 };
    const to = { x: 100, y: 200 };
    const result = await transport(req('drag', { from, to }));
    expect(result.ok).toBe(true);
    expect(page.mouse.move).toHaveBeenCalledWith(10, 20);
    expect(page.mouse.down).toHaveBeenCalled();
    expect(page.mouse.move).toHaveBeenCalledWith(100, 200, { steps: 10 });
    expect(page.mouse.up).toHaveBeenCalled();
  });

  it('drag returns Err on missing from/to', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('drag', { from: { x: 1, y: 2 } }));
    expect(result.ok).toBe(false);
  });

  // -----------------------------------------------------------------------
  // waitFor
  // -----------------------------------------------------------------------
  it('waitFor calls waitForSelector with default timeout', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    await transport(req('waitFor', { selector: '.done' }));
    expect(page.waitForSelector).toHaveBeenCalledWith('.done', { timeout: 10000 });
  });

  it('waitFor uses custom timeout when provided', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    await transport(req('waitFor', { selector: '.done', timeout: 5000 }));
    expect(page.waitForSelector).toHaveBeenCalledWith('.done', { timeout: 5000 });
  });

  it('waitFor returns Err on missing selector', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('waitFor', {}));
    expect(result.ok).toBe(false);
  });

  // -----------------------------------------------------------------------
  // unknown method
  // -----------------------------------------------------------------------
  it('unknown method returns Err with method name', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('doesNotExist'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('doesNotExist');
  });

  // -----------------------------------------------------------------------
  // page throws
  // -----------------------------------------------------------------------
  it('page throws returns recoverable Err', async () => {
    const page = createMockPage();
    page.goto.mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED'));
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('navigate', { url: 'http://down.test' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.recoverable).toBe(true);
      expect(result.error.message).toContain('ERR_CONNECTION_REFUSED');
    }
  });

  // -----------------------------------------------------------------------
  // PLAYWRIGHT_TOOLS export consistency
  // -----------------------------------------------------------------------
  it('PLAYWRIGHT_TOOLS export matches listTools result', async () => {
    const page = createMockPage();
    const transport = createPlaywrightTransportFromPage(() => page);
    const result = await transport(req('listTools'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(PLAYWRIGHT_TOOLS);
  });
});
