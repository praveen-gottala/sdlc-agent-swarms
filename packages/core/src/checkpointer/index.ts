/**
 * @module @agentforge/core/checkpointer
 *
 * Factory for LangGraph checkpoint savers. Returns MemorySaver for dev
 * (in-memory, non-durable) or PostgresSaver for production (durable,
 * supports HITL interrupts and crash recovery).
 *
 * Vision Layer 4: Postgres LangGraph checkpointer for run state.
 */

import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { MemorySaver } from '@langchain/langgraph-checkpoint';

export interface CheckpointerConfig {
  readonly connectionString?: string;
  readonly schema?: string;
}

/**
 * Create a LangGraph checkpoint saver.
 *
 * When `connectionString` is provided, uses PostgresSaver (durable).
 * Otherwise falls back to MemorySaver (in-memory, dev only).
 *
 * PostgresSaver is loaded dynamically to avoid requiring pg when unused.
 */
export async function createCheckpointer(
  config?: CheckpointerConfig,
): Promise<BaseCheckpointSaver> {
  const connString = config?.connectionString ?? process.env.DATABASE_URL;

  if (!connString) {
    return new MemorySaver();
  }

  const { PostgresSaver } = await import('@langchain/langgraph-checkpoint-postgres');
  const saver = PostgresSaver.fromConnString(connString, {
    schema: config?.schema,
  });
  await saver.setup();
  return saver;
}

export { MemorySaver } from '@langchain/langgraph-checkpoint';
export type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
