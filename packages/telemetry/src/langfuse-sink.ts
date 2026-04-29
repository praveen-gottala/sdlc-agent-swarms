/**
 * @module @agentforge/telemetry/langfuse-sink
 *
 * PipelineTelemetrySink implementation that creates Langfuse observations
 * for pipeline lifecycle events. Uses `wrapStage()` with
 * `startActiveObservation` to establish proper parent-child span hierarchy:
 * stage span → LLM generation spans nest automatically via OTel context.
 *
 * LLM call content (prompt/response) is captured by TracedProvider
 * (traced-provider.ts), not by this sink.
 */

import { startActiveObservation } from '@langfuse/tracing';
import type { PipelineTelemetrySink } from '@agentforge/agents-ux';
import { isLangfuseConfigured } from './otel-init.js';

/** Pipeline lifecycle span sink for Langfuse. */
export class LangfuseSink implements PipelineTelemetrySink {
  readonly traceId: string;

  constructor(
    traceId: string,
    _meta?: { projectName?: string },
  ) {
    this.traceId = traceId;
  }

  async wrapStage<T>(
    stage: string,
    attrs: { agentRole: string; moduleId: string; taskId: string },
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!isLangfuseConfigured()) return fn();

    return startActiveObservation(
      `stage:${stage}`,
      async (span) => {
        span.update({
          metadata: {
            'pipeline.stage': stage,
            'pipeline.agentRole': attrs.agentRole,
            'pipeline.moduleId': attrs.moduleId,
            'pipeline.taskId': attrs.taskId,
          },
        });

        try {
          const result = await fn();
          return result;
        } catch (err) {
          span.update({
            level: 'ERROR',
            metadata: { 'pipeline.error': String(err) },
          });
          throw err;
        }
      },
    );
  }

  onStageStart(stage: string, attrs: { agentRole: string; moduleId: string; taskId: string }): void {
    if (process.env.LANGFUSE_DEBUG === 'true') {
      console.debug(`[langfuse-sink] stage:${stage} started`, attrs);
    }
  }

  onStageComplete(stage: string, result: { costUsd?: number; tokensUsed?: number }): void {
    if (process.env.LANGFUSE_DEBUG === 'true') {
      console.debug(`[langfuse-sink] stage:${stage} complete`, result);
    }
  }

  onStageFail(stage: string, error: string): void {
    if (process.env.LANGFUSE_DEBUG === 'true') {
      console.debug(`[langfuse-sink] stage:${stage} FAILED:`, error);
    }
  }

  onLlmCall(stage: string, attrs: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    latencyMs: number;
  }): void {
    if (process.env.LANGFUSE_DEBUG === 'true') {
      console.debug(`[langfuse-sink] llm:${stage}`, attrs);
    }
  }

  onLog(stage: string, level: 'info' | 'warn' | 'error', message: string): void {
    if (process.env.LANGFUSE_DEBUG === 'true') {
      console.debug(`[langfuse-sink] ${level}:${stage}:`, message);
    }
  }
}

/**
 * Create a LangfuseSink if Langfuse is configured, otherwise null.
 * Callers use CompositeSink to combine with their transport sink.
 */
export function createLangfuseSink(
  traceId: string,
  meta?: { projectName?: string },
): LangfuseSink | null {
  if (!isLangfuseConfigured()) return null;
  return new LangfuseSink(traceId, meta ?? {});
}
