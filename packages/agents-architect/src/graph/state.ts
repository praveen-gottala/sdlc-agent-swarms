/**
 * @module @agentforge/agents-architect/graph/state
 *
 * Typed LangGraph state definition for the Architect pipeline.
 * Uses Annotation from @langchain/langgraph for typed channels (vision Layer 2).
 * 23 channels — mirrors the ClarifierStateAnnotation pattern.
 */

import { Annotation } from '@langchain/langgraph';
import type {
  EnrichedRequirement,
  AssumptionLedger,
  ChangeClassification,
  ConstraintSet,
  OptionsBundle,
  ArchitectureSpec,
  DataModelSpec,
  APIChangeSet,
  ComponentComposition,
  ScreenPlan,
  DesignSystemDiff,
  TaskPlan,
  CriticReport,
  ContractBundle,
} from '@agentforge/core';
import type { RepoSnapshot, RetrievalContext } from '../types.js';

/**
 * LangGraph state annotation for the Architect graph.
 * Each field is a typed channel with an explicit reducer and default.
 */
export const ArchitectStateAnnotation = Annotation.Root({
  // --- Input channels (1-6) ---
  enrichedRequirement: Annotation<EnrichedRequirement | null>({ reducer: (_, b) => b, default: () => null }),
  assumptionLedger: Annotation<AssumptionLedger | null>({ reducer: (_, b) => b, default: () => null }),
  mode: Annotation<'greenfield' | 'brownfield'>({ reducer: (_, b) => b, default: () => 'greenfield' }),
  existingFiles: Annotation<ReadonlySet<string> | null>({ reducer: (_, b) => b, default: () => null }),
  existingRepoSnapshot: Annotation<RepoSnapshot | null>({ reducer: (_, b) => b, default: () => null }),
  retrievalContext: Annotation<RetrievalContext | null>({ reducer: (_, b) => b, default: () => null }),

  // --- Node output channels (7-15) ---
  changeClassification: Annotation<ChangeClassification | null>({ reducer: (_, b) => b, default: () => null }),
  constraintSet: Annotation<ConstraintSet | null>({ reducer: (_, b) => b, default: () => null }),
  optionsBundle: Annotation<OptionsBundle | null>({ reducer: (_, b) => b, default: () => null }),
  architectureSpec: Annotation<ArchitectureSpec | null>({ reducer: (_, b) => b, default: () => null }),
  dataModelSpec: Annotation<DataModelSpec | null>({ reducer: (_, b) => b, default: () => null }),
  apiChangeSets: Annotation<readonly APIChangeSet[]>({ reducer: (_, b) => b, default: () => [] }),
  componentCompositions: Annotation<readonly ComponentComposition[]>({ reducer: (_, b) => b, default: () => [] }),
  screenPlans: Annotation<readonly ScreenPlan[]>({ reducer: (_, b) => b, default: () => [] }),
  designSystemDiff: Annotation<DesignSystemDiff | null>({ reducer: (_, b) => b, default: () => null }),

  // --- Task Plan + Critic channels (16-19) ---
  taskPlan: Annotation<TaskPlan | null>({ reducer: (_, b) => b, default: () => null }),
  criticReport: Annotation<CriticReport | null>({ reducer: (_, b) => b, default: () => null }),
  criticPassed: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  criticRetries: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),

  // --- Routing + Gate 2 channels (20-23) ---
  lastFailedGate: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  gate2Decision: Annotation<'approved' | 'rejected' | null>({ reducer: (_, b) => b, default: () => null }),
  gate2Edits: Annotation<Partial<ContractBundle> | null>({ reducer: (_, b) => b, default: () => null }),
  threadId: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
});

export type ArchitectStateType = typeof ArchitectStateAnnotation.State;
