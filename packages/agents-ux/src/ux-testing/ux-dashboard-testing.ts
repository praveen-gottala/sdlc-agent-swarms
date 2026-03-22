/**
 * @module @agentforge/agents-ux/ux-dashboard-testing
 *
 * UX Dashboard Testing agent: generates Playwright tests using a 3-stage
 * sequential LLM pipeline (Plan → Generate → Heal) for implementation drafts,
 * running in parallel with the Review agent after ImplementationDraftReady.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AgentContract,
  AgentContext,
  AgentWorkFn,
  LLMProviderRef,
  Result,
  EventBus,
  ImplementationDraftReady,
} from '@agentforge/core';
import {
  Ok,
  Err,
  runAgent,
} from '@agentforge/core';

// ============================================================================
// Types
// ============================================================================

/** Input for the UX dashboard testing agent. */
export interface UXDashboardTestingInput {
  readonly taskId: string;
  readonly branch: string;
  readonly componentPaths: readonly string[];
  readonly moduleId: string;
}

/** Output produced by the UX dashboard testing agent. */
export interface UXDashboardTestingOutput {
  readonly testRunId: string;
  readonly testFilePaths: readonly string[];
  readonly passCount: number;
  readonly failCount: number;
  readonly healedCount: number;
  readonly fixInstructions?: string;
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the UX dashboard testing agent. */
export const UX_DASHBOARD_TESTING_CONTRACT: AgentContract = {
  role: 'ux_dashboard_testing',
  description: 'Generates Playwright tests via a 3-stage Plan → Generate → Heal pipeline',
  category: 'code',
  provider: 'claude-sonnet-4',
  execution: { mode: 'complete', progress_events: true, max_context_tokens: 40000 },
  tools: ['playwright:snapshot', 'playwright:screenshot', 'fs:read'],
  permissions: ['read_spec', 'read_design', 'read_code', 'write_test'],
  denied: ['write_code', 'write_design', 'create_branch', 'merge_pr'],
  hitl_policy: 'notify_only',
  budget: { max_tokens_per_task: 50000, max_cost_per_task_usd: 2.0 },
  on_complete: 'UXTestSuiteCompleted',
  on_error: 'retry(max=2) then notify_human + pause',
  context: {},
};

// ============================================================================
// System prompt
// ============================================================================

let systemPromptCache: string | undefined;

const loadSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-dashboard-testing-system.md');
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

// ============================================================================
// JSON extraction helper
// ============================================================================

/**
 * Extract JSON from LLM output, handling nested backticks in file content.
 * Tries multiple strategies:
 * 1. Find outermost ```json ... ``` block (greedy to handle nested backticks)
 * 2. Find first { or [ and match to the last } or ] (brace-balanced extraction)
 * 3. Fall back to raw trimmed output
 */
const extractJsonFromLLMOutput = (output: string): string => {
  // Strategy 1: Greedy code-fence extraction — match from first ```json to LAST ```
  // This handles cases where file content contains ``` inside the JSON.
  const fenceStart = output.indexOf('```json');
  if (fenceStart !== -1) {
    const contentStart = output.indexOf('\n', fenceStart);
    if (contentStart !== -1) {
      const fenceEnd = output.lastIndexOf('```');
      if (fenceEnd > contentStart) {
        return output.slice(contentStart + 1, fenceEnd).trim();
      }
    }
  }

  // Strategy 2: Find first { or [ and extract to matching last } or ]
  const firstBrace = output.indexOf('{');
  const firstBracket = output.indexOf('[');
  const jsonStart = firstBrace === -1 ? firstBracket
    : firstBracket === -1 ? firstBrace
    : Math.min(firstBrace, firstBracket);

  if (jsonStart !== -1) {
    const isArray = output[jsonStart] === '[';
    const closer = isArray ? ']' : '}';
    const lastClose = output.lastIndexOf(closer);
    if (lastClose > jsonStart) {
      return output.slice(jsonStart, lastClose + 1);
    }
  }

  // Strategy 3: raw output
  return output.trim();
};

// ============================================================================
// Test file parsers (for generate stage output)
// ============================================================================

/**
 * Parse a JSON string into test file objects, accepting multiple JSON shapes.
 * Returns empty array on parse failure.
 */
const parseTestFiles = (jsonStr: string): { filePath: string; content: string }[] => {
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    // Accept: { testFiles: [...] }, { files: [...] }, { tests: [...] }, or top-level array
    const filesArray = Array.isArray(parsed)
      ? (parsed as Record<string, unknown>[])
      : ((parsed.testFiles ?? parsed.files ?? parsed.tests ?? []) as Record<string, unknown>[]);

    return (Array.isArray(filesArray) ? filesArray : [])
      .filter((f): f is Record<string, unknown> & { content: string } =>
        typeof f === 'object' && f !== null && typeof f.content === 'string')
      .map((f) => ({
        filePath: String(f.filePath ?? f.fileName ?? f.path ?? 'unknown-test.spec.ts'),
        content: String(f.content),
      }));
  } catch {
    return [];
  }
};

