/**
 * @module @agentforge/governance/progressive-trust
 *
 * Progressive trust state machine per PRD v2.0 Section 13.2.
 * Tracks consecutive approvals per agent and auto-escalates HITL levels
 * when configured thresholds are met. Opt-in via config flag.
 */

import type { HITLLevel } from '@agentforge/core';

/**
 * Configuration for progressive trust.
 */
export interface ProgressiveTrustConfig {
  readonly enabled: boolean;
  readonly threshold: number;
}

/**
 * Trust state tracked per agent.
 */
export interface TrustState {
  readonly agentId: string;
  readonly currentLevel: HITLLevel;
  readonly consecutiveApprovals: number;
  readonly threshold: number;
}

/**
 * Event publisher interface for trust events.
 */
interface TrustEventPublisher {
  publish(event: unknown): void;
}

/**
 * Persistence interface for trust state.
 */
interface TrustPersistence {
  load(agentId: string): TrustState | undefined;
  save(state: TrustState): void;
}

/**
 * HITL level escalation order (from most restrictive to least).
 */
const LEVEL_ORDER: readonly HITLLevel[] = [
  'full_approval',
  'review_and_override',
  'notify_only',
  'fully_autonomous',
];

/**
 * Get the next escalation level for a given HITL level.
 */
const getNextLevel = (current: HITLLevel): HITLLevel | null => {
  const idx = LEVEL_ORDER.indexOf(current);
  if (idx < 0 || idx >= LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[idx + 1];
};

/**
 * Interface for the progressive trust manager.
 */
export interface ProgressiveTrustManager {
  /** Get the current trust state for an agent. */
  getTrustState(agentId: string): TrustState;
  /** Record an approval for an agent. Returns true if escalation occurred. */
  recordApproval(agentId: string): boolean;
  /** Record a rejection for an agent. Resets consecutive approvals to 0. */
  recordRejection(agentId: string): void;
  /** Get the effective HITL level for an agent. */
  getEffectiveLevel(agentId: string, baseLevel: HITLLevel): HITLLevel;
}

/**
 * Create a progressive trust manager.
 *
 * @param config - Progressive trust configuration
 * @param eventBus - Optional event publisher for TrustEscalated events
 * @param persistence - Optional persistence layer for surviving restarts
 */
export const createProgressiveTrustManager = (
  config: ProgressiveTrustConfig,
  eventBus?: TrustEventPublisher,
  persistence?: TrustPersistence,
): ProgressiveTrustManager => {
  const states = new Map<string, TrustState>();

  const getOrCreate = (agentId: string): TrustState => {
    let state = states.get(agentId);
    if (state) return state;

    // Try loading from persistence
    if (persistence) {
      const persisted = persistence.load(agentId);
      if (persisted) {
        states.set(agentId, persisted);
        return persisted;
      }
    }

    state = {
      agentId,
      currentLevel: 'full_approval',
      consecutiveApprovals: 0,
      threshold: config.threshold,
    };
    states.set(agentId, state);
    return state;
  };

  const updateState = (state: TrustState): void => {
    states.set(state.agentId, state);
    if (persistence) {
      persistence.save(state);
    }
  };

  return {
    getTrustState(agentId: string): TrustState {
      return getOrCreate(agentId);
    },

    recordApproval(agentId: string): boolean {
      if (!config.enabled) return false;

      const state = getOrCreate(agentId);
      const newCount = state.consecutiveApprovals + 1;

      if (newCount >= config.threshold) {
        const nextLevel = getNextLevel(state.currentLevel);
        if (nextLevel) {
          const newState: TrustState = {
            ...state,
            currentLevel: nextLevel,
            consecutiveApprovals: 0,
            threshold: config.threshold,
          };
          updateState(newState);

          if (eventBus) {
            eventBus.publish({
              type: 'TrustEscalated',
              source: 'governance:progressive-trust',
              timestamp: Date.now(),
              agentRole: agentId,
              previousLevel: state.currentLevel,
              newLevel: nextLevel,
              consecutiveApprovals: newCount,
            });
          }

          return true;
        }
      }

      const newState: TrustState = {
        ...state,
        consecutiveApprovals: newCount,
      };
      updateState(newState);
      return false;
    },

    recordRejection(agentId: string): void {
      const state = getOrCreate(agentId);
      const newState: TrustState = {
        ...state,
        consecutiveApprovals: 0,
      };
      updateState(newState);
    },

    getEffectiveLevel(agentId: string, baseLevel: HITLLevel): HITLLevel {
      if (!config.enabled) return baseLevel;

      const state = getOrCreate(agentId);
      // Return the less restrictive of baseLevel and current trust level
      const baseIdx = LEVEL_ORDER.indexOf(baseLevel);
      const trustIdx = LEVEL_ORDER.indexOf(state.currentLevel);
      return LEVEL_ORDER[Math.max(baseIdx, trustIdx)];
    },
  };
};
