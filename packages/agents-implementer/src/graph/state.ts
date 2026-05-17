/**
 * @module @agentforge/agents-implementer/graph/state
 *
 * Typed LangGraph state definition for the Implementer pipeline.
 * Uses Annotation from @langchain/langgraph for typed channels (vision Layer 2).
 * 10 channels — mirrors the ArchitectStateAnnotation pattern.
 */

import { Annotation } from '@langchain/langgraph';
import type {
  ContractBundle,
  TaskNode,
  TaskCompletionReport,
  ImplementerContextMetadata,
} from '@agentforge/core';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { ImplementerArtifact } from '../types.js';

/**
 * LangGraph state annotation for the Implementer graph.
 * Each field is a typed channel with an explicit reducer and default.
 */
export const ImplementerStateAnnotation = Annotation.Root({
  // --- Input channels (1-4) ---
  task: Annotation<TaskNode | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  contractBundle: Annotation<Partial<ContractBundle> | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  existingDesignSpecs: Annotation<Readonly<Record<string, DesignSpecV2>> | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  projectRoot: Annotation<string>({
    reducer: (_, b) => b,
    default: () => '',
  }),

  // --- Intermediate channels (5-6) ---
  implementerPrompt: Annotation<string>({
    reducer: (_, b) => b,
    default: () => '',
  }),
  metadata: Annotation<ImplementerContextMetadata | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),

  // --- Design specialist output (7) ---
  designResult: Annotation<DesignSpecV2 | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),

  // --- Code generation output (8-10) ---
  artifacts: Annotation<readonly ImplementerArtifact[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  completionReport: Annotation<TaskCompletionReport | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  errors: Annotation<readonly string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
});

export type ImplementerStateType = typeof ImplementerStateAnnotation.State;
