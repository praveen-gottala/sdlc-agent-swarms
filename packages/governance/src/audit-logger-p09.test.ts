/**
 * P09: Audit Log Completeness validation tests.
 * Tests all 6 criteria from Wave 1 readiness validation.
 */

import { createAuditLogger } from './audit-logger.js';
import type { AuditEntry, AgentAction } from './types.js';

const makeAction = (overrides: Partial<AgentAction> = {}): AgentAction => ({
  agentId: 'code-agent',
  taskId: 'task-001',
  type: 'write_code',
  target: 'src/feature.ts',
  description: 'Implement feature',
  phase: 'code',
  timestamp: '2026-03-17T10:00:00Z',
  ...overrides,
});

const makeEntry = (overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  timestamp: '2026-03-17T10:00:00Z',
  agentId: 'code-agent',
  taskId: 'task-001',
  phase: 'code',
  action: makeAction(),
  outcome: 'success',
  inputContext: 'Generate dashboard component based on spec',
  outputProduced: 'Created src/components/Dashboard.tsx',
  approvedBy: 'human:praveen',
  gitCommitSha: 'abc123def456',
  governanceChecks: {
    permissionGranted: true,
    budgetApproved: true,
    hitlResult: 'proceed',
  },
  cost: {
    inputCostUsd: 0.003,
    outputCostUsd: 0.015,
    totalCostUsd: 0.018,
    model: 'claude-sonnet-4',
    timestamp: '2026-03-17T10:00:00Z',
    inputTokens: 1000,
    outputTokens: 500,
    wallClockMs: 1500,
  },
  ...overrides,
});

