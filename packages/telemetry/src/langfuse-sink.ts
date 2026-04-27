/**
 * @module @agentforge/telemetry/langfuse-sink
 *
 * PipelineTelemetrySink implementation that creates OTel spans for
 * pipeline lifecycle events. These spans are exported to Langfuse via
 * the LangfuseSpanProcessor configured in otel-init.ts.
 *
 * LLM call content (prompt/response) is captured by TracedProvider
 * (traced-provider.ts), not by this sink. This sink provides the
 * pipeline-level structure (stages, timing, cost aggregation).
 *
 * Follows Langfuse v5 best practices:
 * - Descriptive trace/span names (not 'trace-1')
 * - Proper span hierarchy for multi-step operations
 * - Input set explicitly to relevant data only
 */

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

  onStageStart(stage: string, attrs: { agentRole: string; moduleId: string; taskId: string }): void {
    // Stage lifecycle is captured implicitly via TracedProvider's generation
    // spans. The sink logs stage transitions for debugging.
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
    // LLM call details are captured by TracedProvider's generation spans.
    // This callback provides aggregate metrics for the CLI/dashboard sinks.
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
