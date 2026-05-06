/**
 * Scope: getSharedCheckpointer() singleton behavior.
 * Owns: packages/dashboard/src/app/api/_lib/checkpointer.ts
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

const g = globalThis as Record<string, unknown>;

let mockCreateReject = false;

jest.mock('@agentforge/core', () => ({
  createCheckpointer: () =>
    mockCreateReject
      ? Promise.reject(new Error('no postgres'))
      : Promise.resolve({ __test: 'postgres-checkpointer' }),
  MemorySaver: class FakeMemorySaver {
    readonly __test = 'memory-saver';
  },
}));

beforeEach(() => {
  delete g.__clarifierCheckpointer;
  mockCreateReject = false;
  jest.resetModules();
});

describe('getSharedCheckpointer', () => {
  it('returns same instance on second call', async () => {
    const { getSharedCheckpointer } = await import('../checkpointer.js');

    const first = await getSharedCheckpointer();
    const second = await getSharedCheckpointer();
    expect(first).toBe(second);
  });

  it('stores instance on globalThis', async () => {
    const { getSharedCheckpointer } = await import('../checkpointer.js');

    await getSharedCheckpointer();
    expect(g.__clarifierCheckpointer).toBeDefined();
  });

  it('falls back to MemorySaver when createCheckpointer fails', async () => {
    mockCreateReject = true;
    const { getSharedCheckpointer } = await import('../checkpointer.js');

    const cp = await getSharedCheckpointer();
    expect(cp).toHaveProperty('__test', 'memory-saver');
  });
});
