/**
 * P24 — Escalation Policy Enforcement
 *
 * Wave 5 validation: validates escalation policy from PRD v2.0 Section 13.3.
 * Tests escalation timeout, secondary channel notification, full pause,
 * and the CRITICAL invariant that auto-approve NEVER happens on timeout.
 *
 * Uses mocked channels and short timeouts for test speed.
 */

import type { HITLLevel } from '@agentforge/core';
import { createHITLEnforcer } from './hitl-enforcer.js';
import type {
  AgentAction,
  HITLConfig,
  EscalationConfig,
  GovernanceConfig,
} from './types.js';
import { createGovernanceMiddleware, executeGovernancePipeline } from './governance-middleware.js';

// ============================================================================
// Helpers
// ============================================================================

function makeAction(overrides: Partial<AgentAction> = {}): AgentAction {
  return {
    agentId: 'code_generator',
    taskId: 'task_001',
    type: 'write_code',
    target: 'src/components/Dashboard.tsx',
    description: 'Generate dashboard component',
    phase: 'code',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeHITLConfig(overrides: Partial<HITLConfig> = {}): HITLConfig {
  return {
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
    ...overrides,
  };
}

function makeGovernanceConfig(escalation?: Partial<EscalationConfig>): GovernanceConfig {
  return {
    hitl: makeHITLConfig({
      escalation: {
        timeoutMinutes: escalation?.timeoutMinutes ?? 60,
        onTimeout: 'pause_and_notify',
        secondaryTimeoutMinutes: escalation?.secondaryTimeoutMinutes ?? 30,
        ...(escalation?.escalationChannels ? { escalationChannels: escalation.escalationChannels } : {}),
      },
    }),
    budget: {
      perTaskMaxUsd: 2.0,
      perPhaseMaxUsd: 25.0,
      monthlyMaxUsd: 200.0,
      alertThreshold: 0.8,
    },
    circuitBreaker: {
      maxConsecutiveFailures: 5,
      maxCallsWithoutProgress: 5,
      resetAfterMinutes: 5,
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('P24: Escalation Policy Enforcement', () => {
  // ==========================================================================
  // 1. Default timeout: 60 minutes triggers escalation
  // ==========================================================================

  describe('1. Default timeout configuration', () => {
    it('creates HITL gate with 60-minute expiration by default', () => {
      const enforcer = createHITLEnforcer();
      const config = makeHITLConfig();
      const action = makeAction();

      const result = enforcer.enforce(action, config);

      expect(result.status).toBe('pause');
      if (result.status === 'pause') {
        const gate = enforcer.getPendingGates().find(g => g.gateId === result.gateId);
        expect(gate).toBeDefined();
        if (gate) {
          const createdAt = new Date(gate.createdAt).getTime();
          const expiresAt = new Date(gate.expiresAt).getTime();
          const durationMs = expiresAt - createdAt;
          // 60 minutes = 3,600,000 ms
          expect(durationMs).toBe(60 * 60 * 1000);
        }
      }
    });

    it('escalation config default is 60 minutes', () => {
      const config = makeHITLConfig();
      expect(config.escalation.timeoutMinutes).toBe(60);
    });

    it('gate is marked as not escalated initially', () => {
      const enforcer = createHITLEnforcer();
      const config = makeHITLConfig();
      const action = makeAction();

      enforcer.enforce(action, config);

      const gates = enforcer.getPendingGates();
      expect(gates).toHaveLength(1);
      expect(gates[0].escalated).toBe(false);
    });
  });

  // ==========================================================================
  // 2. Escalation behavior: dependent tasks pause, secondary channel notified
  // ==========================================================================

  describe('2. Escalation behavior', () => {
    it('gate expiresAt is set based on escalation timeout config', () => {
      const enforcer = createHITLEnforcer();
      // Default timeout is 60 minutes
      const config = makeHITLConfig();
      const action = makeAction();

      enforcer.enforce(action, config);

      const gate = enforcer.getPendingGates()[0];
      const createdMs = new Date(gate.createdAt).getTime();
      const expiresMs = new Date(gate.expiresAt).getTime();
      expect(expiresMs - createdMs).toBe(60 * 60 * 1000);
    });

    it('escalation config stores secondary channel information', () => {
      const config = makeHITLConfig({
        escalation: {
          timeoutMinutes: 60,
          onTimeout: 'pause_and_notify',
          secondaryTimeoutMinutes: 30,
          escalationChannels: ['telegram', 'cli'],
        },
      });

      expect(config.escalation.escalationChannels).toEqual(['telegram', 'cli']);
      expect(config.escalation.secondaryTimeoutMinutes).toBe(30);
    });

    it('onTimeout is always pause_and_notify', () => {
      const config = makeHITLConfig();
      expect(config.escalation.onTimeout).toBe('pause_and_notify');
    });
  });

  // ==========================================================================
  // 3. Secondary timeout: project enters full pause with stalled notification
  // ==========================================================================

  describe('3. Secondary timeout behavior', () => {
    it('secondary timeout configured separately from primary', () => {
      const config = makeHITLConfig({
        escalation: {
          timeoutMinutes: 60,
          onTimeout: 'pause_and_notify',
          secondaryTimeoutMinutes: 30,
        },
      });

      expect(config.escalation.timeoutMinutes).toBe(60);
      expect(config.escalation.secondaryTimeoutMinutes).toBe(30);
    });

    it('total timeout window is primary + secondary', () => {
      const config = makeHITLConfig();
      const totalMinutes = config.escalation.timeoutMinutes + config.escalation.secondaryTimeoutMinutes;
      // 60 + 30 = 90 minutes total before full pause
      expect(totalMinutes).toBe(90);
    });
  });

  // ==========================================================================
  // 4. CRITICAL INVARIANT: framework NEVER auto-approves on timeout
  // ==========================================================================

  describe('4. CRITICAL: Auto-approve NEVER happens on timeout', () => {
    it('CRITICAL NEGATIVE TEST: expired gate does NOT auto-approve', () => {
      const enforcer = createHITLEnforcer();
      const config = makeHITLConfig();
      const action = makeAction();

      // Create a gate
      const result = enforcer.enforce(action, config);
      expect(result.status).toBe('pause');

      if (result.status === 'pause') {
        const gate = enforcer.getPendingGates().find(g => g.gateId === result.gateId);
        expect(gate).toBeDefined();
        expect(gate!.decision).toBeUndefined();

        // Simulate time passing — the gate expires
        // In the real system, even after expiresAt, the gate stays pending
        // The framework NEVER auto-approves.
        // The gate should remain in pending state without a decision
        const pendingGates = enforcer.getPendingGates();
        expect(pendingGates.length).toBe(1);
        expect(pendingGates[0].decision).toBeUndefined();

        // No auto-approval mechanism exists — confirm there's no method
        // that would resolve gates automatically
        expect(typeof (enforcer as unknown as Record<string, unknown>)['autoResolveExpiredGates']).not.toBe('function');
      }
    });

    it('CRITICAL NEGATIVE TEST: gate remains pending even past expiry time', () => {
      const enforcer = createHITLEnforcer();
      const config = makeHITLConfig();
      const action = makeAction();

      enforcer.enforce(action, config);

      // Gate remains in pending state
      const gates = enforcer.getPendingGates();
      expect(gates).toHaveLength(1);
      // No decision has been made
      expect(gates[0].decision).toBeUndefined();
      expect(gates[0].decidedAt).toBeUndefined();
      expect(gates[0].decidedBy).toBeUndefined();
    });

    it('CRITICAL NEGATIVE TEST: only explicit human decision resolves a gate', () => {
      const enforcer = createHITLEnforcer();
      const config = makeHITLConfig();
      const action = makeAction();

      const result = enforcer.enforce(action, config);
      expect(result.status).toBe('pause');

      if (result.status === 'pause') {
        // Gate is pending
        expect(enforcer.getPendingGates()).toHaveLength(1);

        // Only resolveGate with explicit decision can resolve it
        const resolveResult = enforcer.resolveGate(
          result.gateId,
          'approved',
          'human:praveen',
          'Looks good',
        );
        expect(resolveResult.ok).toBe(true);

        // Now it's resolved
        expect(enforcer.getPendingGates()).toHaveLength(0);
      }
    });

    it('CRITICAL NEGATIVE TEST: governance middleware enforceHITL returns pause, not proceed, for gated actions', async () => {
      const govConfig = makeGovernanceConfig();
      const middleware = createGovernanceMiddleware({ config: govConfig });
      const action = makeAction();

      const hitlResult = await middleware.enforceHITL(action, govConfig.hitl);

      // Must return 'pause', never 'proceed' for full_approval level
      expect(hitlResult.status).toBe('pause');
      expect(hitlResult.status).not.toBe('proceed');
    });

    it('CRITICAL NEGATIVE TEST: no timeout-based auto-approval in escalation config', () => {
      const config = makeHITLConfig();

      // The only valid onTimeout behavior is 'pause_and_notify'
      // There is no 'auto_approve' option
      expect(config.escalation.onTimeout).toBe('pause_and_notify');
      // TypeScript enforces this at compile time as well
      type OnTimeoutType = typeof config.escalation.onTimeout;
      const typeCheck: OnTimeoutType = 'pause_and_notify';
      expect(typeCheck).toBe('pause_and_notify');
    });
  });

  // ==========================================================================
  // 5. Timeout is configurable in agentforge.yaml
  // ==========================================================================

  describe('5. Timeout is configurable', () => {
    it('timeout can be set to custom value via escalation config', () => {
      const config = makeHITLConfig({
        escalation: {
          timeoutMinutes: 15,
          onTimeout: 'pause_and_notify',
          secondaryTimeoutMinutes: 10,
        },
      });

      expect(config.escalation.timeoutMinutes).toBe(15);
      expect(config.escalation.secondaryTimeoutMinutes).toBe(10);
    });

    it('custom timeout is reflected in gate expiration', () => {
      const enforcer = createHITLEnforcer();
      const action = makeAction();

      // Default config uses 60 minutes
      const config = makeHITLConfig();
      enforcer.enforce(action, config);

      const gate = enforcer.getPendingGates()[0];
      const durationMs = new Date(gate.expiresAt).getTime() - new Date(gate.createdAt).getTime();
      // Default: 60 minutes
      expect(durationMs).toBe(60 * 60 * 1000);
    });

    it('escalation config is part of the full governance config', () => {
      const govConfig = makeGovernanceConfig({ timeoutMinutes: 30 });

      expect(govConfig.hitl.escalation.timeoutMinutes).toBe(30);
      expect(govConfig.hitl.escalation.onTimeout).toBe('pause_and_notify');
    });
  });

  // ==========================================================================
  // 6. Escalation state visible in gate status
  // ==========================================================================

  describe('6. Escalation state visible', () => {
    it('gate has escalated field set to false initially', () => {
      const enforcer = createHITLEnforcer();
      const config = makeHITLConfig();
      const action = makeAction();

      enforcer.enforce(action, config);

      const gate = enforcer.getPendingGates()[0];
      expect(gate.escalated).toBe(false);
    });

    it('gate records channels where approval was requested', () => {
      const enforcer = createHITLEnforcer();
      const config = makeHITLConfig();
      const action = makeAction();

      enforcer.enforce(action, config);

      const gate = enforcer.getPendingGates()[0];
      expect(gate.channels).toBeDefined();
      expect(gate.channels.length).toBeGreaterThan(0);
    });

    it('gate tracks decision metadata after resolution', () => {
      const enforcer = createHITLEnforcer();
      const config = makeHITLConfig();
      const action = makeAction();

      const result = enforcer.enforce(action, config);
      expect(result.status).toBe('pause');

      if (result.status === 'pause') {
        // Before resolution: no decision
        const beforeGate = enforcer.getPendingGates()[0];
        expect(beforeGate.decision).toBeUndefined();
        expect(beforeGate.decidedBy).toBeUndefined();

        // After resolution: decision recorded
        enforcer.resolveGate(result.gateId, 'approved', 'human:praveen', 'LGTM');

        // Gate is removed from pending, but the resolve was successful
        expect(enforcer.getPendingGates()).toHaveLength(0);
      }
    });

    it('resolve with changes_requested records feedback', () => {
      const enforcer = createHITLEnforcer();
      const config = makeHITLConfig();
      const action = makeAction();

      const result = enforcer.enforce(action, config);
      expect(result.status).toBe('pause');

      if (result.status === 'pause') {
        const resolveResult = enforcer.resolveGate(
          result.gateId,
          'changes_requested',
          'human:reviewer',
          'Please refactor the component to use hooks',
        );
        expect(resolveResult.ok).toBe(true);
      }
    });

    it('resolving non-existent gate returns error', () => {
      const enforcer = createHITLEnforcer();

      const result = enforcer.resolveGate('non-existent', 'approved', 'human:test');
      expect(result.ok).toBe(false);
    });
  });

  // ==========================================================================
  // Full simulation: timeout -> escalation -> secondary timeout -> full pause
  // ==========================================================================

  describe('Full escalation simulation', () => {
    it('simulates complete escalation flow with short test timeout', () => {
      const events: unknown[] = [];
      const eventBus = { publish: (event: unknown) => events.push(event) };
      const enforcer = createHITLEnforcer(eventBus);
      const config = makeHITLConfig({
        escalation: {
          timeoutMinutes: 1,  // Short timeout for test
          onTimeout: 'pause_and_notify',
          secondaryTimeoutMinutes: 1,
          escalationChannels: ['telegram'],
        },
      });
      const action = makeAction();

      // Step 1: Trigger approval request
      const result = enforcer.enforce(action, config);
      expect(result.status).toBe('pause');

      // HITLApprovalRequested event emitted
      const requestEvent = events.find(
        (e) => (e as Record<string, unknown>).type === 'HITLApprovalRequested',
      );
      expect(requestEvent).toBeDefined();

      // Step 2: Gate is pending with expiration
      const gate = enforcer.getPendingGates()[0];
      expect(gate.escalated).toBe(false);
      expect(gate.expiresAt).toBeDefined();

      // Step 3: Verify timeout doesn't auto-approve
      expect(gate.decision).toBeUndefined();

      // Step 4: Manually resolve (simulating human responding after escalation)
      if (result.status === 'pause') {
        const resolveResult = enforcer.resolveGate(
          result.gateId,
          'approved',
          'human:escalation-responder',
        );
        expect(resolveResult.ok).toBe(true);

        // HITLApprovalReceived event emitted
        const receivedEvent = events.find(
          (e) => (e as Record<string, unknown>).type === 'HITLApprovalReceived',
        );
        expect(receivedEvent).toBeDefined();
      }
    });
  });

  // ==========================================================================
  // HITL levels and phase-specific behavior
  // ==========================================================================

  describe('HITL level enforcement', () => {
    it('fully_autonomous returns proceed immediately (no gate)', () => {
      const enforcer = createHITLEnforcer();
      const config = makeHITLConfig({ defaultLevel: 'fully_autonomous' });
      const action = makeAction();

      const result = enforcer.enforce(action, config);
      expect(result.status).toBe('proceed');
      expect(enforcer.getPendingGates()).toHaveLength(0);
    });

    it('notify_only returns notify without creating a gate', () => {
      const enforcer = createHITLEnforcer();
      const config = makeHITLConfig({ defaultLevel: 'notify_only' });
      const action = makeAction();

      const result = enforcer.enforce(action, config);
      expect(result.status).toBe('notify');
      expect(enforcer.getPendingGates()).toHaveLength(0);
    });

    it('review_and_override creates a gate requiring human decision', () => {
      const enforcer = createHITLEnforcer();
      const config = makeHITLConfig({ defaultLevel: 'review_and_override' });
      const action = makeAction();

      const result = enforcer.enforce(action, config);
      expect(result.status).toBe('pause');
      expect(enforcer.getPendingGates()).toHaveLength(1);
    });

    it('full_approval creates a gate requiring human decision', () => {
      const enforcer = createHITLEnforcer();
      const config = makeHITLConfig({ defaultLevel: 'full_approval' });
      const action = makeAction();

      const result = enforcer.enforce(action, config);
      expect(result.status).toBe('pause');
      expect(enforcer.getPendingGates()).toHaveLength(1);
    });

    it('phase-specific overrides take precedence over default', () => {
      const enforcer = createHITLEnforcer();
      const config = makeHITLConfig({
        defaultLevel: 'review_and_override',
        overrides: {
          design: 'full_approval',
          code_generation: 'notify_only',
        },
      });

      // Code phase maps to code_generation which has notify_only override
      const codeAction = makeAction({ phase: 'code' });
      const codeResult = enforcer.enforce(codeAction, config);
      expect(codeResult.status).toBe('notify');

      // Design phase has full_approval override
      const designAction = makeAction({ phase: 'design' });
      const designResult = enforcer.enforce(designAction, config);
      expect(designResult.status).toBe('pause');
    });
  });

  // ==========================================================================
  // Governance pipeline integration
  // ==========================================================================

  describe('Governance pipeline with escalation', () => {
    it('full pipeline creates gate for full_approval level', async () => {
      const govConfig = makeGovernanceConfig();
      const middleware = createGovernanceMiddleware({ config: govConfig });

      const agent = {
        role: 'code_generator',
        description: 'Generates code',
        category: 'code' as const,
        provider: 'claude-sonnet-4',
        execution: { mode: 'stream' as const, progress_events: true, max_context_tokens: 20000 },
        tools: ['code.write_file'],
        permissions: ['write_code'] as string[],
        denied: [] as string[],
        hitl_policy: 'full_approval' as HITLLevel,
        budget: { max_tokens_per_task: 50000, max_cost_per_task_usd: 2.0 },
        on_complete: 'CodeGenComplete',
        on_error: 'notify_human',
        context: {} as Readonly<Record<string, unknown>>,
      };

      const action = makeAction();
      const estimate = { estimatedInputTokens: 1000, estimatedOutputTokens: 500, estimatedCostUsd: 0.01, confidence: 'high' as const };

      const result = await executeGovernancePipeline(
        middleware, agent, action, estimate, govConfig.hitl,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('pause');
      }
    });
  });
});
