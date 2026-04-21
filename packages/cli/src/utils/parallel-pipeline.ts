/**
 * @module @agentforge/cli/utils/parallel-pipeline
 *
 * Parallel page pipeline execution with semaphore-based concurrency control.
 * Used by design:page:all to run Research → Planning → Design for each page
 * concurrently while respecting LLM API rate limits.
 */

import type { Result } from '@agentforge/core';
import { Err } from '@agentforge/core';

/** Result of a parallel pipeline run for a single item. */
export interface ParallelResult<T> {
  readonly index: number;
  readonly result: Result<T>;
  readonly durationMs: number;
}

/** Options for parallel pipeline execution. */
export interface ParallelPipelineOptions {
  /** Maximum concurrent workers. Default: 3 */
  readonly concurrency?: number;
  /** Called when a worker starts. */
  readonly onStart?: (index: number, total: number) => void;
  /** Called when a worker completes. */
  readonly onComplete?: (index: number, total: number, success: boolean, durationMs: number) => void;
}

/**
 * Simple counting semaphore for concurrency limiting.
 * Callers acquire() before starting work and release() when done.
 */
class Semaphore {
  private permits: number;
  private readonly waitQueue: Array<() => void> = [];

  constructor(maxPermits: number) {
    this.permits = maxPermits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    const next = this.waitQueue.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }
}

/**
 * Run a worker function across all items with concurrency control.
 * Uses Promise.allSettled for failure isolation — one item's failure
 * doesn't abort others.
 */
export async function runParallel<TIn, TOut>(
  items: readonly TIn[],
  worker: (item: TIn, index: number) => Promise<Result<TOut>>,
  options?: ParallelPipelineOptions,
): Promise<readonly ParallelResult<TOut>[]> {
  const concurrency = options?.concurrency ?? 3;
  const semaphore = new Semaphore(concurrency);
  const total = items.length;

  const promises = items.map(async (item, index): Promise<ParallelResult<TOut>> => {
    await semaphore.acquire();
    const t0 = Date.now();
    options?.onStart?.(index, total);

    try {
      const result = await worker(item, index);
      const durationMs = Date.now() - t0;
      options?.onComplete?.(index, total, result.ok, durationMs);
      return { index, result, durationMs };
    } catch (err) {
      const durationMs = Date.now() - t0;
      const result = Err({
        code: 'PARALLEL_WORKER_ERROR' as const,
        message: err instanceof Error ? err.message : String(err),
        recoverable: true,
      }) as Result<TOut>;
      options?.onComplete?.(index, total, false, durationMs);
      return { index, result, durationMs };
    } finally {
      semaphore.release();
    }
  });

  const settled = await Promise.allSettled(promises);

  return settled.map((s, i): ParallelResult<TOut> => {
    if (s.status === 'fulfilled') return s.value;
    return {
      index: i,
      result: Err({
        code: 'PARALLEL_WORKER_ERROR' as const,
        message: s.reason instanceof Error ? s.reason.message : String(s.reason),
        recoverable: true,
      }) as Result<TOut>,
      durationMs: 0,
    };
  });
}
