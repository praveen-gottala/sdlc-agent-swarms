/**
 * @module @agentforge/agents-clarifier/run
 *
 * Convenience wrapper that creates, compiles, and invokes the Clarifier graph.
 * Entry point for dashboard API routes (Task 1.8).
 */

import { Ok, Err, createCheckpointer, writeBridgeEvent, debugLog } from '@agentforge/core';
import type { Result, BaseCheckpointSaver, DomainEventInput } from '@agentforge/core';
import type { LLMProvider } from '@agentforge/providers';
import type { RetrievalTools } from '@agentforge/retrieval';
import type { ClarifierMode, HumanResponse, EscalationDecision, QALogEntry } from './types.js';
import type { ClarifierDeps } from './deps.js';
import { ClarifierStateAnnotation } from './graph/state.js';
import { compileClarifierGraph } from './graph/clarifier-graph.js';
import { appendStageRecord, appendQALog, readLastSequence } from './pipeline-trace.js';

/** Inferred state type from the LangGraph annotation — no manual cast needed. */
type GraphState = typeof ClarifierStateAnnotation.State;

export interface ClarifierInput {
  readonly rawInput: string;
  readonly mode: ClarifierMode;
  readonly provider: LLMProvider;
  readonly projectRoot: string;
  readonly projectId: string;
  readonly retrievalTools?: RetrievalTools;
  readonly maxRounds?: number;
  readonly threadId?: string;
  readonly checkpointer?: BaseCheckpointSaver;
  /** Pre-loaded base catalog YAML string — avoids import.meta.url path issues under webpack. */
  readonly baseCatalog?: string;
  /** Human responses for HITL resume — concatenated into the humanResponses channel. */
  readonly humanResponses?: readonly HumanResponse[];
  /** Escalation decision for HITL resume at escalationGate. */
  readonly escalationDecision?: EscalationDecision;
}

export interface ClarifierOutput {
  readonly state: GraphState;
  readonly threadId: string;
  readonly interrupted: boolean;
}

export interface ClarifierError {
  readonly code: 'GRAPH_ERROR' | 'CHECKPOINTER_ERROR';
  readonly message: string;
}

/**
 * Run the Clarifier pipeline end-to-end.
 * Creates the graph, compiles with checkpointer, and invokes.
 */
/** Event emitted by the streaming variant of the Clarifier pipeline. */
export type ClarifierStreamEvent =
  | { readonly type: 'node-complete'; readonly node: string; readonly state: Partial<GraphState> }
  | { readonly type: 'interrupt'; readonly state: GraphState; readonly threadId: string }
  | { readonly type: 'complete'; readonly state: GraphState; readonly threadId: string }
  | { readonly type: 'error'; readonly error: { code: string; message: string } };

/**
 * Stream the Clarifier pipeline using LangGraph's native graph.stream().
 * Yields per-node completion events. Used by the dashboard API route.
 */
