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
import type { ClarifierMode } from './types.js';
import type { ClarifierDeps } from './deps.js';
import { ClarifierStateAnnotation } from './graph/state.js';
import { compileClarifierGraph } from './graph/clarifier-graph.js';

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

    await compiled.invoke(
      {
        rawInput: input.rawInput,
        mode: input.mode,
        maxRounds: input.maxRounds ?? 3,
      },
      config,
    );

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
  const event: DomainEventInput = {
    type: 'RequirementsClarified',
    source: 'clarifier',
    timestamp: Date.now(),
    mode: state.mode,
    questionCount: state.questions.length,
    roundCount: state.round,
    assumptionCount: state.assumptions?.entries?.length ?? 0,
    confidence: state.requirement?.confidence ?? 0,
  };

  try {
    writeBridgeEvent(projectRoot, event);
  } catch (err: unknown) {
    debugLog(`clarifier: telemetry event emission failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
