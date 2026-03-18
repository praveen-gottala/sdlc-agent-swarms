/**
 * Unit tests for the audit logger module.
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
  governanceChecks: {
    permissionGranted: true,
    budgetApproved: true,
    hitlResult: 'proceed',
  },
  ...overrides,
});

describe('AuditLogger', () => {
  describe('recordAudit', () => {
    it('stores entry in memory', () => {
      const logger = createAuditLogger();
      const entry = makeEntry();

      logger.recordAudit(entry);

      const results = logger.queryAudit({});
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(entry.id);
    });

    it('appends JSON line to file when fs provided', () => {
      const appendedLines: string[] = [];
      const fs = {
        appendFile: (path: string, content: string) => {
          appendedLines.push(content);
          return { ok: true };
        },
        exists: () => true,
        mkdir: () => ({ ok: true }),
      };

      const logger = createAuditLogger(fs, '/tmp/audit.jsonl');
      const entry = makeEntry();

      logger.recordAudit(entry);

      expect(appendedLines).toHaveLength(1);
      expect(appendedLines[0]).toContain(entry.id);
      expect(appendedLines[0].endsWith('\n')).toBe(true);
    });

    it('never throws even if file write fails', () => {
      const fs = {
        appendFile: () => {
          throw new Error('Disk full');
        },
        exists: () => true,
        mkdir: () => ({ ok: true }),
      };

      const logger = createAuditLogger(fs, '/tmp/audit.jsonl');
      const entry = makeEntry();

      // Should not throw
      expect(() => logger.recordAudit(entry)).not.toThrow();

      // Entry should still be in memory
      const results = logger.queryAudit({});
      expect(results).toHaveLength(1);
    });

    it('creates directory if it does not exist', () => {
      let mkdirCalled = false;
      const fs = {
        appendFile: () => ({ ok: true }),
        exists: () => {
          return false;
        },
        mkdir: () => {
          mkdirCalled = true;
          return { ok: true };
        },
      };

      const logger = createAuditLogger(fs, '/tmp/logs/audit.jsonl');
      logger.recordAudit(makeEntry());

      expect(mkdirCalled).toBe(true);
    });
  });

  describe('queryAudit', () => {
    it('returns all entries with empty filter', () => {
      const logger = createAuditLogger();

      logger.recordAudit(makeEntry({ id: 'a1' }));
      logger.recordAudit(makeEntry({ id: 'a2' }));
      logger.recordAudit(makeEntry({ id: 'a3' }));

      const results = logger.queryAudit({});
      expect(results).toHaveLength(3);
    });

    it('filters by agentId', () => {
      const logger = createAuditLogger();

      logger.recordAudit(makeEntry({ id: 'a1', agentId: 'code-agent' }));
      logger.recordAudit(makeEntry({ id: 'a2', agentId: 'design-agent' }));
      logger.recordAudit(makeEntry({ id: 'a3', agentId: 'code-agent' }));

      const results = logger.queryAudit({ agentId: 'code-agent' });
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.agentId === 'code-agent')).toBe(true);
    });

    it('filters by taskId', () => {
      const logger = createAuditLogger();

      logger.recordAudit(makeEntry({ id: 'a1', taskId: 'task-001' }));
      logger.recordAudit(makeEntry({ id: 'a2', taskId: 'task-002' }));

      const results = logger.queryAudit({ taskId: 'task-001' });
      expect(results).toHaveLength(1);
      expect(results[0].taskId).toBe('task-001');
    });

    it('filters by phase', () => {
      const logger = createAuditLogger();

      logger.recordAudit(makeEntry({ id: 'a1', phase: 'code' }));
      logger.recordAudit(makeEntry({ id: 'a2', phase: 'design' }));
      logger.recordAudit(makeEntry({ id: 'a3', phase: 'code' }));

      const results = logger.queryAudit({ phase: 'code' });
      expect(results).toHaveLength(2);
    });

    it('filters by outcome', () => {
      const logger = createAuditLogger();

      logger.recordAudit(makeEntry({ id: 'a1', outcome: 'success' }));
      logger.recordAudit(makeEntry({ id: 'a2', outcome: 'denied_permission' }));
      logger.recordAudit(makeEntry({ id: 'a3', outcome: 'success' }));

      const results = logger.queryAudit({ outcome: 'denied_permission' });
      expect(results).toHaveLength(1);
      expect(results[0].outcome).toBe('denied_permission');
    });

    it('filters by actionType', () => {
      const logger = createAuditLogger();

      logger.recordAudit(
        makeEntry({ id: 'a1', action: makeAction({ type: 'write_code' }) }),
      );
      logger.recordAudit(
        makeEntry({ id: 'a2', action: makeAction({ type: 'read_code' }) }),
      );

      const results = logger.queryAudit({ actionType: 'write_code' });
      expect(results).toHaveLength(1);
    });

    it('filters by date range', () => {
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

    it('supports limit and offset', () => {
      const logger = createAuditLogger();

      for (let i = 0; i < 10; i++) {
        logger.recordAudit(makeEntry({ id: `a${i}` }));
      }

      const results = logger.queryAudit({ offset: 3, limit: 4 });
      expect(results).toHaveLength(4);
      expect(results[0].id).toBe('a3');
      expect(results[3].id).toBe('a6');
    });
  });
});
