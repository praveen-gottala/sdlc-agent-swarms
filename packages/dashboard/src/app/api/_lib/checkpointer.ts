/**
 * Shared LangGraph checkpointer singleton for the dashboard API.
 *
 * Without this, each Next.js API request creates its own MemorySaver.
 * The initial /api/clarifier request's checkpoint is garbage collected
 * when the response ends, so /api/clarifier/respond has no checkpoint
 * to resume from — causing the graph to restart from __start__.
 *
 * Uses globalThis (not module scope) because Next.js dev mode hot-reloads
 * modules, which creates fresh module scopes and loses module-level vars.
 * globalThis persists across hot-reloads — same pattern as Prisma client.
 */

import { createCheckpointer, MemorySaver } from '@agentforge/core';
import type { BaseCheckpointSaver } from '@agentforge/core';

const g = globalThis as unknown as { __clarifierCheckpointer?: BaseCheckpointSaver };

export async function getSharedCheckpointer(): Promise<BaseCheckpointSaver> {
  if (g.__clarifierCheckpointer) return g.__clarifierCheckpointer;
  try {
    g.__clarifierCheckpointer = await createCheckpointer();
  } catch (err) {
    console.warn(
      'Failed to create Postgres checkpointer, falling back to in-memory MemorySaver.',
      'Checkpoints will NOT survive process restarts.',
      err instanceof Error ? err.message : String(err),
    );
    g.__clarifierCheckpointer = new MemorySaver();
  }
  return g.__clarifierCheckpointer;
}
