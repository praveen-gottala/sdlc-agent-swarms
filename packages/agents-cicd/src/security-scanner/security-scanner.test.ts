import {
  securityScannerWork,
  SECURITY_SCANNER_CONTRACT,
  parseSecurityOutput,
  buildReviewBody,
} from './security-scanner.js';
import type { SecurityScannerInput, SecurityFinding } from './security-scanner.js';
import type { AgentContext, LLMProviderRef, TaskEntry } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';

// ============================================================================
// Sample outputs
// ============================================================================

const SQL_INJECTION_FINDING: SecurityFinding = {
  file: 'src/routes/users.ts',
  line: 42,
  severity: 'critical',
  category: 'sql_injection',
  description: 'Raw SQL query uses string interpolation with user-supplied id parameter',
  suggestedFix: 'Use parameterized query: db.query("SELECT * FROM users WHERE id = $1", [id])',
};

const XSS_FINDING: SecurityFinding = {
  file: 'src/components/comment.tsx',
  line: 15,
  severity: 'high',
  category: 'xss',
  description: 'dangerouslySetInnerHTML used with unsanitized user content',
  suggestedFix: 'Use DOMPurify to sanitize the content before rendering',
};

const LOW_FINDING: SecurityFinding = {
  file: 'src/routes/api.ts',
  line: 8,
  severity: 'low',
  category: 'missing_rate_limiting',
  description: 'API endpoint lacks rate limiting middleware',
  suggestedFix: 'Add express-rate-limit middleware to the route',
};

const FINDINGS_OUTPUT = `\`\`\`json
{
  "findings": [
    {
      "file": "src/routes/users.ts",
      "line": 42,
      "severity": "critical",
      "category": "sql_injection",
      "description": "Raw SQL query uses string interpolation with user-supplied id parameter",
      "suggestedFix": "Use parameterized query: db.query(\\"SELECT * FROM users WHERE id = $1\\", [id])"
    }
  ]
}
\`\`\``;

const CLEAN_OUTPUT = `\`\`\`json
{
  "findings": []
}
\`\`\``;

const CLEAN_TEXT_OUTPUT = 'No security issues found in this PR diff.';

const PR_DIFF = `diff --git a/src/routes/users.ts b/src/routes/users.ts
--- a/src/routes/users.ts
+++ b/src/routes/users.ts
@@ -40,3 +40,5 @@
+app.get('/users/:id', (req, res) => {
+  const result = db.query(\`SELECT * FROM users WHERE id = \${req.params.id}\`);
+  res.json(result);
+});`;

const makeCostRecord = (totalCostUsd = 0.25) => ({
  inputCostUsd: totalCostUsd * 0.3,
  outputCostUsd: totalCostUsd * 0.7,
  totalCostUsd,
  model: 'claude-sonnet-4',
  timestamp: new Date().toISOString(),
});

const makeTask = (overrides: Partial<TaskEntry> = {}): TaskEntry => ({
  id: 'task_020',
  title: 'Security scan for PR #55',
  phase: 'cicd',
  agent: 'security_scanner',
  status: 'in_progress',
  depends_on: [],
  spec_ref: '',
  branch: 'agentforge/task-010-revenue-chart',
  pr_number: 55,
  cost_usd: 0,
  tokens_used: 0,
  attempts: 0,
  max_attempts: 1,
  hitl_status: 'none',
  hitl_channel: null,
  ...overrides,
});

const makeProvider = (output = FINDINGS_OUTPUT): LLMProviderRef => ({
  name: 'test-provider',
  complete: jest.fn().mockResolvedValue(Ok({
    content: output,
    cost: makeCostRecord(),
  })),
  stream: jest.fn(),
  estimateCost: jest.fn().mockReturnValue({
    estimatedInputTokens: 3000,
    estimatedOutputTokens: 1000,
    estimatedCostUsd: 0.05,
    confidence: 'medium' as const,
  }),
});

