/**
 * @module @agentforge/agents-architect/test-utils
 *
 * Shared test utilities for Architect node tests.
 * Provides a properly-shaped mock provider (no empty-object casts)
 * and a makeState factory for building ArchitectStateType instances.
 */

import { Ok } from '@agentforge/core';
import type { LLMProvider } from '@agentforge/providers';
import type { ArchitectDeps } from './deps.js';
import type { ArchitectStateType } from './graph/state.js';

/** Minimal LLMProvider stub that satisfies the interface without empty-object casts. */
export const stubProvider: LLMProvider = {
  name: 'stub',
  models: ['stub-model'],
  complete: () => Promise.resolve(Ok({
    content: '',
    toolCalls: [],
    usage: { inputTokens: 0, outputTokens: 0 },
    cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, model: 'stub-model', timestamp: new Date().toISOString() },
    model: 'stub-model',
    latencyMs: 0,
    finishReason: 'stop' as const,
  })),
  stream: async function* () { /* no chunks */ },
  isAvailable: () => Promise.resolve(true),
  estimateCost: () => ({ estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: 0, confidence: 'high' as const }),
};

/** Default mock ArchitectDeps using the stub provider. */
export const mockDeps: ArchitectDeps = {
  provider: stubProvider,
  projectRoot: '/tmp/test',
  projectId: 'test-project',
};

/** Build an ArchitectStateType with sensible defaults, overridable per-field. */
export function makeState(overrides: Partial<ArchitectStateType> = {}): ArchitectStateType {
  return {
    enrichedRequirement: null,
    assumptionLedger: null,
    mode: 'greenfield',
    existingFiles: null,
    existingRepoSnapshot: null,
    retrievalContext: null,
    changeClassification: null,
    constraintSet: null,
    optionsBundle: null,
    architectureSpec: null,
    adrs: [],
    dataModelSpec: null,
    apiChangeSets: [],
    componentCompositions: [],
    screenPlans: [],
    designSystemDiff: null,
    taskPlan: null,
    criticReport: null,
    criticPassed: false,
    criticRetries: 0,
    lastFailedGate: null,
    gate2Decision: null,
    gate2Edits: null,
    threadId: '',
    ...overrides,
  };
}
