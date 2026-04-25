/**
 * @module @agentforge/cli/telemetry/cli-sink
 *
 * CLI stdout sink for PipelineTelemetrySink. Renders pipeline progress
 * to the terminal using the existing ANSI formatter functions.
 *
 * The evaluator stage is filtered from stdout display (ADR-045: Phase 1
 * returns undefined). Internal callLog still records it for contract tests.
 */

import type { PipelineTelemetrySink } from '@agentforge/agents-ux';
import { successMsg, errorMsg, infoMsg, warnMsg } from '../formatter.js';

const STAGE_INDEX: Record<string, number> = {
  research: 1,
  planning: 2,
  design: 3,
};

const VISIBLE_STAGE_COUNT = 3;

const HIDDEN_STAGES = new Set(['evaluator']);

export interface SinkCallEntry {
  readonly method: string;
  readonly stage: string;
  readonly args: unknown[];
}

/** CLI stdout implementation of PipelineTelemetrySink. */
export class CliStdoutSink implements PipelineTelemetrySink {
  private readonly log: SinkCallEntry[] = [];
  private accumulatedCostUsd = 0;
  private accumulatedTokens = 0;

  constructor(private readonly output: NodeJS.WritableStream) {}

  onStageStart(stage: string, attrs: { agentRole: string; moduleId: string; taskId: string }): void {
    this.log.push({ method: 'onStageStart', stage, args: [attrs] });

    if (HIDDEN_STAGES.has(stage)) return;

    const idx = STAGE_INDEX[stage] ?? 0;
    const label = stage.charAt(0).toUpperCase() + stage.slice(1);
    this.output.write(infoMsg(`\n  [${idx}/${VISIBLE_STAGE_COUNT}] ${label} — running...\n`));
  }

  onStageComplete(stage: string, result: { costUsd?: number; tokensUsed?: number }): void {
    this.log.push({ method: 'onStageComplete', stage, args: [result] });

    if (result.costUsd) this.accumulatedCostUsd += result.costUsd;
    if (result.tokensUsed) this.accumulatedTokens += result.tokensUsed;

    if (HIDDEN_STAGES.has(stage)) return;

    const label = stage.charAt(0).toUpperCase() + stage.slice(1);
    const costStr = result.costUsd ? ` ($${result.costUsd.toFixed(4)})` : '';
    this.output.write(successMsg(`  ${label} complete${costStr}\n`));
  }

  onStageFail(stage: string, error: string): void {
    this.log.push({ method: 'onStageFail', stage, args: [error] });

    const label = stage.charAt(0).toUpperCase() + stage.slice(1);
    this.output.write(errorMsg(`  ${label} failed: ${error}\n`));
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
  }

  onLog(stage: string, level: 'info' | 'warn' | 'error', message: string): void {
    this.log.push({ method: 'onLog', stage, args: [message] });

    if (level === 'error') {
      this.output.write(errorMsg(`  ${message}\n`));
    } else if (level === 'warn') {
      this.output.write(warnMsg(`  ${message}\n`));
    } else {
      this.output.write(infoMsg(`  ${message}\n`));
    }
  }

  /** Returns the ordered list of method calls for sink contract tests. */
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
