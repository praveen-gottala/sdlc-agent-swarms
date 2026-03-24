/**
 * @module figma-screenshot.test
 *
 * Unit tests for the Figma screenshot capture utility.
 */

import { Ok, Err } from '@agentforge/core';
import { captureFigmaScreenshot, captureFigmaScreenshotViaBridge } from './figma-screenshot.js';

// ============================================================================
// Mock setup
// ============================================================================

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Create a mock MCPClient for bridge tests. */
function makeMockMcpClient(callToolFn: (server: string, method: string, params: Record<string, unknown>) => Promise<unknown>) {
  return {
    callTool: callToolFn as never,
    listTools: jest.fn().mockResolvedValue(Ok([])),
    isAvailable: jest.fn().mockResolvedValue(true),
  };
}

// ============================================================================
// Tests — REST API (captureFigmaScreenshot)
// ============================================================================

describe('captureFigmaScreenshot', () => {
  it('constructs the correct Figma API URL', async () => {
    const capturedUrls: string[] = [];
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input);
      capturedUrls.push(url);
      if (url.includes('api.figma.com')) {
        return new Response(JSON.stringify({ images: { '123:456': 'https://example.com/img.png' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(Buffer.from('PNG'), { status: 200 });
    };

    await captureFigmaScreenshot('token123', 'fileABC', '123:456', 2);
    const apiUrl = capturedUrls[0];
    expect(apiUrl).toContain('https://api.figma.com/v1/images/fileABC');
    expect(apiUrl).toContain('ids=123%3A456');
    expect(apiUrl).toContain('scale=2');
    expect(apiUrl).toContain('format=png');
  });

  it('handles successful image response', async () => {
    let callCount = 0;
    globalThis.fetch = async (input: string | URL | Request) => {
      callCount++;
      const url = String(input);
      if (url.includes('api.figma.com')) {
        return new Response(
          JSON.stringify({ images: { '1:1': 'https://example.com/img.png' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      // Image fetch
      return new Response(Buffer.from('PNG_IMAGE_DATA'), {
        status: 200,
      });
    };

    const result = await captureFigmaScreenshot('token', 'file1', '1:1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.imageUrl).toBe('https://example.com/img.png');
      expect(result.value.base64).toBeTruthy();
    }
    expect(callCount).toBe(2); // API call + image fetch
  });

  it('retries once on null URL', async () => {
    let apiCallCount = 0;
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('api.figma.com')) {
        apiCallCount++;
        if (apiCallCount === 1) {
          return new Response(
            JSON.stringify({ images: { '1:1': null } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({ images: { '1:1': 'https://example.com/img.png' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(Buffer.from('PNG'), { status: 200 });
    };

    const result = await captureFigmaScreenshot('token', 'file1', '1:1');
    expect(result.ok).toBe(true);
    expect(apiCallCount).toBe(2); // First null, then retry
  }, 10000);

  it('reports response keys when all retries exhausted', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({ images: { 'wrong:key': 'https://example.com/img.png' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const result = await captureFigmaScreenshot('token', 'file1', '1:1', 2, 2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('response keys: wrong:key');
    }
  }, 15000);

  it('returns Err on API failure (401)', async () => {
    globalThis.fetch = async () => {
      return new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    };

    const result = await captureFigmaScreenshot('bad-token', 'file1', '1:1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('401');
    }
  });

  it('returns Err on API failure (404)', async () => {
    globalThis.fetch = async () => {
      return new Response('Not Found', { status: 404, statusText: 'Not Found' });
    };

    const result = await captureFigmaScreenshot('token', 'bad-file', '1:1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('404');
    }
  });

  it('returns Err on API failure (429)', async () => {
    globalThis.fetch = async () => {
      return new Response('Too Many Requests', { status: 429, statusText: 'Too Many Requests' });
    };

    const result = await captureFigmaScreenshot('token', 'file1', '1:1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('429');
      expect(result.error.recoverable).toBe(true);
    }
  });
});

// ============================================================================
// Tests — Bridge (captureFigmaScreenshotViaBridge)
// ============================================================================

describe('captureFigmaScreenshotViaBridge', () => {
  it('returns base64 data from bridge export_node_as_image', async () => {
    const client = makeMockMcpClient(async () =>
      Ok({ imageData: 'iVBORw0KGgoAAAANSUhEUg==', imageUrl: '' }),
    );

    const result = await captureFigmaScreenshotViaBridge(client as never, '42:1030');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.base64).toBe('iVBORw0KGgoAAAANSUhEUg==');
      expect(result.value.imageUrl).toBe('bridge://export');
    }
  });

  it('strips data URI prefix from base64', async () => {
    const client = makeMockMcpClient(async () =>
      Ok({ imageData: 'data:image/png;base64,ABCDEF123456' }),
    );

    const result = await captureFigmaScreenshotViaBridge(client as never, '42:1030');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.base64).toBe('ABCDEF123456');
    }
  });

  it('fetches image URL when no base64 data is returned', async () => {
    const client = makeMockMcpClient(async () =>
      Ok({ imageUrl: 'https://example.com/exported.png' }),
    );
    globalThis.fetch = async () => new Response(Buffer.from('PNG_DATA'), { status: 200 });

    const result = await captureFigmaScreenshotViaBridge(client as never, '42:1030');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.imageUrl).toBe('https://example.com/exported.png');
      expect(result.value.base64).toBeTruthy();
    }
  });

  it('returns Err when bridge call fails', async () => {
    const client = makeMockMcpClient(async () =>
      Err({ code: 'MCP_UNAVAILABLE', message: 'Bridge disconnected', recoverable: true }),
    );

    const result = await captureFigmaScreenshotViaBridge(client as never, '42:1030');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Bridge export_node_as_image failed');
    }
  });

  it('returns Err when no image data or URL returned', async () => {
    const client = makeMockMcpClient(async () =>
      Ok({ nodeId: '42:1030', status: 'ok' }),
    );

    const result = await captureFigmaScreenshotViaBridge(client as never, '42:1030');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('returned no image data');
      expect(result.error.message).toContain('keys: nodeId, status');
    }
  });

  it('passes nodeId, format, and scale to bridge', async () => {
    const captured: Array<{ server: string; method: string; params: Record<string, unknown> }> = [];
    const client = makeMockMcpClient(async (server, method, params) => {
      captured.push({ server, method, params });
      return Ok({ imageData: 'base64data' });
    });

    await captureFigmaScreenshotViaBridge(client as never, '99:500', 3);
    expect(captured[0].server).toBe('figma-write');
    expect(captured[0].method).toBe('export_node_as_image');
    expect(captured[0].params).toEqual({ nodeId: '99:500', format: 'PNG', scale: 3 });
  });
});
