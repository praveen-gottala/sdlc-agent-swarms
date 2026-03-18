/**
 * Security Scan Integration Tests
 *
 * Tests security scanner agent scenarios:
 * - PR with SQL injection → critical finding → review with request_changes
 * - PR with hardcoded API key → high finding → review posted
 * - Clean PR → SecurityScanComplete with passed: true
 */

import {
  Ok,
  Err,
  runAgent,
} from '@agentforge/core';
import type {
  AgentWorkFn,
} from '@agentforge/core';
import {
  createEventCollector,
  createMockMCPClient,
  createTestContext,
  makeContract,
} from './helpers.js';

// ============================================================================
// Security scanner contract
// ============================================================================

const SECURITY_SCANNER_CONTRACT = makeContract({
  role: 'security_scanner',
  description: 'Scans PRs for security vulnerabilities',
  category: 'code',
  permissions: ['read_code'],
  denied: ['write_code', 'deploy_staging', 'deploy_production'],
  hitl_policy: 'notify_only',
  on_complete: '', // Work function emits SecurityScanComplete directly
  on_error: 'retry(max=2) + notify_human',
});

// ============================================================================
// Fixture: PR diffs
// ============================================================================

const SQL_INJECTION_DIFF = `diff --git a/src/routes/users.ts b/src/routes/users.ts
+++ b/src/routes/users.ts
@@ -10,6 +10,12 @@ router.get('/users', async (req, res) => {
+  const userId = req.query.id;
+  const result = await db.query(\`SELECT * FROM users WHERE id = '\${userId}'\`);
+  res.json(result.rows);
`;

const HARDCODED_KEY_DIFF = `diff --git a/src/config/api.ts b/src/config/api.ts
+++ b/src/config/api.ts
@@ -1,3 +1,6 @@
+const API_KEY = 'sk-1234567890abcdef1234567890abcdef';
+const STRIPE_SECRET = 'sk_live_abcdef1234567890';
+export const config = { apiKey: API_KEY, stripe: STRIPE_SECRET };
`;

const CLEAN_DIFF = `diff --git a/src/components/button.tsx b/src/components/button.tsx
+++ b/src/components/button.tsx
@@ -1,5 +1,8 @@
+import { useState } from 'react';
+
+interface ButtonProps {
+  label: string;
+  onClick: () => void;
+}
+
+export const Button = ({ label, onClick }: ButtonProps) => (
+  <button type="button" onClick={onClick}>{label}</button>
+);
`;

// ============================================================================
// Security scan patterns
// ============================================================================

interface SecurityFinding {
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly type: string;
  readonly file: string;
  readonly line: number;
  readonly description: string;
  readonly recommendation: string;
}