/**
 * Recover complete test file objects from truncated JSON output.
 * When the LLM hits maxTokens mid-JSON, the last file entry is incomplete.
 * This extracts all complete { "filePath": "...", "content": "..." } objects.
 */
const recoverTruncatedTestFiles = (raw: string): { filePath: string; content: string }[] => {
  const files: { filePath: string; content: string }[] = [];

  // Match complete file objects: { "filePath": "...", "content": "..." }
  // The content value is a JSON string with escaped chars, so we find each
  // "filePath" key and try to parse from that position.
  const filePathPattern = /"filePath"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"/g;
  let match: RegExpExecArray | null;

  while ((match = filePathPattern.exec(raw)) !== null) {
    const filePath = match[1];
    const contentStart = match.index + match[0].length;

    // Find the end of the content string — the closing unescaped quote
    let pos = contentStart;
    while (pos < raw.length) {
      if (raw[pos] === '\\') {
        pos += 2; // skip escaped char
        continue;
      }
      if (raw[pos] === '"') break;
      pos++;
    }

    if (pos < raw.length && raw[pos] === '"') {
      // Found complete content string
      const contentRaw = raw.slice(contentStart, pos);
      try {
        // Unescape JSON string escape sequences
        const content = JSON.parse(`"${contentRaw}"`) as string;
        files.push({ filePath, content });
      } catch {
        // Malformed escape sequence — skip this file
      }
    }
    // If pos >= raw.length, this file was truncated — skip it
  }

  return files;
};

// ============================================================================
// Output parser
// ============================================================================

/** Parse the LLM output as a UX dashboard testing JSON object. */
export const parseTestingOutput = (output: string): Result<UXDashboardTestingOutput> => {
  const jsonStr = extractJsonFromLLMOutput(output);

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    return Ok({
      testRunId: (parsed.testRunId as string) ?? '',
      testFilePaths: (parsed.testFilePaths as string[]) ?? [],
      passCount: (parsed.passCount as number) ?? 0,
      failCount: (parsed.failCount as number) ?? 0,
      healedCount: (parsed.healedCount as number) ?? 0,
      ...((parsed.fixInstructions as string) ? { fixInstructions: parsed.fixInstructions as string } : {}),
    });
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `Failed to parse UX dashboard testing output: ${jsonStr.slice(0, 200)}`,
      recoverable: true,
    });
  }
};

// ============================================================================
// LLM provider interface (private)
// ============================================================================

interface LLMProvider {
  complete: (prompt: { system: string; messages: { role: 'user'; content: string }[] }, opts: { model: string; maxTokens: number; temperature: number }) => Promise<Result<{ content: string }>>;
}

// ============================================================================
// Work function
// ============================================================================

/**
 * The UX dashboard testing agent's work function.
 * 3-stage sequential pipeline: Plan → Generate → Heal.
 */