const makeContext = (): AgentContext => ({
  taskId: 'task_020',
  projectRoot: '/tmp/test-project',
  eventBus: { publish: jest.fn(), emit: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn(), clear: jest.fn(), history: jest.fn().mockReturnValue([]) },
  fs: {
    readFile: jest.fn().mockReturnValue(Ok('')),
    writeFile: jest.fn().mockReturnValue(Ok(undefined)),
    writeFileAtomic: jest.fn().mockReturnValue(Ok(undefined)),
    exists: jest.fn().mockReturnValue(true),
    mkdir: jest.fn().mockReturnValue(Ok(undefined)),
    rename: jest.fn().mockReturnValue(Ok(undefined)),
    remove: jest.fn().mockReturnValue(Ok(undefined)),
    listDir: jest.fn().mockReturnValue(Ok([])),
    appendFile: jest.fn().mockReturnValue(Ok(undefined)),
  },
  mcpClient: {
    callTool: jest.fn().mockImplementation((server: string, method: string) => {
      if (server === 'github' && method === 'read_pr') {
        return Promise.resolve(Ok(PR_DIFF));
      }
      if (server === 'github' && method === 'create_review') {
        return Promise.resolve(Ok({ success: true }));
      }
      return Promise.resolve(Ok({ success: true }));
    }),
    listTools: jest.fn().mockResolvedValue(Ok([])),
    isAvailable: jest.fn().mockResolvedValue(true),
  },
  runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'proceed' })),
  resolveProvider: jest.fn().mockReturnValue(Ok(makeProvider())),
  recordAudit: jest.fn(),
});

const makeInput = (): SecurityScannerInput => ({
  task: makeTask(),
  projectRoot: '/tmp/test-project',
  prNumber: 55,
  branch: 'agentforge/task-010-revenue-chart',
});

// ============================================================================
// parseSecurityOutput
// ============================================================================

describe('parseSecurityOutput', () => {
  it('parses findings from JSON output', () => {
    const result = parseSecurityOutput(FINDINGS_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].severity).toBe('critical');
      expect(result.value[0].category).toBe('sql_injection');
    }
  });

  it('parses clean scan with empty findings', () => {
    const result = parseSecurityOutput(CLEAN_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('handles "no issues" text without JSON', () => {
    const result = parseSecurityOutput(CLEAN_TEXT_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('returns error for unparseable output', () => {
    const result = parseSecurityOutput('random output {{{');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_MALFORMED_OUTPUT');
    }
  });
});

// ============================================================================
// buildReviewBody
// ============================================================================

describe('buildReviewBody', () => {
  it('builds PASSED body for no findings', () => {
    const body = buildReviewBody([]);
    expect(body).toContain('PASSED');
    expect(body).toContain('No security issues');
  });

  it('builds FAILED body for critical findings', () => {
    const body = buildReviewBody([SQL_INJECTION_FINDING]);
    expect(body).toContain('FAILED');
    expect(body).toContain('1 critical');
    expect(body).toContain('sql_injection');
  });

  it('includes all findings in body', () => {
    const body = buildReviewBody([SQL_INJECTION_FINDING, XSS_FINDING, LOW_FINDING]);
    expect(body).toContain('1 critical');
    expect(body).toContain('1 high');
    expect(body).toContain('1 low');
  });
});

// ============================================================================
// securityScannerWork
// ============================================================================

describe('securityScannerWork', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(require('node:fs'), 'readFileSync').mockReturnValue('# Mock Security Prompt');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('detects SQL injection pattern in PR diff', async () => {
    const ctx = makeContext();
    const provider = makeProvider(FINDINGS_OUTPUT);
    const input = makeInput();

    const result = await securityScannerWork(input, provider, [], ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.findingsCount).toBe(1);
      expect(result.value.criticalCount).toBe(1);
      expect(result.value.passed).toBe(false);
    }
  });

  it('passes clean code with no findings', async () => {
    const ctx = makeContext();
    const provider = makeProvider(CLEAN_OUTPUT);
    const input = makeInput();

    const result = await securityScannerWork(input, provider, [], ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.findingsCount).toBe(0);
      expect(result.value.criticalCount).toBe(0);
      expect(result.value.passed).toBe(true);
    }
  });

  it('reads PR diff via MCP', async () => {
    const ctx = makeContext();
    const provider = makeProvider(CLEAN_OUTPUT);
    const input = makeInput();

    await securityScannerWork(input, provider, [], ctx);

    const mcpCalls = (ctx.mcpClient.callTool as jest.Mock).mock.calls;
    const readCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'github' && call[1] === 'read_pr',
    );
    expect(readCall).toBeDefined();
    expect(readCall![2]).toEqual({ pr_number: 55 });
  });

  it('posts REQUEST_CHANGES review for critical findings', async () => {
    const ctx = makeContext();
    const provider = makeProvider(FINDINGS_OUTPUT);
    const input = makeInput();

    await securityScannerWork(input, provider, [], ctx);

    const mcpCalls = (ctx.mcpClient.callTool as jest.Mock).mock.calls;
    const reviewCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'github' && call[1] === 'create_review',
    );
    expect(reviewCall).toBeDefined();
    expect(reviewCall![2].event).toBe('REQUEST_CHANGES');
  });

  it('posts COMMENT review for clean scan', async () => {
    const ctx = makeContext();
    const provider = makeProvider(CLEAN_OUTPUT);
    const input = makeInput();

    await securityScannerWork(input, provider, [], ctx);

    const mcpCalls = (ctx.mcpClient.callTool as jest.Mock).mock.calls;
    const reviewCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'github' && call[1] === 'create_review',
    );
    expect(reviewCall).toBeDefined();
    expect(reviewCall![2].event).toBe('COMMENT');
  });

  it('emits SecurityScanComplete event', async () => {
    const ctx = makeContext();
    const provider = makeProvider(FINDINGS_OUTPUT);
    const input = makeInput();

    await securityScannerWork(input, provider, [], ctx);

    const publishCalls = (ctx.eventBus.publish as jest.Mock).mock.calls;
    const event = publishCalls.find(
      (call: unknown[]) => (call[0] as { type: string }).type === 'SecurityScanComplete',
    );
    expect(event).toBeDefined();
    expect((event![0] as { prNumber: number }).prNumber).toBe(55);
    expect((event![0] as { criticalCount: number }).criticalCount).toBe(1);
    expect((event![0] as { passed: boolean }).passed).toBe(false);
  });

  it('fails when PR cannot be read', async () => {
    const ctx = makeContext();
    (ctx.mcpClient.callTool as jest.Mock).mockResolvedValue(
      Err({ code: 'INVALID_STATE', message: 'PR not found', recoverable: true }),
    );
    const provider = makeProvider();
    const input = makeInput();

    const result = await securityScannerWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('PR #55');
    }
  });

  it('fails when LLM completion fails', async () => {
    const ctx = makeContext();
    const provider: LLMProviderRef = {
      name: 'test-provider',
      complete: jest.fn().mockResolvedValue(
        Err({ code: 'LLM_API_ERROR', message: 'Rate limited', recoverable: true }),
      ),
      stream: jest.fn(),
      estimateCost: jest.fn().mockReturnValue({
        estimatedInputTokens: 1000,
        estimatedOutputTokens: 500,
        estimatedCostUsd: 0.01,
        confidence: 'medium' as const,
      }),
    };
    const input = makeInput();

    const result = await securityScannerWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_API_ERROR');
    }
  });
});