const scanForVulnerabilities = (diff: string): SecurityFinding[] => {
  const findings: SecurityFinding[] = [];

  // SQL Injection detection
  const templateLiteralQuery = /db\.query\s*\(\s*`[^`]*\$\{/g;
  if (templateLiteralQuery.test(diff)) {
    findings.push({
      severity: 'critical',
      type: 'SQL_INJECTION',
      file: 'src/routes/users.ts',
      line: 12,
      description: 'SQL query built with string interpolation allows SQL injection',
      recommendation: 'Use parameterized queries: db.query("SELECT * FROM users WHERE id = $1", [userId])',
    });
  }

  // Hardcoded secrets detection
  const secretPatterns = [
    { pattern: /['"]sk[-_][a-zA-Z0-9]{20,}['"]/g, type: 'HARDCODED_API_KEY' },
    { pattern: /['"]sk_live_[a-zA-Z0-9]+['"]/g, type: 'HARDCODED_STRIPE_KEY' },
    { pattern: /['"]ghp_[a-zA-Z0-9]{36}['"]/g, type: 'HARDCODED_GITHUB_TOKEN' },
    { pattern: /['"]AKIA[A-Z0-9]{16}['"]/g, type: 'HARDCODED_AWS_KEY' },
  ];

  for (const { pattern, type } of secretPatterns) {
    if (pattern.test(diff)) {
      findings.push({
        severity: 'high',
        type,
        file: 'src/config/api.ts',
        line: 1,
        description: `Hardcoded ${type.replace('HARDCODED_', '').toLowerCase()} detected in source code`,
        recommendation: 'Use environment variables or a secret manager instead of hardcoding credentials',
      });
    }
  }

  return findings;
};

// ============================================================================
// Tests
// ============================================================================

describe('Security Scan', () => {
  let collector: ReturnType<typeof createEventCollector>;

  beforeEach(() => {
    collector = createEventCollector();
  });

  afterEach(() => {
    collector.clear();
  });

  describe('SQL injection detection', () => {
    it('detects SQL injection and posts request_changes review', async () => {
      const reviewsPosted: Array<{ event: string; body: string }> = [];
      const mcpClient = createMockMCPClient(async (server, method, params) => {
        if (server === 'github' && method === 'read_pr') {
          return Ok(SQL_INJECTION_DIFF);
        }
        if (server === 'github' && method === 'create_review') {
          reviewsPosted.push({ event: params['event'] as string, body: params['body'] as string });
          return Ok({ id: 'review_1' });
        }
        return Ok({ success: true });
      });

      const scanWork: AgentWorkFn<{ prNumber: number }, { passed: boolean; findings: SecurityFinding[] }> = async (input, _provider, _learnings, ctx) => {
        // Read PR diff via MCP
        const prResult = await ctx.mcpClient.callTool('github', 'read_pr', { pr_number: input.prNumber });
        if (!prResult.ok) return Err({ code: 'INVALID_STATE' as const, message: 'Failed to read PR', recoverable: true });

        const diff = prResult.value as string;
        const findings = scanForVulnerabilities(diff);
        const criticalCount = findings.filter((f) => f.severity === 'critical').length;
        const passed = criticalCount === 0 && findings.filter((f) => f.severity === 'high').length === 0;

        // Post review
        const reviewBody = findings.map((f) =>
          `**${f.severity.toUpperCase()}** - ${f.type}\n- File: ${f.file}:${f.line}\n- ${f.description}\n- Fix: ${f.recommendation}`,
        ).join('\n\n');

        await ctx.mcpClient.callTool('github', 'create_review', {
          pr_number: input.prNumber,
          body: reviewBody,
          event: passed ? 'APPROVE' : 'REQUEST_CHANGES',
        });

        // Emit SecurityScanComplete
        ctx.eventBus.publish({
          type: 'SecurityScanComplete',
          taskId: ctx.taskId,
          prNumber: input.prNumber,
          findingsCount: findings.length,
          criticalCount,
          passed,
          source: 'test', timestamp: Date.now(),
        });

        return Ok({ passed, findings });
      };

      const ctx = createTestContext({ eventBus: collector.bus, mcpClient });
      const result = await runAgent(SECURITY_SCANNER_CONTRACT, ctx, { prNumber: 42 }, 'read_code', 'PR #42', 'Security scan', scanWork);

      expect(result.ok).toBe(true);
      if (result.ok && result.value.status === 'completed') {
        expect(result.value.output.passed).toBe(false);
        expect(result.value.output.findings).toHaveLength(1);
        expect(result.value.output.findings[0].severity).toBe('critical');
        expect(result.value.output.findings[0].type).toBe('SQL_INJECTION');
      }

      // Review should be REQUEST_CHANGES
      expect(reviewsPosted).toHaveLength(1);
      expect(reviewsPosted[0].event).toBe('REQUEST_CHANGES');
      expect(reviewsPosted[0].body).toContain('SQL_INJECTION');

      // SecurityScanComplete event
      const scanEvents = collector.eventsOfType('SecurityScanComplete');
      expect(scanEvents).toHaveLength(1);
      expect(scanEvents[0].passed).toBe(false);
      expect(scanEvents[0].criticalCount).toBe(1);
    });
  });

  describe('hardcoded API key detection', () => {
    it('detects hardcoded API key and posts review', async () => {
      const reviewsPosted: Array<{ event: string; body: string }> = [];
      const mcpClient = createMockMCPClient(async (server, method, params) => {
        if (server === 'github' && method === 'read_pr') {
          return Ok(HARDCODED_KEY_DIFF);
        }
        if (server === 'github' && method === 'create_review') {
          reviewsPosted.push({ event: params['event'] as string, body: params['body'] as string });
          return Ok({ id: 'review_2' });
        }
        return Ok({ success: true });
      });

      const scanWork: AgentWorkFn<{ prNumber: number }, { passed: boolean; findings: SecurityFinding[] }> = async (input, _provider, _learnings, ctx) => {
        const prResult = await ctx.mcpClient.callTool('github', 'read_pr', { pr_number: input.prNumber });
        if (!prResult.ok) return Err({ code: 'INVALID_STATE' as const, message: 'Failed', recoverable: true });

        const diff = prResult.value as string;
        const findings = scanForVulnerabilities(diff);
        const criticalCount = findings.filter((f) => f.severity === 'critical').length;
        const passed = criticalCount === 0 && findings.filter((f) => f.severity === 'high').length === 0;

        const reviewBody = findings.map((f) =>
          `**${f.severity.toUpperCase()}** - ${f.type}\n- ${f.description}\n- Fix: ${f.recommendation}`,
        ).join('\n\n');

        await ctx.mcpClient.callTool('github', 'create_review', {
          pr_number: input.prNumber,
          body: reviewBody,
          event: 'REQUEST_CHANGES',
        });

        ctx.eventBus.publish({
          type: 'SecurityScanComplete',
          taskId: ctx.taskId,
          prNumber: input.prNumber,
          findingsCount: findings.length,
          criticalCount,
          passed,
          source: 'test', timestamp: Date.now(),
        });

        return Ok({ passed, findings });
      };

      const ctx = createTestContext({ eventBus: collector.bus, mcpClient });
      const result = await runAgent(SECURITY_SCANNER_CONTRACT, ctx, { prNumber: 43 }, 'read_code', 'PR #43', 'Security scan', scanWork);

      expect(result.ok).toBe(true);
      if (result.ok && result.value.status === 'completed') {
        expect(result.value.output.passed).toBe(false);
        const keyFindings = result.value.output.findings.filter((f) => f.type.includes('KEY') || f.type.includes('STRIPE'));
        expect(keyFindings.length).toBeGreaterThan(0);
      }

      expect(reviewsPosted).toHaveLength(1);
      expect(reviewsPosted[0].event).toBe('REQUEST_CHANGES');

      const scanEvents = collector.eventsOfType('SecurityScanComplete');
      expect(scanEvents).toHaveLength(1);
      expect(scanEvents[0].passed).toBe(false);
    });
  });

  describe('clean PR passes scan', () => {
    it('clean PR produces SecurityScanComplete with passed: true', async () => {
      const reviewsPosted: Array<{ event: string }> = [];
      const mcpClient = createMockMCPClient(async (server, method, params) => {
        if (server === 'github' && method === 'read_pr') {
          return Ok(CLEAN_DIFF);
        }
        if (server === 'github' && method === 'create_review') {
          reviewsPosted.push({ event: params['event'] as string });
          return Ok({ id: 'review_3' });
        }
        return Ok({ success: true });
      });

      const scanWork: AgentWorkFn<{ prNumber: number }, { passed: boolean; findings: SecurityFinding[] }> = async (input, _provider, _learnings, ctx) => {
        const prResult = await ctx.mcpClient.callTool('github', 'read_pr', { pr_number: input.prNumber });
        if (!prResult.ok) return Err({ code: 'INVALID_STATE' as const, message: 'Failed', recoverable: true });

        const diff = prResult.value as string;
        const findings = scanForVulnerabilities(diff);
        const passed = findings.length === 0;

        if (passed) {
          await ctx.mcpClient.callTool('github', 'create_review', {
            pr_number: input.prNumber,
            body: 'Security scan passed. No vulnerabilities detected.',
            event: 'APPROVE',
          });
        }

        ctx.eventBus.publish({
          type: 'SecurityScanComplete',
          taskId: ctx.taskId,
          prNumber: input.prNumber,
          findingsCount: 0,
          criticalCount: 0,
          passed: true,
          source: 'test', timestamp: Date.now(),
        });

        return Ok({ passed, findings });
      };

      const ctx = createTestContext({ eventBus: collector.bus, mcpClient });
      const result = await runAgent(SECURITY_SCANNER_CONTRACT, ctx, { prNumber: 44 }, 'read_code', 'PR #44', 'Security scan', scanWork);

      expect(result.ok).toBe(true);
      if (result.ok && result.value.status === 'completed') {
        expect(result.value.output.passed).toBe(true);
        expect(result.value.output.findings).toHaveLength(0);
      }

      // Review should be APPROVE
      expect(reviewsPosted).toHaveLength(1);
      expect(reviewsPosted[0].event).toBe('APPROVE');

      // SecurityScanComplete with passed: true
      const scanEvents = collector.eventsOfType('SecurityScanComplete');
      expect(scanEvents).toHaveLength(1);
      expect(scanEvents[0].passed).toBe(true);
      expect(scanEvents[0].findingsCount).toBe(0);
      expect(scanEvents[0].criticalCount).toBe(0);
    });
  });

  describe('security scanner contract properties', () => {
    it('has read-only permissions', () => {
      expect(SECURITY_SCANNER_CONTRACT.permissions).toContain('read_code');
      expect(SECURITY_SCANNER_CONTRACT.permissions).not.toContain('write_code');
    });

    it('denies write and deploy permissions', () => {
      expect(SECURITY_SCANNER_CONTRACT.denied).toContain('write_code');
      expect(SECURITY_SCANNER_CONTRACT.denied).toContain('deploy_staging');
      expect(SECURITY_SCANNER_CONTRACT.denied).toContain('deploy_production');
    });

    it('uses notify_only HITL policy', () => {
      expect(SECURITY_SCANNER_CONTRACT.hitl_policy).toBe('notify_only');
    });

    it('work function emits SecurityScanComplete directly', () => {
      // on_complete is empty because the work function handles event emission
      expect(SECURITY_SCANNER_CONTRACT.on_complete).toBe('');
    });
  });

  describe('multiple findings in single scan', () => {
    it('aggregates multiple vulnerability types', () => {
      const combinedDiff = SQL_INJECTION_DIFF + '\n' + HARDCODED_KEY_DIFF;
      const findings = scanForVulnerabilities(combinedDiff);

      expect(findings.length).toBeGreaterThanOrEqual(2);

      const types = findings.map((f) => f.type);
      expect(types).toContain('SQL_INJECTION');
      expect(types.some((t) => t.includes('KEY') || t.includes('STRIPE'))).toBe(true);

      // Verify severity ordering: critical findings first when sorted
      const sortedFindings = [...findings].sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return order[a.severity] - order[b.severity];
      });
      expect(sortedFindings[0].severity).toBe('critical');
    });
  });
});