export const uxDashboardTestingWork: AgentWorkFn<UXDashboardTestingInput, UXDashboardTestingOutput> = async (
  input: UXDashboardTestingInput,
  provider: LLMProviderRef,
  _learnings: unknown[],
  _context: AgentContext,
) => {
  const { moduleId, componentPaths } = input;
  const systemPrompt = loadSystemPrompt();
  const llm = provider as unknown as LLMProvider;

  // Stage 1: Plan — generate test plan (user flows, edge cases, breakpoints)
  const planResult = await llm.complete(
    {
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Create a test plan for the following components:\n${componentPaths.join('\n')}\n\nIdentify user flows, edge cases, and responsive breakpoints to test. Return a structured test plan as JSON.`,
      }],
    },
    { model: UX_DASHBOARD_TESTING_CONTRACT.provider, maxTokens: 4000, temperature: 0 },
  );

  if (!planResult.ok) {
    return Err({
      code: 'LLM_API_ERROR' as const,
      message: 'Test planning stage failed',
      recoverable: true,
    });
  }

  const testPlan = (planResult.value as { content: string }).content;

  // Stage 2: Generate — produce Playwright test files from the plan
  const generateResult = await llm.complete(
    {
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Based on this test plan:\n${testPlan}\n\nGenerate Playwright test files for the components. Keep tests concise — max 3 test files, each under 60 lines. Return JSON:\n\`\`\`json\n{ "testFiles": [{ "filePath": "...", "content": "..." }] }\n\`\`\`\n\nIMPORTANT: Complete the entire JSON. Close all strings, arrays, and braces.`,
      }],
    },
    { model: UX_DASHBOARD_TESTING_CONTRACT.provider, maxTokens: 16000, temperature: 0 },
  );

  if (!generateResult.ok) {
    return Err({
      code: 'LLM_API_ERROR' as const,
      message: 'Test generation stage failed',
      recoverable: true,
    });
  }

  const generateContent = (generateResult.value as { content: string }).content;

  // Parse generated test files — defensive extraction handling multiple JSON
  // shapes and code-fence edge cases (the LLM may nest backticks inside file
  // content, return different key names, or wrap files in an array).
  let testFiles: { filePath: string; content: string }[] = [];
  const genStr = extractJsonFromLLMOutput(generateContent);
  testFiles = parseTestFiles(genStr);

  // Truncation recovery: if JSON.parse failed (likely truncated output),
  // extract complete file objects using regex on the raw string.
  if (testFiles.length === 0) {
    testFiles = recoverTruncatedTestFiles(genStr);
  }

  if (testFiles.length === 0) {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `No test files found in LLM output: ${generateContent.slice(0, 200)}`,
      recoverable: true,
    });
  }

  // Stage 3: Heal — syntactic validation (Phase 1: no LLM call, basic checks)
  const issues: string[] = [];
  let healedCount = 0;

  for (const file of testFiles) {
    const hasTestCall = /test\s*\(/.test(file.content);
    const hasPlaywrightImport = /@playwright/.test(file.content);

    if (!hasTestCall) {
      issues.push(`${file.filePath}: missing test() call`);
    }
    if (!hasPlaywrightImport) {
      issues.push(`${file.filePath}: missing @playwright import`);
    }
  }

  const testRunId = `test-${moduleId}-${Date.now()}`;
  const testFilePaths = testFiles.map((f) => f.filePath);
  const failCount = issues.length;
  const passCount = testFiles.length - failCount;

  return Ok({
    testRunId,
    testFilePaths,
    passCount: Math.max(passCount, 0),
    failCount,
    healedCount,
    ...(issues.length > 0 ? { fixInstructions: issues.join('\n') } : {}),
  });
};

// ============================================================================
// Execution + Registration
// ============================================================================

/**
 * Execute the UX dashboard testing agent through the full governance pipeline.
 */
export const executeUXDashboardTesting = async (
  contract: AgentContract,
  context: AgentContext,
  input: UXDashboardTestingInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'read_code',
    `module:${input.moduleId}`,
    `UX dashboard testing for module: ${input.moduleId}`,
    uxDashboardTestingWork,
  );
};

/**
 * Register the UX dashboard testing agent to respond to ImplementationDraftReady events.
 */
export const registerUXDashboardTesting = (
  eventBus: EventBus,
  context: AgentContext,
  contract: AgentContract = UX_DASHBOARD_TESTING_CONTRACT,
): void => {
  eventBus.subscribe('ImplementationDraftReady', (event: ImplementationDraftReady) => {
    const input: UXDashboardTestingInput = {
      taskId: event.taskId,
      branch: event.branch,
      componentPaths: event.componentPaths,
      moduleId: event.moduleId,
    };
    void executeUXDashboardTesting(contract, context, input);
  });
};
