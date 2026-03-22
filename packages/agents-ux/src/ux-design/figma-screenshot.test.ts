/**
 * @module figma-screenshot.test
 *
 * Unit tests for the Figma screenshot capture utility.
 */

import { captureFigmaScreenshot } from './figma-screenshot.js';

// ============================================================================
// Mock setup
// ============================================================================

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ============================================================================
// Tests
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
