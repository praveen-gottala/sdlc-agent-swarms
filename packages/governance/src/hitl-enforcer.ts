/**
 * @module @agentforge/governance/hitl-enforcer
 *
 * Enforces Human-In-The-Loop policies on agent actions.
 * Maps SDLC phases to HITL phases, looks up the configured level,
 * and returns proceed/notify/pause/denied status accordingly.
 */

import { Ok, Err } from '@agentforge/core';
import type { Result, AgentForgeError, HITLDecision } from '@agentforge/core';
import type { AgentAction, HITLConfig, HITLResult, HITLGate, HITLPhase } from './types.js';

/**
 * Minimal event publisher interface.
 * Avoids hard dependency on core's EventBus module.
 */
interface EventPublisher {
  publish(event: unknown): void;
}

/**
 * Interface for HITL policy enforcement.
 */
export interface HITLEnforcer {
  /** Enforce HITL policy for an action. */
  enforce(action: AgentAction, config: HITLConfig): HITLResult;
  /** Get all pending approval gates. */
  getPendingGates(): readonly HITLGate[];
  /** Resolve a pending gate with a decision. */
  resolveGate(gateId: string, decision: HITLDecision, decidedBy: string, feedback?: string): Result<void>;
}

/**
 * Mapping from SDLC action phases to HITL override phases.
 */
const PHASE_MAPPING: Readonly<Record<string, HITLPhase>> = {
  clarify: 'clarification',
  design: 'design',
  spec: 'spec_review',
  code: 'code_generation',
  cicd: 'staging_deploy',
  observe: 'observability',
};

/**
 * Create an HITL enforcer that gates agent actions based on configured approval levels.
 *
 * @param eventBus - Optional event publisher for emitting HITL events
 * @returns An HITLEnforcer instance
 */
export const createHITLEnforcer = (eventBus?: EventPublisher): HITLEnforcer => {
  const pendingGates: HITLGate[] = [];

  return {
    enforce(action: AgentAction, config: HITLConfig): HITLResult {
      const hitlPhase = PHASE_MAPPING[action.phase];
      const level = (hitlPhase && config.overrides[hitlPhase]) ?? config.defaultLevel;

      switch (level) {
        case 'fully_autonomous':
          return { status: 'proceed' };

        case 'notify_only':
          return {
            status: 'notify',
            channels: [`slack:notify-${action.agentId}`],
          };

        case 'review_and_override':
        case 'full_approval': {
          const gateId = `gate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const channels = [`slack:approval-${action.agentId}`];
          const now = new Date();
          const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

          const gate: HITLGate = {
            gateId,
            action,
            level,
            createdAt: now.toISOString(),
            expiresAt,
            escalated: false,
            channels,
          };

          pendingGates.push(gate);

          if (eventBus) {
            eventBus.publish({
              type: 'HITLApprovalRequested',
              payload: { gateId, action, level, channels },
            });
          }

          return {
            status: 'pause',
            gateId,
            channels,
          };
        }

        default:
          return { status: 'proceed' };
      }
    },

    getPendingGates(): readonly HITLGate[] {
      return [...pendingGates];
    },

    resolveGate(
      gateId: string,
      decision: HITLDecision,
      decidedBy: string,
      feedback?: string,
    ): Result<void> {
      const index = pendingGates.findIndex((g) => g.gateId === gateId);
      if (index === -1) {
        return Err({
          code: 'TASK_NOT_FOUND' as const,
          message: `Gate not found: ${gateId}`,
          context: { gateId },
          recoverable: false,
        } as AgentForgeError);
      }

      // Update the gate with decision info (replace in array since HITLGate is readonly)
      const gate = pendingGates[index];
      const resolvedGate: HITLGate = {
        ...gate,
        decision,
        decidedBy,
        decidedAt: new Date().toISOString(),
        feedback,
      };

      // Remove from pending
      pendingGates.splice(index, 1);

      if (eventBus) {
        eventBus.publish({
          type: 'HITLApprovalReceived',
          payload: { gateId, decision, decidedBy, feedback, gate: resolvedGate },
        });
      }

      return Ok(undefined);
    },
  };
};