export async function* runClarifierPipelineStream(
  input: ClarifierInput,
): AsyncGenerator<ClarifierStreamEvent> {
  const deps: ClarifierDeps = {
    provider: input.provider,
    retrievalTools: input.retrievalTools,
    projectRoot: input.projectRoot,
    projectId: input.projectId,
    baseCatalog: input.baseCatalog,
  };

  let checkpointer: BaseCheckpointSaver;
  try {
    checkpointer = input.checkpointer ?? await createCheckpointer();
  } catch {
    yield { type: 'error', error: { code: 'CHECKPOINTER_ERROR', message: 'Failed to create checkpointer' } };
    return;
  }

  const threadId = input.threadId ?? crypto.randomUUID();
  const compiled = compileClarifierGraph(deps, checkpointer);
  const config = { configurable: { thread_id: threadId } };

  const invokeInput: Record<string, unknown> = {
    rawInput: input.rawInput,
    mode: input.mode,
    maxRounds: input.maxRounds ?? 3,
    threadId,
  };

  const isResume = !!(input.humanResponses?.length || input.escalationDecision);
  let accumulated: Record<string, unknown>;
  let sequence: number;

  if (isResume) {
    if (input.humanResponses?.length) {
      invokeInput.humanResponses = input.humanResponses;
    }
    if (input.escalationDecision) {
      invokeInput.escalationDecision = input.escalationDecision;
    }

    // Restore accumulated state from checkpoint for trace continuity
    try {
      const checkpoint = await compiled.getState(config);
      accumulated = { ...checkpoint.values } as Record<string, unknown>;
    } catch {
      accumulated = { ...invokeInput };
    }
    sequence = readLastSequence(input.projectRoot, threadId) + 1;

    // Record synthetic HITL stage
    const questionsFromState = (accumulated.questions ?? []) as readonly { id: string; gapId: string; topic?: string; text: string; type: string; options?: readonly { label: string }[]; evpiScore: number }[];
    try {
      appendStageRecord(input.projectRoot, threadId, {
        stageName: 'hitl',
        turnNumber: (accumulated.round as number) ?? 0,
        sequenceNumber: sequence,
        input: { questions: accumulated.questions },
        output: { humanResponses: input.humanResponses, escalationDecision: input.escalationDecision },
      });
      sequence++;

      // Populate Q&A log
      if (input.humanResponses?.length) {
        const qaEntries: QALogEntry[] = input.humanResponses.map((r) => {
          const q = questionsFromState.find((qq) => qq.id === r.questionId);
          return {
            timestamp: new Date().toISOString(),
            threadId,
            round: (accumulated.round as number) ?? 0,
            questionId: r.questionId,
            gapId: q?.gapId ?? '',
            topic: q?.topic,
            questionText: q?.text ?? '',
            questionType: (q?.type ?? 'open') as 'open' | 'multiple-choice',
            answer: r.answer,
            selectedOption: r.selectedOption,
            optionCount: q?.options?.length,
            evpiScore: q?.evpiScore ?? 0,
          };
        });
        appendQALog(input.projectRoot, threadId, qaEntries);
      }
    } catch (err: unknown) {
      debugLog(`clarifier: trace recording failed for hitl: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Merge human responses into accumulated for downstream tracing
    if (input.humanResponses?.length) {
      const existing = (accumulated.humanResponses ?? []) as readonly HumanResponse[];
      accumulated.humanResponses = [...existing, ...input.humanResponses];
    }
  } else {
    accumulated = { ...invokeInput };
    sequence = 0;
  }

  try {
    const stream = await compiled.stream(invokeInput, {
      ...config,
      streamMode: 'updates' as const,
    });

    for await (const update of stream) {
      const nodeNames = Object.keys(update as Record<string, unknown>);
      for (const node of nodeNames) {
        const nodeState = (update as Record<string, unknown>)[node] as Partial<GraphState>;

        // Record stage I/O to execution trace
        try {
          appendStageRecord(input.projectRoot, threadId, {
            stageName: node,
            turnNumber: (accumulated.round as number) ?? 0,
            sequenceNumber: sequence,
            input: accumulated,
            output: nodeState,
          });
          sequence++;
        } catch (err: unknown) {
          debugLog(`clarifier: trace recording failed for ${node}: ${err instanceof Error ? err.message : String(err)}`);
        }

        // Merge node output delta into accumulated state
        Object.assign(accumulated, nodeState);

        yield { type: 'node-complete', node, state: nodeState };
      }
    }

    const graphState = await compiled.getState(config);
    const interrupted = (graphState.next?.length ?? 0) > 0;

    if (interrupted) {
      yield { type: 'interrupt', state: graphState.values, threadId };
    } else {
      emitRequirementsClarified(input.projectRoot, graphState.values);
      yield { type: 'complete', state: graphState.values, threadId };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('GraphInterrupt') || message.includes('interrupt')) {
      try {
        const graphState = await compiled.getState({ configurable: { thread_id: threadId } });
        yield { type: 'interrupt', state: graphState.values, threadId };
      } catch {
        yield { type: 'error', error: { code: 'GRAPH_ERROR', message } };
      }
      return;
    }

    yield { type: 'error', error: { code: 'GRAPH_ERROR', message } };
  }
}

/**
 * Run the Clarifier pipeline end-to-end (blocking).
 * Creates the graph, compiles with checkpointer, and invokes.
 * Kept for CLI usage where streaming is not needed.
 */
export async function runClarifierPipeline(
  input: ClarifierInput,
): Promise<Result<ClarifierOutput, ClarifierError>> {
  const deps: ClarifierDeps = {
    provider: input.provider,
    retrievalTools: input.retrievalTools,
    projectRoot: input.projectRoot,
    projectId: input.projectId,
    baseCatalog: input.baseCatalog,
  };

  const checkpointer = input.checkpointer ?? await createCheckpointer();
  const threadId = input.threadId ?? crypto.randomUUID();
  const compiled = compileClarifierGraph(deps, checkpointer);

  try {
    const config = { configurable: { thread_id: threadId } };

    const invokeInput: Record<string, unknown> = {
      rawInput: input.rawInput,
      mode: input.mode,
      maxRounds: input.maxRounds ?? 3,
      threadId,
    };
    if (input.humanResponses?.length) {
      invokeInput.humanResponses = input.humanResponses;
    }
    if (input.escalationDecision) {
      invokeInput.escalationDecision = input.escalationDecision;
    }

    await compiled.invoke(invokeInput, config);

    // LangGraph interruptBefore returns normally (no throw).
    // Check getState().next to detect if the graph is interrupted.
    const graphState = await compiled.getState(config);
    const interrupted = (graphState.next?.length ?? 0) > 0;

    if (!interrupted) {
      emitRequirementsClarified(input.projectRoot, graphState.values);
    }

    return Ok({
      state: graphState.values,
      threadId,
      interrupted,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    // Some LangGraph versions throw GraphInterrupt — handle as interrupt
    if (message.includes('GraphInterrupt') || message.includes('interrupt')) {
      const graphState = await compiled.getState({ configurable: { thread_id: threadId } });
      return Ok({
        state: graphState.values,
        threadId,
        interrupted: true,
      });
    }

    return Err({
      code: 'GRAPH_ERROR',
      message,
    });
  }
}

/** Emit RequirementsClarified telemetry event after successful completion. */
function emitRequirementsClarified(projectRoot: string, state: GraphState): void {
  const questions = state.questions;
  const responses = state.humanResponses;

  const mcQuestions = questions.filter((q) => q.type === 'multiple-choice' && q.options?.length);
  const answeredMC = responses.filter((r) => {
    const q = questions.find((qq) => qq.id === r.questionId);
    return q?.type === 'multiple-choice' && q.options?.length;
  });

  const recommendedAccepted = answeredMC.filter((r) => {
    const q = questions.find((qq) => qq.id === r.questionId);
    const rec = q?.options?.find((o) => o.recommended);
    return rec && r.selectedOption === rec.label;
  });

  const otherUsed = answeredMC.filter((r) => !r.selectedOption);

  const optionSourceDist: Record<string, number> = { llm: 0, codebase: 0, template: 0, catalog: 0 };
  for (const r of answeredMC) {
    if (!r.selectedOption) continue;
    const q = questions.find((qq) => qq.id === r.questionId);
    const matched = q?.options?.find((o) => o.label === r.selectedOption);
    if (matched) {
      optionSourceDist[matched.source] = (optionSourceDist[matched.source] ?? 0) + 1;
    }
  }

  const event: DomainEventInput = {
    type: 'RequirementsClarified',
    source: 'clarifier',
    timestamp: Date.now(),
    mode: state.mode,
    questionCount: questions.length,
    roundCount: state.round,
    assumptionCount: state.assumptions?.entries?.length ?? 0,
    confidence: state.requirement?.confidence ?? 0,
    mcQuestionCount: mcQuestions.length,
    recommendedAcceptanceRate: answeredMC.length > 0
      ? recommendedAccepted.length / answeredMC.length
      : 0,
    otherUsageRate: answeredMC.length > 0
      ? otherUsed.length / answeredMC.length
      : 0,
    optionSelectionRate: answeredMC.length > 0
      ? (answeredMC.length - otherUsed.length) / answeredMC.length
      : 0,
    optionSourceDistribution: optionSourceDist,
    autoResolvedAssumptionCount: state.assumptions?.entries?.filter(
      (e) => e.evidence.includes('divergence'),
    ).length ?? 0,
  };

  try {
    writeBridgeEvent(projectRoot, event);
  } catch (err: unknown) {
    debugLog(`clarifier: telemetry event emission failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
