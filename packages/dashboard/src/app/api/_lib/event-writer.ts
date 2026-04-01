/**
 * Wraps pipeline execution to write PipelineRunProgress events
 * to `.agentforge/events.jsonl` using the core file-event-bridge.
 */

import { writeBridgeEvent } from '@agentforge/core';
import type { PipelineRunProgress } from '@agentforge/core';
import { getActiveProjectRoot } from './project-reader';

/**
 * Emit a PipelineRunProgress event to the events.jsonl file bridge.
 */
export function emitStageEvent(
  runId: string,
  pipeline: PipelineRunProgress['pipeline'],
  stage: string,
  stageIndex: number,
  totalStages: number,
  status: PipelineRunProgress['status'],
  agentRole?: string,
  cost?: { totalCostUsd: number; tokensUsed: number },
  taskId?: string,
  description?: string,
): void {
  const projectRoot = getActiveProjectRoot();

  const event: Omit<PipelineRunProgress, 'event_id'> = {
    type: 'PipelineRunProgress',
    runId,
    pipeline,
    stage,
    stageIndex,
    totalStages,
    status,
    taskId,
    agentRole,
    detail: description,
    cost,
    source: 'dashboard',
    timestamp: Date.now(),
  };

  writeBridgeEvent(projectRoot, event);
}

/**
 * Emit a fine-grained LLM call event with token/cost/latency metadata.
 * Reuses PipelineRunProgress type so existing parsers handle it.
 */
export function emitLLMCallEvent(
  runId: string,
  stage: string,
  agentRole: string | undefined,
  taskId: string | undefined,
  model: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  durationMs: number,
  description?: string,
): void {
  const projectRoot = getActiveProjectRoot();

  const event: Omit<PipelineRunProgress, 'event_id'> & {
    llmMeta: { model: string; inputTokens: number; outputTokens: number; durationMs: number };
  } = {
    type: 'PipelineRunProgress',
    runId,
    pipeline: 'design-penpot',
    stage,
    stageIndex: 0,
    totalStages: 1,
    status: 'completed',
    taskId,
    agentRole,
    detail: description ?? `LLM call: ${stage} (${model})`,
    cost: { totalCostUsd: costUsd, tokensUsed: inputTokens + outputTokens },
    source: 'dashboard',
    timestamp: Date.now(),
    llmMeta: { model, inputTokens, outputTokens, durationMs },
  };

  writeBridgeEvent(projectRoot, event as unknown as Omit<PipelineRunProgress, 'event_id'>);
}

/**
 * Emit a detailed agent debug log event.
 * Reuses PipelineRunProgress with status: 'log' so existing parsers handle it.
 */
export function emitAgentLogEvent(
  runId: string,
  stage: string,
  agentRole: string | undefined,
  taskId: string | undefined,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  const projectRoot = getActiveProjectRoot();

  const event: Omit<PipelineRunProgress, 'event_id'> & {
    logMeta: { level: string; context?: Record<string, unknown> };
  } = {
    type: 'PipelineRunProgress',
    runId,
    pipeline: 'design-penpot',
    stage,
    stageIndex: -1,
    totalStages: 0,
    status: 'log',
    taskId,
    agentRole,
    detail: message,
    source: 'dashboard',
    timestamp: Date.now(),
    logMeta: { level, context },
  };

  writeBridgeEvent(projectRoot, event as unknown as Omit<PipelineRunProgress, 'event_id'>);
}
