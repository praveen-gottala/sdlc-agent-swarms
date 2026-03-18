import { createEventBus } from './event-bus.js';
import type { DomainEvent, DomainEventInput, DomainEventType } from './domain-events.js';
import type { EventBus } from './event-bus.js';

const now = Date.now();

// ─── Fixture events for every domain event type ──────────────────────

const fixtures: Record<DomainEventType, DomainEventInput> = {
  AgentStarted: {
    type: 'AgentStarted',
    agentId: 'agent-1',
    taskId: 'task-1',
    source: 'agent:agent-1',
    timestamp: now,
  },
  AgentCompleted: {
    type: 'AgentCompleted',
    agentId: 'agent-1',
    taskId: 'task-1',
    source: 'agent:agent-1',
    timestamp: now,
  },
  AgentFailed: {
    type: 'AgentFailed',
    agentId: 'agent-1',
    taskId: 'task-1',
    error: 'something went wrong',
    source: 'agent:agent-1',
    timestamp: now,
  },
  AgentAborted: {
    type: 'AgentAborted',
    agentId: 'agent-1',
    taskId: 'task-1',
    reason: 'budget exceeded',
    source: 'agent:agent-1',
    timestamp: now,
  },
  TaskStatusChanged: {
    type: 'TaskStatusChanged',
    taskId: 'task-1',
    from: 'pending',
    to: 'in_progress',
    source: 'orchestrator',
    timestamp: now,
  },
  BudgetAlert: {
    type: 'BudgetAlert',
    level: 'task',
    entityId: 'task-1',
    currentSpendUsd: 4.5,
    limitUsd: 5.0,
    severity: 'warning',
    source: 'governance:budget',
    timestamp: now,
  },
  HITLApprovalRequested: {
    type: 'HITLApprovalRequested',
    gateId: 'gate-1',
    agentId: 'agent-1',
    taskId: 'task-1',
    source: 'governance:hitl',
    timestamp: now,
  },
  HITLApprovalReceived: {
    type: 'HITLApprovalReceived',
    gateId: 'gate-1',
    decision: 'approved',
    decidedBy: 'user-1',
    source: 'governance:hitl',
    timestamp: now,
  },
  HITLApproved: {
    type: 'HITLApproved',
    gateId: 'gate-1',
    decision: 'approved',
    feedback: 'looks good',
    source: 'cli',
    timestamp: now,
  },
  HITLTimeout: {
    type: 'HITLTimeout',
    gateId: 'gate-1',
    escalatedTo: 'tech-lead',
    source: 'governance:hitl',
    timestamp: now,
  },
  TrustEscalated: {
    type: 'TrustEscalated',
    agentRole: 'frontend_coder',
    previousLevel: 'full_approval',
    newLevel: 'review_and_override',
    consecutiveApprovals: 5,
    source: 'governance:trust',
    timestamp: now,
  },
  SpecLockAcquired: {
    type: 'SpecLockAcquired',
    filePath: 'specs/api.yaml',
    agentId: 'agent-1',
    source: 'orchestrator',
    timestamp: now,
  },
  SpecLockReleased: {
    type: 'SpecLockReleased',
    filePath: 'specs/api.yaml',
    agentId: 'agent-1',
    source: 'orchestrator',
    timestamp: now,
  },
  PRMerged: {
    type: 'PRMerged',
    prNumber: 42,
    branch: 'feature/login',
    mergedBy: 'user-1',
    source: 'agent:pr_manager',
    timestamp: now,
  },
  SpecDriftDetected: {
    type: 'SpecDriftDetected',
    specFile: 'specs/api.yaml',
    deviations: ['field renamed'],
    severity: 'minor',
    source: 'orchestrator',
    timestamp: now,
  },
  PageRequested: {
    type: 'PageRequested',
    pageId: 'page-1',
    taskId: 'task-1',
    description: 'Login page',
    source: 'agent:page_request_handler',
    timestamp: now,
  },
  UXResearchComplete: {
    type: 'UXResearchComplete',
    pageId: 'page-1',
    taskId: 'task-1',
    layoutSuggestions: ['centered form'],
    source: 'agent:ux_researcher',
    timestamp: now,
  },
  WireframeComplete: {
    type: 'WireframeComplete',
    pageId: 'page-1',
    taskId: 'task-1',
    designRef: 'designs/login-v1.pen',
    source: 'agent:wireframer',
    timestamp: now,
  },
  WireframeApproved: {
    type: 'WireframeApproved',
    pageId: 'page-1',
    taskId: 'task-1',
    designRef: 'designs/login-v1.pen',
    source: 'cli',
    timestamp: now,
  },
  VisualDesignComplete: {
    type: 'VisualDesignComplete',
    pageId: 'page-1',
    taskId: 'task-1',
    designRef: 'designs/login-final.pen',
    source: 'agent:visual_designer',
    timestamp: now,
  },
  DesignReviewComplete: {
    type: 'DesignReviewComplete',
    pageId: 'page-1',
    taskId: 'task-1',
    passed: true,
    issues: [],
    source: 'agent:design_reviewer',
    timestamp: now,
  },
  DesignPhaseComplete: {
    type: 'DesignPhaseComplete',
    specRef: 'specs/login.yaml',
    designRef: 'designs/login-final.pen',
    source: 'orchestrator',
    timestamp: now,
  },
  SpecComplete: {
    type: 'SpecComplete',
    specRef: 'specs/login.yaml',
    taskId: 'task-1',
    source: 'agent:spec_writer',
    timestamp: now,
  },
  TasksCreated: {
    type: 'TasksCreated',
    taskCount: 3,
    taskIds: ['t-1', 't-2', 't-3'],
    source: 'orchestrator',
    timestamp: now,
  },
  CodeGenComplete: {
    type: 'CodeGenComplete',
    taskId: 'task-1',
    agentId: 'codegen-1',
    branch: 'feature/login',
    filesGenerated: ['src/login.ts'],
    source: 'agent:codegen-1',
    timestamp: now,
  },
  TestsComplete: {
    type: 'TestsComplete',
    taskId: 'task-1',
    agentId: 'testwriter-1',
    branch: 'feature/login',
    testFilesGenerated: ['src/login.test.ts'],
    source: 'agent:testwriter-1',
    timestamp: now,
  },
  PRCreated: {
    type: 'PRCreated',
    taskId: 'task-1',
    prNumber: 42,
    branch: 'feature/login',
    source: 'agent:pr_manager',
    timestamp: now,
  },
  ReviewComplete: {
    type: 'ReviewComplete',
    taskId: 'task-1',
    agentId: 'reviewer-1',
    prNumber: 42,
    decision: 'approved',
    source: 'agent:reviewer-1',
    timestamp: now,
  },
  CIFailed: {
    type: 'CIFailed',
    taskId: 'task-1',
    branch: 'feature/login',
    runId: 'run-123',
    logs: 'test failed',
    source: 'orchestrator',
    timestamp: now,
  },
  CIResult: {
    type: 'CIResult',
    taskId: 'task-1',
    passed: true,
    duration: 120,
    source: 'orchestrator',
    timestamp: now,
  },
  SecurityScanComplete: {
    type: 'SecurityScanComplete',
    taskId: 'task-1',
    prNumber: 42,
    findingsCount: 0,
    criticalCount: 0,
    passed: true,
    source: 'agent:security_scanner',
    timestamp: now,
  },
  BuildFixComplete: {
    type: 'BuildFixComplete',
    taskId: 'task-1',
    branch: 'feature/login',
    fixApplied: true,
    source: 'agent:build_fixer',
    timestamp: now,
  },
  DeployComplete: {
    type: 'DeployComplete',
    taskId: 'task-1',
    environment: 'staging',
    healthy: true,
    source: 'agent:deployer',
    timestamp: now,
  },
  DeployFailed: {
    type: 'DeployFailed',
    taskId: 'task-1',
    environment: 'staging',
    reason: 'health check timeout',
    source: 'agent:deployer',
    timestamp: now,
  },
};

