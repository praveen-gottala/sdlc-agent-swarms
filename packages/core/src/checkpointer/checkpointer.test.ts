/**
 * Tests for the checkpointer factory.
 * Uses MemorySaver (no Postgres required).
 * Integration tests with Postgres are in checkpointer.integration.test.ts.
 */

import { createCheckpointer, MemorySaver } from './index.js';

describe('createCheckpointer', () => {
  const originalEnv = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DATABASE_URL = originalEnv;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it('returns MemorySaver when no connection string provided', async () => {
    delete process.env.DATABASE_URL;
    const saver = await createCheckpointer();
    expect(saver).toBeInstanceOf(MemorySaver);
  });

  it('returns MemorySaver when config is empty', async () => {
    delete process.env.DATABASE_URL;
    const saver = await createCheckpointer({});
    expect(saver).toBeInstanceOf(MemorySaver);
  });

  it('returns MemorySaver when config has no connectionString and DATABASE_URL unset', async () => {
    delete process.env.DATABASE_URL;
    const saver = await createCheckpointer({ schema: 'test' });
    expect(saver).toBeInstanceOf(MemorySaver);
  });

  it('MemorySaver can store and retrieve a checkpoint', async () => {
    delete process.env.DATABASE_URL;
    const saver = await createCheckpointer();

    const checkpoint = {
      v: 1,
      id: 'test-checkpoint-1',
      ts: new Date().toISOString(),
      channel_values: { messages: ['hello'] },
      channel_versions: { messages: 1 },
      versions_seen: {},
      pending_sends: [],
    };

    const config = { configurable: { thread_id: 'thread-1', checkpoint_id: 'test-checkpoint-1' } };
    const metadata = { source: 'input' as const, step: 0, writes: null, parents: {} };

    await saver.put(config, checkpoint, metadata, {});

    const retrieved = await saver.getTuple(config);
    expect(retrieved).toBeDefined();
    expect(retrieved?.checkpoint.id).toBe('test-checkpoint-1');
  });
});
