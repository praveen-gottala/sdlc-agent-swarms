/**
 * @module dashboard-sink
 *
 * Dashboard SSE sink for PipelineTelemetrySink. Bridges pipeline telemetry
 * callbacks to the dashboard's event-writer (events.jsonl) and run-manager
 * (runs/*.json) systems.
 *
 * The evaluator stage is hidden from the UI (stage count stays 3).
 */

import type { PipelineTelemetrySink } from '@agentforge/agents-ux';
import type { PipelineRunProgress } from '@agentforge/core';
import { emitStageEvent, emitLLMCallEvent, emitAgentLogEvent } from './event-writer';
import { updateRunStatus } from './run-manager';

const STAGE_INDEX: Record<string, number> = {
  research: 0,
  planning: 1,
  design: 2,
};

const VISIBLE_STAGE_COUNT = 3;

const HIDDEN_STAGES = new Set(['evaluator']);

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface SinkCallEntry {
  readonly method: string;
  readonly stage: string;
  readonly args: unknown[];
}

/** Dashboard SSE implementation of PipelineTelemetrySink. */
export class DashboardSseSink implements PipelineTelemetrySink {
  private readonly log: SinkCallEntry[] = [];
  private accumulatedCostUsd = 0;
  private accumulatedTokens = 0;

  constructor(
    private readonly runId: string,
    private readonly pipeline: PipelineRunProgress['pipeline'],
    private readonly taskId: string,
  ) {}

  onStageStart(stage: string, attrs: { agentRole: string; moduleId: string; taskId: string }): void {
    this.log.push({ method: 'onStageStart', stage, args: [attrs] });

    if (HIDDEN_STAGES.has(stage)) return;

    const idx = STAGE_INDEX[stage] ?? 0;
    const label = capitalize(stage);

    updateRunStatus(this.runId, {
      status: 'running',
      stage: label,
      progress: { current: idx, total: VISIBLE_STAGE_COUNT, label },
      agentRole: attrs.agentRole,
      stageDescription: `Running ${label} stage`,
    });

    emitStageEvent(
      this.runId, this.pipeline, label, idx, VISIBLE_STAGE_COUNT,
      'started', attrs.agentRole, undefined, this.taskId,
      `${label}: running`,
    );
  }

  onStageComplete(stage: string, result: { costUsd?: number; tokensUsed?: number }): void {
    this.log.push({ method: 'onStageComplete', stage, args: [result] });

    if (result.costUsd) this.accumulatedCostUsd += result.costUsd;
    if (result.tokensUsed) this.accumulatedTokens += result.tokensUsed;

    if (HIDDEN_STAGES.has(stage)) return;

    const idx = STAGE_INDEX[stage] ?? 0;
    const label = capitalize(stage);
    const cost = result.costUsd || result.tokensUsed
      ? { totalCostUsd: result.costUsd ?? 0, tokensUsed: result.tokensUsed ?? 0 }
      : undefined;

    emitStageEvent(
      this.runId, this.pipeline, label, idx, VISIBLE_STAGE_COUNT,
      'completed', undefined, cost, this.taskId,
      `${label} complete`,
    );
  }

  onStageFail(stage: string, error: string): void {
    this.log.push({ method: 'onStageFail', stage, args: [error] });

    const label = capitalize(stage);
    emitStageEvent(
      this.runId, this.pipeline, label, 0, VISIBLE_STAGE_COUNT,
      'failed', undefined, undefined, this.taskId,
      `${label} failed: ${error}`,
    );
  }

  onLlmCall(stage: string, attrs: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    latencyMs: number;
  }): void {
    this.log.push({ method: 'onLlmCall', stage, args: [attrs] });

    this.accumulatedCostUsd += attrs.costUsd;
    this.accumulatedTokens += attrs.promptTokens + attrs.completionTokens;

    emitLLMCallEvent(
      this.runId, capitalize(stage), undefined, this.taskId,
      attrs.model, attrs.promptTokens, attrs.completionTokens,
      attrs.costUsd, attrs.latencyMs,
    );
  }

  onLog(stage: string, level: 'info' | 'warn' | 'error', message: string): void {
    this.log.push({ method: 'onLog', stage, args: [message] });

    emitAgentLogEvent(
      this.runId, capitalize(stage), undefined, this.taskId,
      level, message,
    );
  }

  /** Ordered list of method calls for contract tests. */
  getCallLog(): SinkCallEntry[] {
    return this.log;
  }

  /** Accumulated cost across all LLM calls and stage completions. */
  getTotalCostUsd(): number {
    return this.accumulatedCostUsd;
  }

  /** Accumulated tokens across all LLM calls. */
  getTotalTokens(): number {
    return this.accumulatedTokens;
  }
}