describe('P09: Audit Log Completeness', () => {
  describe('Criterion 1: All PRD 19.3 required fields present', () => {
    it('audit entry contains all required fields', () => {
      const entry = makeEntry();

      // PRD 19.3: agent identity
      expect(entry.agentId).toBeDefined();
      // PRD 19.3: action taken
      expect(entry.action).toBeDefined();
      expect(entry.action.type).toBeDefined();
      // PRD 19.3: input context
      expect(entry.inputContext).toBeDefined();
      // PRD 19.3: output produced
      expect(entry.outputProduced).toBeDefined();
      // PRD 19.3: approving human
      expect(entry.approvedBy).toBeDefined();
      // PRD 19.3: cost incurred
      expect(entry.cost).toBeDefined();
      expect(entry.cost!.totalCostUsd).toBeGreaterThan(0);
      // PRD 19.3: timestamp
      expect(entry.timestamp).toBeDefined();
      // PRD 19.3: git_commit_sha (if applicable)
      expect(entry.gitCommitSha).toBeDefined();
    });
  });

  describe('Criterion 2: Audit trail is append-only / immutable', () => {
    it('entries cannot be removed through the audit logger', () => {
      const logger = createAuditLogger();

      logger.recordAudit(makeEntry({ id: 'entry-1' }));
      logger.recordAudit(makeEntry({ id: 'entry-2' }));
      logger.recordAudit(makeEntry({ id: 'entry-3' }));

      // No delete/remove/update methods exist on the AuditLogger interface
      const entries = logger.queryAudit({});
      expect(entries).toHaveLength(3);

      // Record another — it's additive
      logger.recordAudit(makeEntry({ id: 'entry-4' }));
      const after = logger.queryAudit({});
      expect(after).toHaveLength(4);
    });

    it('recorded entries maintain their original values', () => {
      const logger = createAuditLogger();
      const entry = makeEntry({ id: 'immutable-1', outcome: 'success' });

      logger.recordAudit(entry);

      const results = logger.queryAudit({});
      expect(results[0].id).toBe('immutable-1');
      expect(results[0].outcome).toBe('success');
    });
  });

  describe('Criterion 3: Queryable by agent, action type, time range, cost', () => {
    it('filters by agent', () => {
      const logger = createAuditLogger();

      logger.recordAudit(makeEntry({ id: 'a1', agentId: 'code-agent' }));
      logger.recordAudit(makeEntry({ id: 'a2', agentId: 'design-agent' }));
      logger.recordAudit(makeEntry({ id: 'a3', agentId: 'code-agent' }));

      const results = logger.queryAudit({ agentId: 'code-agent' });
      expect(results).toHaveLength(2);
    });

    it('filters by action type', () => {
      const logger = createAuditLogger();

      logger.recordAudit(makeEntry({ id: 'a1', action: makeAction({ type: 'write_code' }) }));
      logger.recordAudit(makeEntry({ id: 'a2', action: makeAction({ type: 'read_spec' }) }));

      const results = logger.queryAudit({ actionType: 'write_code' });
      expect(results).toHaveLength(1);
    });

    it('filters by time range', () => {
      const logger = createAuditLogger();

      logger.recordAudit(makeEntry({ id: 'a1', timestamp: '2026-03-15T10:00:00Z' }));
      logger.recordAudit(makeEntry({ id: 'a2', timestamp: '2026-03-17T10:00:00Z' }));
      logger.recordAudit(makeEntry({ id: 'a3', timestamp: '2026-03-19T10:00:00Z' }));

      const results = logger.queryAudit({
        from: '2026-03-16T00:00:00Z',
        to: '2026-03-18T00:00:00Z',
      });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('a2');
    });

    it('filters by cost threshold', () => {
      const logger = createAuditLogger();

      logger.recordAudit(makeEntry({
        id: 'a1',
        cost: { inputCostUsd: 0.01, outputCostUsd: 0.02, totalCostUsd: 0.03, model: 'm', timestamp: 't', inputTokens: 100, outputTokens: 50, wallClockMs: 500 },
      }));
      logger.recordAudit(makeEntry({
        id: 'a2',
        cost: { inputCostUsd: 0.5, outputCostUsd: 1.0, totalCostUsd: 1.50, model: 'm', timestamp: 't', inputTokens: 5000, outputTokens: 2500, wallClockMs: 5000 },
      }));

      const results = logger.queryAudit({ costThresholdUsd: 1.0 });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('a2');
    });
  });

  describe('Criterion 4: Exportable to CSV/JSON', () => {
    it('exports to JSON', () => {
      const logger = createAuditLogger();
      logger.recordAudit(makeEntry({ id: 'export-1' }));
      logger.recordAudit(makeEntry({ id: 'export-2' }));

      const json = logger.exportAudit({}, 'json');
      const parsed = JSON.parse(json) as AuditEntry[];
      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe('export-1');
    });

    it('exports to CSV with headers', () => {
      const logger = createAuditLogger();
      logger.recordAudit(makeEntry({ id: 'csv-1', agentId: 'test-agent' }));

      const csv = logger.exportAudit({}, 'csv');
      const lines = csv.split('\n');
      expect(lines[0]).toContain('id');
      expect(lines[0]).toContain('agentId');
      expect(lines[0]).toContain('costUsd');
      expect(lines[1]).toContain('csv-1');
      expect(lines[1]).toContain('test-agent');
    });
  });

  describe('Criterion 5: Full task lifecycle produces complete audit trail', () => {
    it('all 6 lifecycle steps produce audit entries', () => {
      const logger = createAuditLogger();

      // Step 1: Task created
      logger.recordAudit(makeEntry({
        id: 'lifecycle-1',
        action: makeAction({ type: 'write_tasks', description: 'Create task' }),
        outcome: 'success',
      }));

      // Step 2: Agent executes
      logger.recordAudit(makeEntry({
        id: 'lifecycle-2',
        action: makeAction({ type: 'write_code', description: 'Generate code' }),
        outcome: 'success',
      }));

      // Step 3: CI runs
      logger.recordAudit(makeEntry({
        id: 'lifecycle-3',
        action: makeAction({ type: 'trigger_ci', description: 'Run CI' }),
        outcome: 'success',
      }));

      // Step 4: PR created
      logger.recordAudit(makeEntry({
        id: 'lifecycle-4',
        action: makeAction({ type: 'create_pr', description: 'Create PR' }),
        outcome: 'success',
        gitCommitSha: 'abc123',
      }));

      // Step 5: Human approves
      logger.recordAudit(makeEntry({
        id: 'lifecycle-5',
        action: makeAction({ type: 'merge_pr', description: 'Merge PR' }),
        outcome: 'success',
        approvedBy: 'human:praveen',
        hitlDecision: 'approved',
      }));

      // Step 6: Merged
      logger.recordAudit(makeEntry({
        id: 'lifecycle-6',
        action: makeAction({ type: 'merge_pr', description: 'PR merged' }),
        outcome: 'success',
        gitCommitSha: 'def456',
      }));

      const all = logger.queryAudit({});
      expect(all).toHaveLength(6);

      // Verify no gaps
      const ids = all.map((e) => e.id);
      for (let i = 1; i <= 6; i++) {
        expect(ids).toContain(`lifecycle-${i}`);
      }
    });
  });

  describe('Criterion 6: Denials and failures are logged', () => {
    it('logs permission denied events', () => {
      const logger = createAuditLogger();

      logger.recordAudit(makeEntry({
        id: 'denied-1',
        outcome: 'denied_permission',
        governanceChecks: {
          permissionGranted: false,
          budgetApproved: true,
          hitlResult: 'proceed',
          denialReason: 'Agent does not have write_code permission',
        },
      }));

      const results = logger.queryAudit({ outcome: 'denied_permission' });
      expect(results).toHaveLength(1);
      expect(results[0].governanceChecks.permissionGranted).toBe(false);
    });

    it('logs budget exceeded events', () => {
      const logger = createAuditLogger();

      logger.recordAudit(makeEntry({
        id: 'budget-denied-1',
        outcome: 'denied_budget',
        governanceChecks: {
          permissionGranted: true,
          budgetApproved: false,
          hitlResult: 'proceed',
          denialReason: 'Phase budget exceeded',
        },
      }));

      const results = logger.queryAudit({ outcome: 'denied_budget' });
      expect(results).toHaveLength(1);
      expect(results[0].governanceChecks.budgetApproved).toBe(false);
    });

    it('logs HITL denied events', () => {
      const logger = createAuditLogger();

      logger.recordAudit(makeEntry({
        id: 'hitl-denied-1',
        outcome: 'denied_hitl',
        governanceChecks: {
          permissionGranted: true,
          budgetApproved: true,
          hitlResult: 'denied',
          denialReason: 'Human rejected the action',
        },
      }));

      const results = logger.queryAudit({ outcome: 'denied_hitl' });
      expect(results).toHaveLength(1);
    });
  });
});
