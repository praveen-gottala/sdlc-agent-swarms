/**
 * @module @agentforge/agents-architect/graph/nodes/critic
 *
 * Node 6 — Critic.
 * Wraps the standalone validateContractBundle() from @agentforge/core,
 * passing state.existingFiles as the 3rd argument for brownfield mode-consistency.
 * 0 LLM calls — all 14 gates are deterministic.
 */

import { debugLog, validateContractBundle } from '@agentforge/core';
import type { ContractBundle, CriticReport } from '@agentforge/core';
import type { ArchitectNodeFn } from '../../deps.js';
import type { ArchitectStateType } from '../state.js';

/** Create the Critic node (Node 6). */
export function createCritic(): ArchitectNodeFn {
  return async (state: ArchitectStateType): Promise<Partial<ArchitectStateType>> => {
    debugLog(`critic: ENTER retries=${state.criticRetries}`);

    const req = state.enrichedRequirement;
    if (!req) {
      debugLog('critic: EXIT (no enrichedRequirement)');
      const failReport: CriticReport = {
        gates: [],
        passed: false,
        summary: 'Missing enrichedRequirement — cannot validate.',
      };
      return {
        criticReport: failReport,
        criticPassed: false,
        criticRetries: state.criticRetries + 1,
      };
    }

    // Assemble the ContractBundle from state channels
    const bundle: ContractBundle = {
      projectId: state.constraintSet?.projectId ?? '',
      version: '1.0.0',
      constraintSet: state.constraintSet!,
      optionsBundle: state.optionsBundle!,
      architectureSpec: state.architectureSpec!,
      adrs: [],
      dataModel: state.dataModelSpec ?? undefined,
      apiChangeSets: [...state.apiChangeSets],
      componentComposition: state.componentCompositions[0] ?? undefined,
      screenPlans: [...state.screenPlans],
      designSystemDiff: state.designSystemDiff ?? undefined,
      taskPlan: state.taskPlan!,
      assumptionLedger: state.assumptionLedger!,
    };

    const report = validateContractBundle(
      bundle,
      req,
      state.existingFiles ?? undefined,
    );

    debugLog(`critic: EXIT passed=${report.passed} gates=${report.gates.length}`);
    return {
      criticReport: report,
      criticPassed: report.passed,
      criticRetries: state.criticRetries + 1,
      lastFailedGate: report.passed ? null : report.gates.find((g) => !g.passed)?.name ?? null,
    };
  };
}
