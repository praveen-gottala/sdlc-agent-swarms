/**
 * Integration tests for PostgresSaver checkpointer.
 * Requires Docker Postgres running on port 5433:
 *   docker compose -f docker/docker-compose.agentforge.yml up -d
 *
 * Skipped when AGENTFORGE_TEST_POSTGRES is not set.
 */

import { createCheckpointer } from './index.js';

const POSTGRES_URL = 'postgresql://agentforge:agentforge_dev@localhost:5433/agentforge';

const describeIf = process.env.AGENTFORGE_TEST_POSTGRES ? describe : describe.skip;

describeIf('PostgresSaver integration', () => {
  it('creates checkpointer from connection string', async () => {
    const saver = await createCheckpointer({ connectionString: POSTGRES_URL });
    expect(saver).toBeDefined();
    expect(saver.constructor.name).toBe('PostgresSaver');
  });

  it('stores and retrieves a checkpoint', async () => {
    const saver = await createCheckpointer({ connectionString: POSTGRES_URL });

    const checkpoint = {
      v: 1,
      id: `integration-${Date.now()}`,
      ts: new Date().toISOString(),
      channel_values: { requirement: 'Build a task app' },
      channel_versions: { requirement: 1 },
      versions_seen: {},
      pending_sends: [],
    };

    const config = {
      configurable: {
        thread_id: `integration-thread-${Date.now()}`,
        checkpoint_id: checkpoint.id,
      },
    };
    const metadata = { source: 'input' as const, step: 0, writes: null, parents: {} };

    await saver.put(config, checkpoint, metadata, {});

    const retrieved = await saver.getTuple(config);
    expect(retrieved).toBeDefined();
    expect(retrieved?.checkpoint.id).toBe(checkpoint.id);
    expect(retrieved?.checkpoint.channel_values).toEqual({ requirement: 'Build a task app' });
  });

  it('retrieves checkpoints by thread_id', async () => {
    const saver = await createCheckpointer({ connectionString: POSTGRES_URL });
    const threadId = `list-thread-${Date.now()}`;

    for (let i = 0; i < 3; i++) {
      const checkpoint = {
        v: 1,
        id: `list-cp-${i}-${Date.now()}`,
        ts: new Date().toISOString(),
        channel_values: { step: i },
        channel_versions: { step: i + 1 },
        versions_seen: {},
        pending_sends: [],
      };
      const config = { configurable: { thread_id: threadId, checkpoint_id: checkpoint.id } };
      const metadata = { source: 'input' as const, step: i, writes: null, parents: {} };
      await saver.put(config, checkpoint, metadata, {});
    }

    const checkpoints: unknown[] = [];
    for await (const cp of saver.list({ configurable: { thread_id: threadId } })) {
      checkpoints.push(cp);
    }
    expect(checkpoints.length).toBe(3);
  });
});
