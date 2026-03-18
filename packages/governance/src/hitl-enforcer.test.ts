/**
 * Unit tests for the HITL enforcer module.
 */

import { createHITLEnforcer } from './hitl-enforcer.js';
import type { AgentAction, HITLConfig } from './types.js';

const makeAction = (overrides: Partial<AgentAction> = {}): AgentAction => ({
  agentId: 'design-agent',
  taskId: 'task-design-001',
  type: 'write_design',
  target: 'screens/home.fig',
  description: 'Update home screen design',
  phase: 'design',
  timestamp: '2026-03-17T10:00:00Z',
  ...overrides,
});

const defaultHITLConfig: HITLConfig = {
  defaultLevel: 'full_approval',
  overrides: {},
  routing: {
    approvalRequests: 'all',
    statusUpdates: 'primary',
    criticalAlerts: 'all',
  },
  escalation: {
    timeoutMinutes: 60,
    onTimeout: 'pause_and_notify',
    secondaryTimeoutMinutes: 30,
  },
};

describe('HITLEnforcer', () => {
  describe('enforce', () => {
    it('returns proceed for fully_autonomous', () => {
      const hitl = createHITLEnforcer();
      const action = makeAction();
      const config: HITLConfig = {
        ...defaultHITLConfig,
        defaultLevel: 'fully_autonomous',
      };

      const result = hitl.enforce(action, config);

      expect(result.status).toBe('proceed');
    });

    it('returns notify for notify_only with channel ref', () => {
      const hitl = createHITLEnforcer();
      const action = makeAction();
      const config: HITLConfig = {
        ...defaultHITLConfig,
        defaultLevel: 'notify_only',
      };

      const result = hitl.enforce(action, config);

      expect(result.status).toBe('notify');
      if (result.status === 'notify') {
        expect(result.channels).toHaveLength(1);
        expect(result.channels[0]).toContain('slack:notify-');
        expect(result.channels[0]).toContain('design-agent');
      }
    });

    it('returns pause with gateId for full_approval', () => {
      const hitl = createHITLEnforcer();
      const action = makeAction();

      const result = hitl.enforce(action, defaultHITLConfig);

      expect(result.status).toBe('pause');
      if (result.status === 'pause') {
        expect(result.gateId).toBeDefined();
        expect(result.gateId).toMatch(/^gate-/);
        expect(result.channels).toHaveLength(1);
        expect(result.channels[0]).toContain('slack:approval-');
      }
    });

    it('returns pause for review_and_override', () => {
      const hitl = createHITLEnforcer();
      const action = makeAction();
      const config: HITLConfig = {
        ...defaultHITLConfig,
        defaultLevel: 'review_and_override',
      };

      const result = hitl.enforce(action, config);

      expect(result.status).toBe('pause');
      if (result.status === 'pause') {
        expect(result.gateId).toMatch(/^gate-/);
      }
    });

    it('respects per-phase overrides', () => {
      const hitl = createHITLEnforcer();
      const action = makeAction({ phase: 'design' });
      const config: HITLConfig = {
        ...defaultHITLConfig,
        defaultLevel: 'fully_autonomous',
        overrides: { design: 'full_approval' },
      };

      const result = hitl.enforce(action, config);

      expect(result.status).toBe('pause');
    });

    it('maps code phase to code_generation override', () => {
      const hitl = createHITLEnforcer();
      const action = makeAction({ phase: 'code' });
      const config: HITLConfig = {
        ...defaultHITLConfig,
        defaultLevel: 'fully_autonomous',
        overrides: { code_generation: 'notify_only' },
      };

      const result = hitl.enforce(action, config);

      expect(result.status).toBe('notify');
    });
  });

  describe('getPendingGates', () => {
    it('tracks created gates', () => {
      const hitl = createHITLEnforcer();
      const action = makeAction();

      hitl.enforce(action, defaultHITLConfig);

      const gates = hitl.getPendingGates();
      expect(gates).toHaveLength(1);
      expect(gates[0].action.agentId).toBe('design-agent');
      expect(gates[0].action.type).toBe('write_design');
    });

    it('returns empty array when no gates exist', () => {
      const hitl = createHITLEnforcer();

      expect(hitl.getPendingGates()).toHaveLength(0);
    });

    it('does not track gates for autonomous actions', () => {
      const hitl = createHITLEnforcer();
      const action = makeAction();
      const config: HITLConfig = {
        ...defaultHITLConfig,
        defaultLevel: 'fully_autonomous',
      };

      hitl.enforce(action, config);

      expect(hitl.getPendingGates()).toHaveLength(0);
    });
  });

  describe('resolveGate', () => {
    it('resolves a pending gate', () => {
      const hitl = createHITLEnforcer();
      const action = makeAction();

      const enforceResult = hitl.enforce(action, defaultHITLConfig);
      expect(enforceResult.status).toBe('pause');

      if (enforceResult.status === 'pause') {
        const resolveResult = hitl.resolveGate(
          enforceResult.gateId,
          'approved',
          'human:praveen',
          'Looks good',
        );

        expect(resolveResult.ok).toBe(true);
        expect(hitl.getPendingGates()).toHaveLength(0);
      }
    });

    it('returns error for unknown gateId', () => {
      const hitl = createHITLEnforcer();

      const result = hitl.resolveGate('gate-nonexistent', 'approved', 'human:praveen');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TASK_NOT_FOUND');
        expect(result.error.message).toContain('gate-nonexistent');
      }
    });
  });
});
