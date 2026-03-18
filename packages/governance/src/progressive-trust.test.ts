/**
 * P10: Progressive Trust State Machine validation tests.
 * Tests all 6 criteria from Wave 1 readiness validation.
 */

import { createProgressiveTrustManager } from './progressive-trust.js';
import type { TrustState, ProgressiveTrustConfig } from './progressive-trust.js';

describe('P10: Progressive Trust State Machine', () => {
  const enabledConfig: ProgressiveTrustConfig = {
    enabled: true,
    threshold: 20,
  };

  const disabledConfig: ProgressiveTrustConfig = {
    enabled: false,
    threshold: 20,
  };

  describe('Criterion 1: Trust state tracks per-agent', () => {
    it('tracks current HITL level, consecutive_approvals, and threshold', () => {
      const manager = createProgressiveTrustManager(enabledConfig);

      const state = manager.getTrustState('agent-1');

      expect(state.agentId).toBe('agent-1');
      expect(state.currentLevel).toBe('full_approval');
      expect(state.consecutiveApprovals).toBe(0);
      expect(state.threshold).toBe(20);
    });

    it('tracks different agents independently', () => {
      const manager = createProgressiveTrustManager(enabledConfig);

      manager.recordApproval('agent-1');
      manager.recordApproval('agent-1');

      const state1 = manager.getTrustState('agent-1');
      const state2 = manager.getTrustState('agent-2');

      expect(state1.consecutiveApprovals).toBe(2);
      expect(state2.consecutiveApprovals).toBe(0);
    });
  });

  describe('Criterion 2: Auto-escalation at threshold', () => {
    it('escalates from full_approval to review_and_override at 20 approvals', () => {
      const manager = createProgressiveTrustManager(enabledConfig);

      // 19 approvals — no escalation
      for (let i = 0; i < 19; i++) {
        const escalated = manager.recordApproval('agent-1');
        expect(escalated).toBe(false);
      }

      const stateAt19 = manager.getTrustState('agent-1');
      expect(stateAt19.currentLevel).toBe('full_approval');
      expect(stateAt19.consecutiveApprovals).toBe(19);

      // 20th approval — escalation triggers
      const escalated = manager.recordApproval('agent-1');
      expect(escalated).toBe(true);

      const stateAt20 = manager.getTrustState('agent-1');
      expect(stateAt20.currentLevel).toBe('review_and_override');
      expect(stateAt20.consecutiveApprovals).toBe(0); // Reset after escalation
    });
  });

  describe('Criterion 3: Rejection resets counter', () => {
    it('resets consecutiveApprovals to 0 on rejection', () => {
      const manager = createProgressiveTrustManager(enabledConfig);

      // Build up 15 approvals
      for (let i = 0; i < 15; i++) {
        manager.recordApproval('agent-1');
      }

      const before = manager.getTrustState('agent-1');
      expect(before.consecutiveApprovals).toBe(15);

      // Single rejection
      manager.recordRejection('agent-1');

      const after = manager.getTrustState('agent-1');
      expect(after.consecutiveApprovals).toBe(0);
      expect(after.currentLevel).toBe('full_approval'); // Level unchanged
    });
  });

  describe('Criterion 4: Opt-in flag disables auto-escalation', () => {
    it('no auto-escalation when enabled is false', () => {
      const manager = createProgressiveTrustManager(disabledConfig);

      for (let i = 0; i < 25; i++) {
        const escalated = manager.recordApproval('agent-1');
        expect(escalated).toBe(false);
      }

      const state = manager.getTrustState('agent-1');
      expect(state.currentLevel).toBe('full_approval');
    });

    it('getEffectiveLevel returns base level when disabled', () => {
      const manager = createProgressiveTrustManager(disabledConfig);

      const level = manager.getEffectiveLevel('agent-1', 'full_approval');
      expect(level).toBe('full_approval');
    });
  });

  describe('Criterion 5: Trust state persists across restarts', () => {
    it('persists and loads state via persistence interface', () => {
      const store = new Map<string, TrustState>();
      const persistence = {
        load: (agentId: string) => store.get(agentId),
        save: (state: TrustState) => store.set(state.agentId, state),
      };

      // First instance — build up trust
      const manager1 = createProgressiveTrustManager(enabledConfig, undefined, persistence);
      for (let i = 0; i < 10; i++) {
        manager1.recordApproval('agent-1');
      }

      // Verify persisted
      expect(store.has('agent-1')).toBe(true);
      expect(store.get('agent-1')!.consecutiveApprovals).toBe(10);

      // Second instance — loads from persistence (simulating restart)
      const manager2 = createProgressiveTrustManager(enabledConfig, undefined, persistence);
      const state = manager2.getTrustState('agent-1');
      expect(state.consecutiveApprovals).toBe(10);
      expect(state.currentLevel).toBe('full_approval');
    });
  });

  describe('Criterion 6: TrustEscalated event emitted', () => {
    it('emits TrustEscalated event on level change', () => {
      const events: unknown[] = [];
      const eventBus = { publish: (event: unknown) => events.push(event) };
      const manager = createProgressiveTrustManager(enabledConfig, eventBus);

      // Reach threshold
      for (let i = 0; i < 20; i++) {
        manager.recordApproval('agent-1');
      }

      const trustEvents = events.filter(
        (e) => (e as Record<string, unknown>).type === 'TrustEscalated',
      );
      expect(trustEvents.length).toBe(1);

      const event = trustEvents[0] as Record<string, unknown>;
      expect(event.agentRole).toBe('agent-1');
      expect(event.previousLevel).toBe('full_approval');
      expect(event.newLevel).toBe('review_and_override');
      expect(event.consecutiveApprovals).toBe(20);
    });

    it('does not emit event when no escalation occurs', () => {
      const events: unknown[] = [];
      const eventBus = { publish: (event: unknown) => events.push(event) };
      const manager = createProgressiveTrustManager(enabledConfig, eventBus);

      manager.recordApproval('agent-1');

      const trustEvents = events.filter(
        (e) => (e as Record<string, unknown>).type === 'TrustEscalated',
      );
      expect(trustEvents.length).toBe(0);
    });
  });

  describe('Full simulation: 19 approvals, 20th escalation, rejection reset', () => {
    it('complete flow matches PRD 13.2', () => {
      const events: unknown[] = [];
      const eventBus = { publish: (event: unknown) => events.push(event) };
      const manager = createProgressiveTrustManager(enabledConfig, eventBus);

      // 19 approvals — no escalation
      for (let i = 0; i < 19; i++) {
        const result = manager.recordApproval('agent-1');
        expect(result).toBe(false);
      }

      let state = manager.getTrustState('agent-1');
      expect(state.currentLevel).toBe('full_approval');
      expect(state.consecutiveApprovals).toBe(19);
      expect(events.length).toBe(0);

      // 20th approval — escalation
      const escalated = manager.recordApproval('agent-1');
      expect(escalated).toBe(true);

      state = manager.getTrustState('agent-1');
      expect(state.currentLevel).toBe('review_and_override');
      expect(state.consecutiveApprovals).toBe(0);
      expect(events.length).toBe(1);

      // Rejection — counter resets
      manager.recordRejection('agent-1');
      state = manager.getTrustState('agent-1');
      expect(state.consecutiveApprovals).toBe(0);
      expect(state.currentLevel).toBe('review_and_override'); // Level stays
    });
  });
});
