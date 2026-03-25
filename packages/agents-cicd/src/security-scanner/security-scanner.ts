/**
 * @module @agentforge/agents-cicd/security-scanner
 *
 * Security scanner agent: runs LLM-based static analysis (SAST) on every
 * PR to detect vulnerabilities. Uses claude-sonnet-4-6 for thorough analysis.
 * Categorizes findings by severity and blocks critical/high issues.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AgentContract,
  AgentContext,
  AgentWorkFn,
  Result,
  EventBus,
  TaskEntry,
} from '@agentforge/core';
import { Ok, Err, runAgent } from '@agentforge/core';

// ============================================================================
// Types
// ============================================================================

/** A single security finding from the scanner. */
export interface SecurityFinding {
  readonly file: string;
  readonly line: number;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly category: string;
  readonly description: string;
  readonly suggestedFix: string;
}

/** Input for the security scanner agent. */
export interface SecurityScannerInput {
  readonly task: TaskEntry;
  readonly projectRoot: string;
  readonly prNumber: number;
  readonly branch: string;
}

/** Output produced by the security scanner agent. */
export interface SecurityScannerOutput {
  readonly prNumber: number;
  readonly findings: readonly SecurityFinding[];
  readonly findingsCount: number;
  readonly criticalCount: number;
  readonly highCount: number;
  readonly passed: boolean;
  readonly totalCostUsd: number;
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the security scanner. */
export const SECURITY_SCANNER_CONTRACT: AgentContract = {
  role: 'security_scanner',
  description: 'Runs SAST scans on every PR, categorizes findings by severity, blocks critical issues',
  category: 'cicd',
  provider: 'claude-sonnet-4-6',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 40000 },
  tools: ['github.read_pr', 'github.create_review'],
  permissions: ['read_spec', 'read_code'],
  denied: ['write_code', 'write_design', 'deploy_staging', 'deploy_production', 'merge_pr'],
  hitl_policy: 'notify_only',
  budget: { max_tokens_per_task: 40000, max_cost_per_task_usd: 1.5 },
  on_complete: 'SecurityScanComplete',
  on_error: 'notify_human + pause',
  context: {},
};

// ============================================================================
// System prompt loading
// ============================================================================

let systemPromptCache: string | undefined;

const loadSecurityPrompt = (promptPath: string): string => {
  if (systemPromptCache) return systemPromptCache;
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

// ============================================================================
// Helpers
// ============================================================================

/** Parse the LLM's security scan output from JSON. */
export const parseSecurityOutput = (output: string): Result<readonly SecurityFinding[]> => {
  const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const raw = jsonMatch ? jsonMatch[1] : output;

  try {
    const parsed = JSON.parse(raw.trim()) as { findings?: SecurityFinding[] };
    const findings = Array.isArray(parsed) ? parsed : (parsed.findings ?? []);
    return Ok(findings as readonly SecurityFinding[]);
  } catch {
    // If no JSON found, assume clean scan
    if (/no\s+(security\s+)?issues|clean|no\s+findings/i.test(output)) {
      return Ok([]);
    }
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: 'Failed to parse security scan output as JSON',
      recoverable: true,
    });
  }
};

/** Build the review body from findings. */
export const buildReviewBody = (findings: readonly SecurityFinding[]): string => {
  if (findings.length === 0) {
    return '## Security Scan: PASSED\n\nNo security issues found.';
  }

  const sections = findings.map((f) =>
    [
      `### [${f.severity.toUpperCase()}] ${f.category}`,
      `**File:** \`${f.file}\` (line ${f.line})`,
      `**Issue:** ${f.description}`,
      `**Fix:** ${f.suggestedFix}`,
    ].join('\n'),
  );

  const critical = findings.filter((f) => f.severity === 'critical').length;
  const high = findings.filter((f) => f.severity === 'high').length;
  const medium = findings.filter((f) => f.severity === 'medium').length;
  const low = findings.filter((f) => f.severity === 'low').length;

  return [
    `## Security Scan: ${critical + high > 0 ? 'FAILED' : 'PASSED WITH WARNINGS'}`,
    `\nFindings: ${critical} critical, ${high} high, ${medium} medium, ${low} low\n`,
    ...sections,
  ].join('\n\n');
};

// ============================================================================
// Work function
// ============================================================================

/**
 * Security scanner work function.
 * Reads PR diff, runs LLM-based SAST, posts review with findings.
 */