// ─── Tests ───────────────────────────────────────────────────────────

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = createEventBus();
  });

  afterEach(() => {
    bus.clear();
  });

  // ── 1. publish delivers to all subscribers of that event type ──

  it('delivers a published event to a subscriber', () => {
    const received: DomainEvent[] = [];
    bus.subscribe('AgentStarted', (e) => received.push(e));

    bus.publish(fixtures.AgentStarted);

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('AgentStarted');
  });

  // ── 2. Events received in emission order ──

  it('delivers events in emission order', () => {
    const received: DomainEvent[] = [];
    bus.subscribe('TaskStatusChanged', (e) => received.push(e));

    const first: DomainEventInput = {
      type: 'TaskStatusChanged',
      taskId: 'task-1',
      from: 'pending',
      to: 'in_progress',
      source: 'orchestrator',
      timestamp: now,
    };
    const second: DomainEventInput = {
      type: 'TaskStatusChanged',
      taskId: 'task-1',
      from: 'in_progress',
      to: 'complete',
      source: 'orchestrator',
      timestamp: now + 1,
    };
    const third: DomainEventInput = {
      type: 'TaskStatusChanged',
      taskId: 'task-2',
      from: 'pending',
      to: 'in_progress',
      source: 'orchestrator',
      timestamp: now + 2,
    };

    bus.publish(first);
    bus.publish(second);
    bus.publish(third);

    expect(received).toHaveLength(3);
    expect(received[0].timestamp).toBe(now);
    expect(received[1].timestamp).toBe(now + 1);
    expect(received[2].timestamp).toBe(now + 2);
  });

  // ── 3. Multiple subscribers on same event type all receive it ──

  it('delivers the same event to multiple subscribers', () => {
    const receivedA: DomainEvent[] = [];
    const receivedB: DomainEvent[] = [];
    const receivedC: DomainEvent[] = [];

    bus.subscribe('PRCreated', (e) => receivedA.push(e));
    bus.subscribe('PRCreated', (e) => receivedB.push(e));
    bus.subscribe('PRCreated', (e) => receivedC.push(e));

    bus.publish(fixtures.PRCreated);

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(1);
    expect(receivedC).toHaveLength(1);
    // All receive the same object reference
    expect(receivedA[0]).toBe(receivedB[0]);
    expect(receivedB[0]).toBe(receivedC[0]);
  });

  // ── 4. No cross-type event delivery ──

  it('does not deliver events to subscribers of different types', () => {
    const started: DomainEvent[] = [];
    const failed: DomainEvent[] = [];
    const budget: DomainEvent[] = [];

    bus.subscribe('AgentStarted', (e) => started.push(e));
    bus.subscribe('AgentFailed', (e) => failed.push(e));
    bus.subscribe('BudgetAlert', (e) => budget.push(e));

    bus.publish(fixtures.AgentStarted);

    expect(started).toHaveLength(1);
    expect(failed).toHaveLength(0);
    expect(budget).toHaveLength(0);
  });

  it('routes each event type to the correct subscriber only', () => {
    const buckets: Record<string, DomainEvent[]> = {};
    const typesToTest: DomainEventType[] = [
      'TaskStatusChanged',
      'PRCreated',
      'PRMerged',
      'HITLApproved',
      'HITLTimeout',
      'TrustEscalated',
      'BudgetAlert',
      'DesignPhaseComplete',
      'SpecComplete',
      'CIFailed',
      'CIResult',
      'DeployComplete',
      'AgentAborted',
    ];

    for (const t of typesToTest) {
      buckets[t] = [];
      bus.subscribe(t, ((e: DomainEvent) => buckets[t].push(e)) as never);
    }

    for (const t of typesToTest) {
      bus.publish(fixtures[t]);
    }

    for (const t of typesToTest) {
      expect(buckets[t]).toHaveLength(1);
      expect(buckets[t][0].type).toBe(t);
    }
  });

  // ── 5. All domain event types are defined and emittable ──

  describe('domain event registry completeness', () => {
    const allEventTypes: DomainEventType[] = [
      // Agent lifecycle
      'AgentStarted',
      'AgentCompleted',
      'AgentFailed',
      'AgentAborted',
      // Task coordination
      'TaskStatusChanged',
      'TasksCreated',
      'SpecLockAcquired',
      'SpecLockReleased',
      // HITL / Governance
      'HITLApprovalRequested',
      'HITLApprovalReceived',
      'HITLApproved',
      'HITLTimeout',
      'TrustEscalated',
      'BudgetAlert',
      // Design phase
      'PageRequested',
      'UXResearchComplete',
      'WireframeComplete',
      'WireframeApproved',
      'VisualDesignComplete',
      'DesignReviewComplete',
      'DesignPhaseComplete',
      'SpecDriftDetected',
      // Spec phase
      'SpecComplete',
      // Code generation
      'CodeGenComplete',
      'TestsComplete',
      'PRCreated',
      'PRMerged',
      'ReviewComplete',
      // CI/CD
      'CIFailed',
      'CIResult',
      'SecurityScanComplete',
      'BuildFixComplete',
      'DeployComplete',
      'DeployFailed',
    ];

    it('has a fixture for every defined domain event type', () => {
      for (const eventType of allEventTypes) {
        expect(fixtures[eventType]).toBeDefined();
        expect(fixtures[eventType].type).toBe(eventType);
      }
    });

    it.each(allEventTypes)(
      '%s can be published and received',
      (eventType) => {
        const received: DomainEvent[] = [];
        bus.subscribe(eventType, ((e: DomainEvent) => received.push(e)) as never);

        bus.publish(fixtures[eventType]);

        expect(received).toHaveLength(1);
        expect(received[0].type).toBe(eventType);
      },
    );

    it('fixture map covers all 34 event types in the DomainEvent union', () => {
      const fixtureTypes = Object.keys(fixtures).sort();
      const expectedTypes = [...allEventTypes].sort();
      expect(fixtureTypes).toEqual(expectedTypes);
    });
  });

  // ── 6. Each event carries event_id, source, and timestamp ──

  describe('event base fields (event_id, source, timestamp)', () => {
    it('auto-generates event_id when not provided', () => {
      const received: DomainEvent[] = [];
      bus.subscribe('AgentStarted', (e) => received.push(e));

      bus.publish(fixtures.AgentStarted);

      expect(received[0].event_id).toBeDefined();
      expect(typeof received[0].event_id).toBe('string');
      expect(received[0].event_id.length).toBeGreaterThan(0);
    });

    it('preserves caller-provided event_id', () => {
      const received: DomainEvent[] = [];
      bus.subscribe('AgentStarted', (e) => received.push(e));

      bus.publish({ ...fixtures.AgentStarted, event_id: 'custom-id-123' });

      expect(received[0].event_id).toBe('custom-id-123');
    });

    it('generates unique event_ids for each emission', () => {
      const received: DomainEvent[] = [];
      bus.subscribe('AgentStarted', (e) => received.push(e));

      bus.publish(fixtures.AgentStarted);
      bus.publish(fixtures.AgentStarted);
      bus.publish(fixtures.AgentStarted);

      const ids = received.map((e) => e.event_id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it('every event has a source field', () => {
      const received: DomainEvent[] = [];
      bus.subscribe('BudgetAlert', (e) => received.push(e));

      bus.publish(fixtures.BudgetAlert);

      expect(received[0].source).toBe('governance:budget');
    });

    it('every event has a numeric timestamp', () => {
      for (const event of Object.values(fixtures)) {
        expect(typeof event.timestamp).toBe('number');
        expect(event.timestamp).toBeGreaterThan(0);
      }
    });
  });

  // ── Per-event payload structure ──

  describe('event payload structure', () => {
    it('every fixture has a type field matching its key', () => {
      for (const [key, event] of Object.entries(fixtures)) {
        expect(event.type).toBe(key);
      }
    });

    it('TaskStatusChanged carries from/to fields', () => {
      const event = fixtures.TaskStatusChanged;
      if (event.type === 'TaskStatusChanged') {
        expect(event.from).toBe('pending');
        expect(event.to).toBe('in_progress');
        expect(event.taskId).toBeDefined();
      }
    });

    it('BudgetAlert carries level, spend, limit, and severity', () => {
      const event = fixtures.BudgetAlert;
      if (event.type === 'BudgetAlert') {
        expect(event.level).toBe('task');
        expect(event.currentSpendUsd).toBe(4.5);
        expect(event.limitUsd).toBe(5.0);
        expect(event.severity).toBe('warning');
      }
    });

    it('HITLApproved carries gateId, decision, source', () => {
      const event = fixtures.HITLApproved;
      if (event.type === 'HITLApproved') {
        expect(event.gateId).toBe('gate-1');
        expect(event.decision).toBe('approved');
        expect(event.source).toBe('cli');
      }
    });

    it('CIResult carries taskId, passed, duration', () => {
      const event = fixtures.CIResult;
      if (event.type === 'CIResult') {
        expect(event.taskId).toBe('task-1');
        expect(event.passed).toBe(true);
        expect(event.duration).toBe(120);
      }
    });

    it('HITLTimeout carries gateId, escalatedTo', () => {
      const event = fixtures.HITLTimeout;
      if (event.type === 'HITLTimeout') {
        expect(event.gateId).toBe('gate-1');
        expect(event.escalatedTo).toBe('tech-lead');
      }
    });

    it('TrustEscalated carries agentRole, levels, consecutiveApprovals', () => {
      const event = fixtures.TrustEscalated;
      if (event.type === 'TrustEscalated') {
        expect(event.agentRole).toBe('frontend_coder');
        expect(event.previousLevel).toBe('full_approval');
        expect(event.newLevel).toBe('review_and_override');
        expect(event.consecutiveApprovals).toBe(5);
      }
    });

    it('PRCreated carries taskId, prNumber, branch', () => {
      const event = fixtures.PRCreated;
      if (event.type === 'PRCreated') {
        expect(event.taskId).toBe('task-1');
        expect(event.prNumber).toBe(42);
        expect(event.branch).toBe('feature/login');
      }
    });

    it('DeployComplete carries environment and healthy flag', () => {
      const event = fixtures.DeployComplete;
      if (event.type === 'DeployComplete') {
        expect(event.environment).toBe('staging');
        expect(event.healthy).toBe(true);
      }
    });
  });

  // ── 7. Event history / replay buffer ──

  describe('event history', () => {
    it('returns all emitted events in order', () => {
      bus.publish(fixtures.AgentStarted);
      bus.publish(fixtures.TaskStatusChanged);
      bus.publish(fixtures.PRCreated);
      bus.publish(fixtures.CIResult);
      bus.publish(fixtures.DeployComplete);

      const history = bus.history();

      expect(history).toHaveLength(5);
      expect(history[0].type).toBe('AgentStarted');
      expect(history[1].type).toBe('TaskStatusChanged');
      expect(history[2].type).toBe('PRCreated');
      expect(history[3].type).toBe('CIResult');
      expect(history[4].type).toBe('DeployComplete');
    });

    it('filters by event type', () => {
      bus.publish(fixtures.AgentStarted);
      bus.publish(fixtures.TaskStatusChanged);
      bus.publish(fixtures.AgentStarted);
      bus.publish(fixtures.PRCreated);
      bus.publish(fixtures.AgentStarted);

      const filtered = bus.history({ type: 'AgentStarted' });

      expect(filtered).toHaveLength(3);
      expect(filtered.every((e) => e.type === 'AgentStarted')).toBe(true);
    });

    it('filters by timestamp (after)', () => {
      bus.publish({ ...fixtures.AgentStarted, timestamp: 1000 });
      bus.publish({ ...fixtures.TaskStatusChanged, timestamp: 2000 });
      bus.publish({ ...fixtures.PRCreated, timestamp: 3000 });
      bus.publish({ ...fixtures.CIResult, timestamp: 4000 });
      bus.publish({ ...fixtures.DeployComplete, timestamp: 5000 });

      const filtered = bus.history({ after: 3000 });

      expect(filtered).toHaveLength(2);
      expect(filtered[0].type).toBe('CIResult');
      expect(filtered[1].type).toBe('DeployComplete');
    });

    it('combines type and timestamp filters', () => {
      bus.publish({ ...fixtures.AgentStarted, timestamp: 1000 });
      bus.publish({ ...fixtures.AgentStarted, timestamp: 2000 });
      bus.publish({ ...fixtures.TaskStatusChanged, timestamp: 3000 });
      bus.publish({ ...fixtures.AgentStarted, timestamp: 4000 });

      const filtered = bus.history({ type: 'AgentStarted', after: 1500 });

      expect(filtered).toHaveLength(2);
      expect(filtered[0].timestamp).toBe(2000);
      expect(filtered[1].timestamp).toBe(4000);
    });

    it('evicts oldest events when buffer exceeds historyLimit', () => {
      const smallBus = createEventBus({ historyLimit: 3 });

      smallBus.publish({ ...fixtures.AgentStarted, timestamp: 1 });
      smallBus.publish({ ...fixtures.AgentStarted, timestamp: 2 });
      smallBus.publish({ ...fixtures.AgentStarted, timestamp: 3 });
      smallBus.publish({ ...fixtures.AgentStarted, timestamp: 4 });
      smallBus.publish({ ...fixtures.AgentStarted, timestamp: 5 });

      const history = smallBus.history();

      expect(history).toHaveLength(3);
      expect(history[0].timestamp).toBe(3);
      expect(history[1].timestamp).toBe(4);
      expect(history[2].timestamp).toBe(5);
    });

    it('returns empty array when no events have been emitted', () => {
      expect(bus.history()).toEqual([]);
    });

    it('clear() also clears the history buffer', () => {
      bus.publish(fixtures.AgentStarted);
      bus.publish(fixtures.PRCreated);

      bus.clear();

      expect(bus.history()).toEqual([]);
    });

    it('returns a copy — mutations do not affect the buffer', () => {
      bus.publish(fixtures.AgentStarted);

      const history = bus.history();
      history.length = 0;

      expect(bus.history()).toHaveLength(1);
    });

    it('enriched events in history have event_id', () => {
      bus.publish(fixtures.AgentStarted);

      const history = bus.history();
      expect(history[0].event_id).toBeDefined();
      expect(typeof history[0].event_id).toBe('string');
    });
  });

  // ── emit() alias ──

  describe('emit() alias (ADR-003)', () => {
    it('emit() delivers events identically to publish()', () => {
      const received: DomainEvent[] = [];
      bus.subscribe('PRMerged', (e) => received.push(e));

      bus.emit(fixtures.PRMerged);

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe('PRMerged');
    });

    it('emit() populates event history', () => {
      bus.emit(fixtures.AgentStarted);
      bus.emit(fixtures.PRCreated);

      expect(bus.history()).toHaveLength(2);
    });

    it('emit() auto-generates event_id', () => {
      const received: DomainEvent[] = [];
      bus.subscribe('CIResult', (e) => received.push(e));

      bus.emit(fixtures.CIResult);

      expect(received[0].event_id).toBeDefined();
    });
  });

  // ── Unsubscribe ──

  it('stops delivering events after unsubscribe', () => {
    const received: DomainEvent[] = [];
    const handler = (e: DomainEvent) => received.push(e);

    bus.subscribe('AgentStarted', handler as never);
    bus.publish(fixtures.AgentStarted);
    expect(received).toHaveLength(1);

    bus.unsubscribe('AgentStarted', handler as never);
    bus.publish(fixtures.AgentStarted);
    expect(received).toHaveLength(1);
  });

  it('clear removes all listeners across all event types', () => {
    const received: DomainEvent[] = [];
    bus.subscribe('AgentStarted', (e) => received.push(e));
    bus.subscribe('AgentFailed', (e) => received.push(e));
    bus.subscribe('BudgetAlert', (e) => received.push(e));

    bus.clear();

    bus.publish(fixtures.AgentStarted);
    bus.publish(fixtures.AgentFailed);
    bus.publish(fixtures.BudgetAlert);

    expect(received).toHaveLength(0);
  });

  // ── Type narrowing compile-time check ──

  it('provides correctly narrowed types to handlers', () => {
    bus.subscribe('AgentFailed', (event) => {
      const _error: string = event.error;
      const _agentId: string = event.agentId;
      expect(_error).toBe('something went wrong');
      expect(_agentId).toBe('agent-1');
    });

    bus.publish(fixtures.AgentFailed);
  });

  // ── New event types: CIResult, HITLTimeout, TrustEscalated ──

  describe('new domain events (CIResult, HITLTimeout, TrustEscalated)', () => {
    it('CIResult can be emitted and received with correct payload', () => {
      const received: DomainEvent[] = [];
      bus.subscribe('CIResult', (e) => {
        expect(e.taskId).toBe('task-1');
        expect(e.passed).toBe(true);
        expect(e.duration).toBe(120);
        expect(e.logs).toBeUndefined();
        received.push(e);
      });

      bus.publish(fixtures.CIResult);
      expect(received).toHaveLength(1);
    });

    it('CIResult with failure and logs', () => {
      const received: DomainEvent[] = [];
      bus.subscribe('CIResult', (e) => {
        expect(e.passed).toBe(false);
        expect(e.logs).toBe('npm test exited with code 1');
        received.push(e);
      });

      bus.publish({
        type: 'CIResult',
        taskId: 'task-2',
        passed: false,
        logs: 'npm test exited with code 1',
        duration: 45,
        source: 'orchestrator',
        timestamp: now,
      });

      expect(received).toHaveLength(1);
    });

    it('HITLTimeout can be emitted and received with correct payload', () => {
      const received: DomainEvent[] = [];
      bus.subscribe('HITLTimeout', (e) => {
        expect(e.gateId).toBe('gate-1');
        expect(e.escalatedTo).toBe('tech-lead');
        received.push(e);
      });

      bus.publish(fixtures.HITLTimeout);
      expect(received).toHaveLength(1);
    });

    it('TrustEscalated can be emitted and received with correct payload', () => {
      const received: DomainEvent[] = [];
      bus.subscribe('TrustEscalated', (e) => {
        expect(e.agentRole).toBe('frontend_coder');
        expect(e.previousLevel).toBe('full_approval');
        expect(e.newLevel).toBe('review_and_override');
        expect(e.consecutiveApprovals).toBe(5);
        received.push(e);
      });

      bus.publish(fixtures.TrustEscalated);
      expect(received).toHaveLength(1);
    });
  });

  // ── Interface contract ──

  describe('EventBus interface contract', () => {
    it('exposes publish method', () => {
      expect(typeof bus.publish).toBe('function');
    });

    it('exposes emit method (alias)', () => {
      expect(typeof bus.emit).toBe('function');
    });

    it('exposes subscribe method', () => {
      expect(typeof bus.subscribe).toBe('function');
    });

    it('exposes unsubscribe method', () => {
      expect(typeof bus.unsubscribe).toBe('function');
    });

    it('exposes clear method', () => {
      expect(typeof bus.clear).toBe('function');
    });

    it('exposes history method', () => {
      expect(typeof bus.history).toBe('function');
    });
  });
});