// ============================================================================
// Contract Tests
// ============================================================================

describe('SECURITY_SCANNER_CONTRACT', () => {
  it('has correct role and category', () => {
    expect(SECURITY_SCANNER_CONTRACT.role).toBe('security_scanner');
    expect(SECURITY_SCANNER_CONTRACT.category).toBe('cicd');
  });

  it('uses claude-sonnet-4 for thorough analysis', () => {
    expect(SECURITY_SCANNER_CONTRACT.provider).toBe('claude-sonnet-4');
  });

  it('uses notify_only HITL policy', () => {
    expect(SECURITY_SCANNER_CONTRACT.hitl_policy).toBe('notify_only');
  });

  it('has read-only permissions (no write_code)', () => {
    expect(SECURITY_SCANNER_CONTRACT.permissions).toContain('read_spec');
    expect(SECURITY_SCANNER_CONTRACT.permissions).toContain('read_code');
    expect(SECURITY_SCANNER_CONTRACT.permissions).not.toContain('write_code');
  });

  it('denies write, deploy, and merge permissions', () => {
    expect(SECURITY_SCANNER_CONTRACT.denied).toContain('write_code');
    expect(SECURITY_SCANNER_CONTRACT.denied).toContain('deploy_staging');
    expect(SECURITY_SCANNER_CONTRACT.denied).toContain('deploy_production');
    expect(SECURITY_SCANNER_CONTRACT.denied).toContain('merge_pr');
    expect(SECURITY_SCANNER_CONTRACT.denied).toContain('write_design');
  });

  it('emits SecurityScanComplete on completion', () => {
    expect(SECURITY_SCANNER_CONTRACT.on_complete).toBe('SecurityScanComplete');
  });

  it('has $1.50 per-task budget', () => {
    expect(SECURITY_SCANNER_CONTRACT.budget.max_cost_per_task_usd).toBe(1.5);
  });
});