export const securityScannerWork: AgentWorkFn<SecurityScannerInput, SecurityScannerOutput> = async (
  input,
  provider,
  learnings,
  context,
) => {
  const { task, prNumber } = input;

  // 1. Read PR diff via MCP
  const prResult = await context.mcpClient.callTool('github', 'read_pr', {
    pr_number: prNumber,
  });
  if (!prResult.ok) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: `Failed to read PR #${prNumber}: ${prResult.error.message}`,
      recoverable: true,
    });
  }

  const prData = typeof prResult.value === 'string'
    ? prResult.value
    : JSON.stringify(prResult.value, null, 2);

  // 2. Load security scan prompt
  const promptPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'stacks',
    'react-node-prisma',
    'prompts',
    'security_scan.md',
  );

  let systemPrompt: string;
  try {
    systemPrompt = loadSecurityPrompt(promptPath);
  } catch {
    // Fall back to inline prompt if stack prompt not found
    systemPrompt = FALLBACK_SECURITY_PROMPT;
  }

  // 3. Build the user message
  const userMessage = [
    `## PR #${prNumber} Diff\n\`\`\`\n${prData}\n\`\`\``,
    learnings.length > 0
      ? `\n## Agent Learnings\n${JSON.stringify(learnings, null, 2)}`
      : '',
    '\nPerform a security scan on this PR diff. Return findings in the JSON format specified.',
  ].join('\n');

  const prompt = {
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: userMessage }],
  };

  // 4. Call LLM
  const completionResult = await provider.complete(prompt, {
    model: context.resolvedModel ?? SECURITY_SCANNER_CONTRACT.provider,
    maxTokens: 4000,
    temperature: 0,
  });
  if (!completionResult.ok) {
    return Err({
      code: 'LLM_API_ERROR' as const,
      message: `LLM completion failed: ${completionResult.error.message}`,
      recoverable: true,
    });
  }

  const completionValue = completionResult.value as { content: string; cost: { totalCostUsd: number } };
  const { content, cost } = completionValue;

  // 5. Parse findings
  const findingsResult = parseSecurityOutput(content);
  if (!findingsResult.ok) {
    return Err(findingsResult.error);
  }

  const findings = findingsResult.value;
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const passed = criticalCount === 0 && highCount === 0;

  // 6. Post review via MCP
  const reviewBody = buildReviewBody(findings);
  const reviewEvent = passed ? 'COMMENT' : 'REQUEST_CHANGES';

  await context.mcpClient.callTool('github', 'create_review', {
    pr_number: prNumber,
    body: reviewBody,
    event: reviewEvent,
  });

  // 7. Emit SecurityScanComplete
  context.eventBus.publish({
    type: 'SecurityScanComplete',
    taskId: task.id,
    prNumber,
    findingsCount: findings.length,
    criticalCount,
    passed,
    source: 'agent:security_scanner',
    timestamp: Date.now(),
  });

  return Ok({
    prNumber,
    findings,
    findingsCount: findings.length,
    criticalCount,
    highCount,
    passed,
    totalCostUsd: cost.totalCostUsd,
  });
};

// ============================================================================
// Execution + Registration
// ============================================================================

/** Execute the security scanner through the full governance pipeline. */
export const executeSecurityScanner = async (
  contract: AgentContract,
  context: AgentContext,
  input: SecurityScannerInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'read_code',
    `PR #${input.prNumber}`,
    `Security scan PR #${input.prNumber}`,
    securityScannerWork,
  );
};

/** Register the security scanner to respond to PRCreated events. */
export const registerSecurityScanner = (
  eventBus: EventBus,
  context: AgentContext,
  contract: AgentContract = SECURITY_SCANNER_CONTRACT,
): void => {
  eventBus.subscribe('PRCreated', (event) => {
    void context.eventBus.publish({
      type: 'AgentStarted',
      agentId: contract.role,
      taskId: event.taskId,
      source: `agent:${contract.role}`,
      timestamp: Date.now(),
    });
  });
};

// ============================================================================
// Fallback prompt (used when stack prompt file is not found)
// ============================================================================

const FALLBACK_SECURITY_PROMPT = `You are a security scanner agent. Analyze the PR diff for security vulnerabilities.

Scan for:
- SQL injection
- XSS (stored, reflected, DOM-based)
- Authentication/authorization bypass
- Hardcoded secrets (API keys, passwords, tokens)
- Insecure dependencies
- Missing input validation
- CSRF vulnerabilities
- Insecure direct object references (IDOR)
- Error messages leaking internal details
- Missing rate limiting

Return findings as JSON:
\`\`\`json
{
  "findings": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "critical|high|medium|low",
      "category": "sql_injection|xss|auth_bypass|...",
      "description": "What the issue is",
      "suggestedFix": "How to fix it"
    }
  ]
}
\`\`\`

If no issues found, return: \`\`\`json { "findings": [] } \`\`\``;
