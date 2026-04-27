/**
 * @module @agentforge/telemetry/composite-sink
 *
 * Forwards all PipelineTelemetrySink calls to multiple sinks.
 * Used to combine transport-specific sinks (CLI stdout, dashboard SSE)
 * with the Langfuse observability sink.
 */

import type { PipelineTelemetrySink } from '@agentforge/agents-ux';

/** Forwards all sink callbacks to every sink in the list. */
export class CompositeSink implements PipelineTelemetrySink {
  constructor(private readonly sinks: readonly PipelineTelemetrySink[]) {}

  onStageStart(stage: string, attrs: { agentRole: string; moduleId: string; taskId: string }): void {
    for (const s of this.sinks) s.onStageStart(stage, attrs);
  }

  onStageComplete(stage: string, result: { costUsd?: number; tokensUsed?: number }): void {
    for (const s of this.sinks) s.onStageComplete(stage, result);
  }

  onStageFail(stage: string, error: string): void {
    for (const s of this.sinks) s.onStageFail(stage, error);
  }

  onLlmCall(stage: string, attrs: { model: string; promptTokens: number; completionTokens: number; costUsd: number; latencyMs: number }): void {
    for (const s of this.sinks) s.onLlmCall(stage, attrs);
  }

  onLog(stage: string, level: 'info' | 'warn' | 'error', message: string): void {
    for (const s of this.sinks) s.onLog(stage, level, message);
  }
}
