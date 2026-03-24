import { createPenpotConnection } from './penpot-transport.js';

// ============================================================================
// Helpers
// ============================================================================

/** Build a mock Response with optional headers and body. */
function mockResponse(
  body: string,
  opts: { status?: number; ok?: boolean; headers?: Record<string, string> } = {},
): Response {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const headers = new Headers(opts.headers ?? {});
  return {
    ok,
    status,
    headers,
    text: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

/** Standard initialize + notifications/initialized response pair. */
function mockInitializeFlow(
  fetchSpy: jest.SpyInstance,
  sessionId = 'session-abc-123',
  startIndex = 0,
): void {
  // initialize response
  fetchSpy.mockResolvedValueOnce(
    mockResponse(
      JSON.stringify({ jsonrpc: '2.0', id: startIndex + 1, result: { protocolVersion: '2025-03-26', capabilities: {} } }),
      { headers: { 'mcp-session-id': sessionId } },
    ),
  );
  // notifications/initialized response (202, no body)
  fetchSpy.mockResolvedValueOnce(
    mockResponse('', { status: 202 }),
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('createPenpotConnection', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unmocked fetch'));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ── healthCheck ──

  it('healthCheck returns Err when server is unreachable', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

    const conn = createPenpotConnection({ mcpUrl: 'http://localhost:9999/mcp' });
    const result = await conn.healthCheck();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MCP_UNAVAILABLE');
      expect(result.error.message).toContain('ECONNREFUSED');
      expect(result.error.recoverable).toBe(true);
    }
  });

  // ── callTool ──

  it('callTool sends correct JSON-RPC envelope with tools/call method', async () => {
    mockInitializeFlow(fetchSpy);

    // tools/call response
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        JSON.stringify({ jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: '{"result":"ok"}' }] } }),
        { headers: { 'mcp-session-id': 'session-abc-123' } },
      ),
    );

    const conn = createPenpotConnection();
    await conn.callTool('execute_code', { code: 'return 1;' });

    // Third call is the tools/call
    const toolCall = fetchSpy.mock.calls[2];
    expect(toolCall[0]).toBe('http://localhost:4401/mcp');

    const body = JSON.parse(toolCall[1].body as string) as Record<string, unknown>;
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('tools/call');
    expect(body.params).toEqual({ name: 'execute_code', arguments: { code: 'return 1;' } });
    expect(typeof body.id).toBe('number');
  });

  // ── discoverTools caching ──

  it('discoverTools returns cached tools on second call', async () => {
    mockInitializeFlow(fetchSpy);

    const toolsPayload = {
      tools: [
        { name: 'execute_code', description: 'Run JS code', inputSchema: { type: 'object' } },
        { name: 'export_shape', description: 'Export a shape', inputSchema: {} },
      ],
    };

    // tools/list response
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        JSON.stringify({ jsonrpc: '2.0', id: 3, result: toolsPayload }),
        { headers: { 'mcp-session-id': 'session-abc-123' } },
      ),
    );

    const conn = createPenpotConnection();

    const first = await conn.discoverTools();
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value).toHaveLength(2);
      expect(first.value[0].name).toBe('execute_code');
    }

    // Second call should NOT trigger another fetch
    const second = await conn.discoverTools();
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value).toHaveLength(2);
    }

    // Only 3 fetches: initialize, notifications/initialized, tools/list
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  // ── disconnect ──

  it('disconnect resets state (isConnected returns false, cache cleared)', async () => {
    mockInitializeFlow(fetchSpy);

    // tools/list response
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        JSON.stringify({ jsonrpc: '2.0', id: 3, result: { tools: [{ name: 'execute_code', description: '' }] } }),
        { headers: { 'mcp-session-id': 'session-abc-123' } },
      ),
    );

    const conn = createPenpotConnection();

    // Initialize and cache tools
    await conn.discoverTools();
    expect(conn.isConnected()).toBe(true);

    // Disconnect
    conn.disconnect();
    expect(conn.isConnected()).toBe(false);

    // After disconnect, discoverTools should re-initialize (requires new mocks)
    mockInitializeFlow(fetchSpy, 'session-new-456');
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        JSON.stringify({ jsonrpc: '2.0', id: 6, result: { tools: [{ name: 'export_shape', description: '' }] } }),
        { headers: { 'mcp-session-id': 'session-new-456' } },
      ),
    );

    const result = await conn.discoverTools();
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should have fresh tools (not cached from before disconnect)
      expect(result.value[0].name).toBe('export_shape');
    }
  });

  // ── SSE response parsing ──

  it('SSE response parsing (event: message, data: {...}) works', async () => {
    mockInitializeFlow(fetchSpy);

    // Return SSE-formatted response for tools/call
    const sseBody = 'event: message\ndata: {"jsonrpc":"2.0","id":3,"result":{"value":"sse-parsed"}}\n\n';
    fetchSpy.mockResolvedValueOnce(
      mockResponse(sseBody, { headers: { 'mcp-session-id': 'session-abc-123' } }),
    );

    const conn = createPenpotConnection();
    const result = await conn.callTool('execute_code', { code: 'return 1;' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ value: 'sse-parsed' });
    }
  });

  // ── plain JSON fallback ──

  it('plain JSON response parsing works as fallback', async () => {
    mockInitializeFlow(fetchSpy);

    // Return plain JSON (not SSE-wrapped)
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        JSON.stringify({ jsonrpc: '2.0', id: 3, result: { value: 'plain-json' } }),
        { headers: { 'mcp-session-id': 'session-abc-123' } },
      ),
    );

    const conn = createPenpotConnection();
    const result = await conn.callTool('execute_code', { code: 'return 1;' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ value: 'plain-json' });
    }
  });

  // ── initialize handshake ──

  it('initialize handshake extracts session ID from response header', async () => {
    const sessionId = 'my-custom-session-id-42';
    mockInitializeFlow(fetchSpy, sessionId);

    const conn = createPenpotConnection();

    // healthCheck triggers initialization
    const result = await conn.healthCheck();
    expect(result.ok).toBe(true);
    expect(conn.isConnected()).toBe(true);

    // Verify session ID is sent in subsequent requests
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        JSON.stringify({ jsonrpc: '2.0', id: 3, result: { tools: [] } }),
        { headers: { 'mcp-session-id': sessionId } },
      ),
    );

    await conn.discoverTools();

    // The tools/list call should include the session header
    const toolsListCall = fetchSpy.mock.calls[2];
    const headers = toolsListCall[1].headers as Record<string, string>;
    expect(headers['Mcp-Session-Id']).toBe(sessionId);
  });

  // ── error handling ──

  it('callTool returns Err when server responds with HTTP error', async () => {
    mockInitializeFlow(fetchSpy);

    fetchSpy.mockResolvedValueOnce(
      mockResponse('Internal Server Error', { status: 500, ok: false }),
    );

    const conn = createPenpotConnection();
    const result = await conn.callTool('execute_code', { code: 'fail' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MCP_UNAVAILABLE');
      expect(result.error.message).toContain('HTTP 500');
      expect(result.error.recoverable).toBe(true);
    }
  });

  it('callTool returns Err when response contains JSON-RPC error', async () => {
    mockInitializeFlow(fetchSpy);

    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        JSON.stringify({ jsonrpc: '2.0', id: 3, error: { code: -32600, message: 'Invalid Request' } }),
        { headers: { 'mcp-session-id': 'session-abc-123' } },
      ),
    );

    const conn = createPenpotConnection();
    const result = await conn.callTool('execute_code', { code: 'bad' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MCP_UNAVAILABLE');
      expect(result.error.message).toContain('Invalid Request');
    }
  });
});
