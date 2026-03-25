/**
 * @module e2e-cost-dashboard
 *
 * End-to-end integration test for the 5-agent UX pipeline running against
 * the Cost Dashboard module. Uses real LLM calls to validate that each
 * agent produces structurally correct output that feeds into the next.
 *
 * Skipped by default. Enable with:
 *   RUN_E2E_PROOF=true ANTHROPIC_API_KEY=sk-ant-... npx jest \
 *     --config packages/agents-ux/jest.config.cjs \
 *     --testPathPattern="__integration__/e2e-cost-dashboard" \
 *     --verbose --testTimeout=600000
 *
 * Estimated cost: ~$1-3 in API tokens per full run.
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';

// Load .env from repo root before reading env vars
dotenvConfig({ path: resolve(__dirname, '../../../../.env') });

import type {
  AgentContext,
  MCPClient,
  FileSystem,
  LLMProviderRef,
  DesignTokensSpec,
} from '@agentforge/core';
import { Ok, Err, createEventBus } from '@agentforge/core';
import { stringify } from 'yaml';
import { createClaudeProvider } from '@agentforge/providers';
import type {
  UXResearchInput,
  UXResearchOutput,
  UXPlanningInput,
  UXPlanningOutput,
  UXImplementationInput,
  UXImplementationOutput,
  UXReviewInput,
  UXReviewOutput,
  UXTestingInput,
  UXTestingOutput,
} from '../index.js';
import {
  uxResearchWork,
  uxPlanningWork,
  uxImplementationWork,
  uxReviewWork,
  uxTestingWork,
} from '../index.js';

// ============================================================================
// Environment gate
// ============================================================================

const E2E_ENABLED = process.env.RUN_E2E_PROOF === 'true';
const API_KEY = process.env.ANTHROPIC_API_KEY ?? '';

const describeE2E = E2E_ENABLED ? describe : describe.skip;

// ============================================================================
// Test input
// ============================================================================

const COST_E2E_TOKENS: DesignTokensSpec = {
  version: '1.0',
  created_by: 'e2e-cost-dashboard',
  colors: {
    primitive: { ink: '#0f172a', surface: '#f8fafc', accent: '#2563eb' },
    semantic: { 'background-primary': 'surface', 'text-primary': 'ink', 'cta-primary': 'accent' },
  },
  typography: {
    font_families: { display: 'Inter', body: 'Inter' },
    scale: [
      { role: 'heading-1', size: 24, weight: 600, family: 'display' },
      { role: 'body', size: 14, weight: 400, family: 'body' },
    ],
  },
  spacing: { unit: 8, scale: [4, 8, 16, 24] },
  borders: { radius: { small: 6, medium: 8 } },
  touch_targets: { minimum_height: 44, minimum_width: 44 },
  elevation: {
    levels: [
      { level: 0, shadow: 'none', description: 'Flat' },
      { level: 1, shadow: '0 1px 2px rgba(0,0,0,0.06)', description: 'Card' },
    ],
  },
  layout: {
    grid: { columns: 12, gutter: 24, margin: 24 },
    content_max_width: 1280,
    breakpoints: { mobile: 640, tablet: 768, desktop: 1024, wide: 1440 },
  },
  z_index: { dropdown: 1000, sticky: 1100, modal: 1200, toast: 1300, tooltip: 1400 },
};

const COST_DASHBOARD_INPUT: UXResearchInput = {
  moduleId: 'cost-dashboard',
  taskId: 'e2e-proof-001',
  designTokensSpec: COST_E2E_TOKENS,
  prdRequirements: [
    'Display real-time cost breakdown by agent, phase, and provider',
    'Show budget utilization gauges with configurable thresholds (warning at 80%, critical at 95%)',
    'Render a cost-over-time line chart with daily/weekly/monthly granularity toggle',
    'Provide a sortable table of recent cost records with agent, model, tokens, and USD columns',
    'Support dark mode and WCAG 2.1 AA contrast ratios across all chart elements',
    'Export cost data as CSV or JSON from the table view',
  ],
};

// ============================================================================
// Mock factories
// ============================================================================

/** Mock FileSystem that returns empty specs (no spec dir exists). */
const createMockFs = (): FileSystem => ({
  readFile: () => Err({ code: 'INVALID_STATE' as const, message: 'mock fs: no file', recoverable: false }),
  writeFile: () => Ok(undefined),
  writeFileAtomic: () => Ok(undefined),
  exists: () => false,
  mkdir: () => Ok(undefined),
  rename: () => Ok(undefined),
  remove: () => Ok(undefined),
  listDir: () => Ok([]),
  appendFile: () => Ok(undefined),
});

const createMockFsWithDesignTokens = (projectRoot: string, tokens: DesignTokensSpec): FileSystem => {
  const specDir = `${projectRoot}/agentforge/spec`;
  const tokensPath = `${specDir}/design-tokens.yaml`;
  const base = createMockFs();
  return {
    ...base,
    exists: (p: string) => p === specDir || p === tokensPath,
    readFile: (p: string) =>
      p === tokensPath ? Ok(stringify(tokens)) : base.readFile(p),
  };
};

/** Mock MCPClient — returns Ok({}) for all tool calls (ADR-024 fallback). */
const createMockMCPClient = (): MCPClient => ({
  callTool: async () => Ok({}),
  listTools: async () => Ok([]),
  isAvailable: async () => true,
});

/** Mock governance — always proceed. */
const createMockGovernance = () => async () =>
  Ok({ status: 'proceed' as const });

/** Create a mock AgentContext for E2E testing. */
const createMockContext = (): AgentContext => ({
  taskId: 'e2e-proof-001',
  projectRoot: '/tmp/agentforge-e2e',
  eventBus: createEventBus(),
  fs: createMockFsWithDesignTokens('/tmp/agentforge-e2e', COST_E2E_TOKENS),
  mcpClient: createMockMCPClient(),
  runGovernance: createMockGovernance(),
  resolveProvider: () => Err({ code: 'MCP_UNAVAILABLE' as const, message: 'mock', recoverable: false }),
  recordAudit: () => {},
});

// ============================================================================
// Pipeline runner
// ============================================================================

interface PipelineResults {
  research?: UXResearchOutput;
  planning?: UXPlanningOutput;
  implementation?: UXImplementationOutput;
  review?: UXReviewOutput;
  testing?: UXTestingOutput;
  errors: string[];
  timings: Record<string, number>;
}

const runUXPipeline = async (): Promise<PipelineResults> => {
  const results: PipelineResults = { errors: [], timings: {} };
  const context = createMockContext();

  // Providers: Opus for research, Sonnet for the rest
  const opusProvider = createClaudeProvider('claude-opus-4-6', { apiKey: API_KEY });
  const sonnetProvider = createClaudeProvider('claude-sonnet-4-6', { apiKey: API_KEY });

  // Stage 1: Research
  const t1 = Date.now();
  const researchResult = await uxResearchWork(
    COST_DASHBOARD_INPUT,
    opusProvider as unknown as LLMProviderRef,
    [],
    context,
  );
  results.timings.research = Date.now() - t1;

  if (!researchResult.ok) {
    results.errors.push(`Research: ${researchResult.error.message}`);
    return results;
  }
  results.research = researchResult.value;

  // Stage 2: Planning
  const planningInput: UXPlanningInput = {
    briefId: results.research.briefId,
    moduleId: 'cost-dashboard',
    taskId: 'e2e-proof-001',
    designBrief: results.research,
  };

  const t2 = Date.now();
  const planningResult = await uxPlanningWork(
    planningInput,
    sonnetProvider as unknown as LLMProviderRef,
    [],
    context,
  );
  results.timings.planning = Date.now() - t2;

  if (!planningResult.ok) {
    results.errors.push(`Planning: ${planningResult.error.message}`);
    return results;
  }
  results.planning = planningResult.value;

  // Stage 3: Implementation (layout stage)
  const implInput: UXImplementationInput = {
    specRef: results.planning.specRef,
    moduleId: 'cost-dashboard',
    taskId: 'e2e-proof-001',
    componentSpec: results.planning,
    stage: 'layout',
  };

  const t3 = Date.now();
  const implResult = await uxImplementationWork(
    implInput,
    sonnetProvider as unknown as LLMProviderRef,
    [],
    context,
  );
  results.timings.implementation = Date.now() - t3;

  if (!implResult.ok) {
    results.errors.push(`Implementation: ${implResult.error.message}`);
    return results;
  }
  results.implementation = implResult.value;

  // Stage 4: Review (mock MCP — best-effort LLM output)
  const componentPaths = results.implementation.files.map((f) => f.filePath);
  const reviewInput: UXReviewInput = {
    taskId: 'e2e-proof-001',
    branch: 'e2e-proof/cost-dashboard',
    componentPaths,
    moduleId: 'cost-dashboard',
  };

  const t4 = Date.now();
  const reviewResult = await uxReviewWork(
    reviewInput,
    sonnetProvider as unknown as LLMProviderRef,
    [],
    context,
  );
  results.timings.review = Date.now() - t4;

  if (!reviewResult.ok) {
    results.errors.push(`Review: ${reviewResult.error.message}`);
    return results;
  }
  results.review = reviewResult.value;

  // Stage 5: Testing (mock MCP — best-effort LLM output)
  const testingInput: UXTestingInput = {
    taskId: 'e2e-proof-001',
    branch: 'e2e-proof/cost-dashboard',
    componentPaths,
    moduleId: 'cost-dashboard',
  };

  const t5 = Date.now();
  const testingResult = await uxTestingWork(
    testingInput,
    sonnetProvider as unknown as LLMProviderRef,
    [],
    context,
  );
  results.timings.testing = Date.now() - t5;

  if (!testingResult.ok) {
    results.errors.push(`Testing: ${testingResult.error.message}`);
    return results;
  }
  results.testing = testingResult.value;

  return results;
};

// ============================================================================
// Tests
// ============================================================================

describeE2E('E2E Cost Dashboard Pipeline', () => {
  let pipelineResults: PipelineResults;

  beforeAll(async () => {
    if (!API_KEY) {
      throw new Error('ANTHROPIC_API_KEY must be set when RUN_E2E_PROOF=true');
    }
    pipelineResults = await runUXPipeline();
  }, 600_000); // 10 min global timeout

  // --------------------------------------------------------------------------
  // Stage 1: Research
  // --------------------------------------------------------------------------
  it('Stage 1 — Research produces a valid design brief', () => {
    expect(pipelineResults.errors.filter((e) => e.startsWith('Research'))).toHaveLength(0);
    const r = pipelineResults.research;
    expect(r).toBeDefined();
    if (!r) return;

    expect(r.briefId).toBeTruthy();
    expect(r.moduleId).toBe('cost-dashboard');
    expect(r.requirementIds.length).toBeGreaterThanOrEqual(3);
    expect(r.designConstraints.length).toBeGreaterThanOrEqual(3);
    expect(
      r.accessibilityRequirements.some((a) => /contrast|screen.reader/i.test(a)),
    ).toBe(true);
    expect(
      r.dataModelDependencies.some((d) => /cost|CostRecord/i.test(d)),
    ).toBe(true);
  }, 300_000);

  // --------------------------------------------------------------------------
  // Stage 2: Planning
  // --------------------------------------------------------------------------
  it('Stage 2 — Planning produces a component spec', () => {
    expect(pipelineResults.errors.filter((e) => e.startsWith('Planning'))).toHaveLength(0);
    const p = pipelineResults.planning;
    expect(p).toBeDefined();
    if (!p) return;

    // componentTree may have a single root with nested children — count total nodes
    const countNodes = (nodes: readonly { children?: readonly unknown[] }[]): number =>
      nodes.reduce((sum, n) => sum + 1 + countNodes((n.children ?? []) as typeof nodes), 0);
    expect(countNodes(p.componentTree)).toBeGreaterThanOrEqual(3);
    expect(Object.keys(p.tokenBindings).length).toBeGreaterThanOrEqual(5);
    expect(p.responsiveRules.length).toBeGreaterThanOrEqual(2);
    expect(p.implementationStages.length).toBe(4);

    const stageValues = p.implementationStages.map((s) => s.stage);
    expect(stageValues).toContain('layout');
    expect(stageValues).toContain('theme');
    expect(stageValues).toContain('animation');
    expect(stageValues).toContain('implementation');
  }, 300_000);

  // --------------------------------------------------------------------------
  // Stage 3: Implementation (layout)
  // --------------------------------------------------------------------------
  it('Stage 3 — Implementation generates code files', () => {
    expect(pipelineResults.errors.filter((e) => e.startsWith('Implementation'))).toHaveLength(0);
    const impl = pipelineResults.implementation;
    expect(impl).toBeDefined();
    if (!impl) return;

    expect(impl.files.length).toBeGreaterThanOrEqual(1);
    expect(impl.stage).toBe('layout');

    const allCode = impl.files.map((f) => f.content).join('\n');
    expect(allCode).toMatch(/import/); // React imports
    expect(allCode).toMatch(/className=/); // Tailwind classes
    expect(allCode).toMatch(/aria-/); // Accessibility attributes
  }, 300_000);

  // --------------------------------------------------------------------------
  // Stage 4: Review (mock MCP)
  // --------------------------------------------------------------------------
  it('Stage 4 — Review produces review output', () => {
    expect(pipelineResults.errors.filter((e) => e.startsWith('Review'))).toHaveLength(0);
    const rev = pipelineResults.review;
    expect(rev).toBeDefined();
    if (!rev) return;

    expect(rev.reviewId).toBeTruthy();
    expect(Array.isArray(rev.issues)).toBe(true);
    expect(typeof rev.passedAccessibility).toBe('boolean');
    expect(typeof rev.passedDesignSystem).toBe('boolean');
    expect(typeof rev.passedVisualFidelity).toBe('boolean');
    expect(typeof rev.overallPassed).toBe('boolean');
  }, 300_000);

  // --------------------------------------------------------------------------
  // Stage 5: Testing (mock MCP)
  // --------------------------------------------------------------------------
  it('Stage 5 — Testing produces test output', () => {
    expect(pipelineResults.errors.filter((e) => e.startsWith('Testing'))).toHaveLength(0);
    const t = pipelineResults.testing;
    expect(t).toBeDefined();
    if (!t) return;

    expect(t.testFilePaths.length).toBeGreaterThanOrEqual(1);
    expect(typeof t.passCount).toBe('number');
    expect(t.passCount).toBeGreaterThanOrEqual(0);
    expect(typeof t.failCount).toBe('number');
    expect(t.failCount).toBeGreaterThanOrEqual(0);
    expect(typeof t.healedCount).toBe('number');
    expect(t.healedCount).toBeGreaterThanOrEqual(0);
  }, 300_000);

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  afterAll(() => {
    if (!pipelineResults) {
      console.log('\n[e2e] Pipeline did not run (beforeAll failed). Skipping summary.');
      return;
    }

    console.log('\n' + '='.repeat(72));
    console.log('  E2E PROOF RESULTS — Cost Dashboard Module');
    console.log('='.repeat(72));

    const r = pipelineResults;

    const rows: string[][] = [
      ['Stage', 'Status', 'Time (s)', 'Key Metrics'],
      ['─────', '──────', '────────', '───────────'],
    ];

    // Research: add dataDeps (first 3 dataModelDependencies)
    rows.push([
      'Research',
      r.research ? 'PASS' : 'FAIL',
      ((r.timings.research ?? 0) / 1000).toFixed(1),
      r.research
        ? `reqs=${r.research.requirementIds.length}, constraints=${r.research.designConstraints.length}, a11y=${r.research.accessibilityRequirements.length}, dataDeps=[${r.research.dataModelDependencies.slice(0, 3).join(', ')}]`
        : r.errors.find((e) => e.startsWith('Research')) ?? 'unknown error',
    ]);

    // Planning: add responsive rules count and all 4 stage values
    rows.push([
      'Planning',
      r.planning ? 'PASS' : 'FAIL',
      ((r.timings.planning ?? 0) / 1000).toFixed(1),
      r.planning
        ? `components=${r.planning.componentTree.length}, tokens=${Object.keys(r.planning.tokenBindings).length}, responsive=${r.planning.responsiveRules.length}, stages=[${r.planning.implementationStages.map((s) => s.stage).join(',')}]`
        : r.errors.find((e) => e.startsWith('Planning')) ?? 'unknown error',
    ]);

    // Implementation: add lines of code count
    const loc = r.implementation
      ? r.implementation.files.reduce((sum, f) => sum + f.content.split('\n').length, 0)
      : 0;
    rows.push([
      'Implementation',
      r.implementation ? 'PASS' : 'FAIL',
      ((r.timings.implementation ?? 0) / 1000).toFixed(1),
      r.implementation
        ? `files=${r.implementation.files.length}, stage=${r.implementation.stage}, loc=${loc}, cost=$${r.implementation.totalCostUsd.toFixed(4)}`
        : r.errors.find((e) => e.startsWith('Implementation')) ?? 'unknown error',
    ]);

    // Review: add visualFidelity pass flag
    rows.push([
      'Review*',
      r.review ? 'PASS' : 'FAIL',
      ((r.timings.review ?? 0) / 1000).toFixed(1),
      r.review
        ? `issues=${r.review.issues.length}, a11y=${r.review.passedAccessibility}, designSys=${r.review.passedDesignSystem}, visual=${r.review.passedVisualFidelity}, overall=${r.review.overallPassed}`
        : r.errors.find((e) => e.startsWith('Review')) ?? 'unknown error',
    ]);

    rows.push([
      'Testing*',
      r.testing ? 'PASS' : 'FAIL',
      ((r.timings.testing ?? 0) / 1000).toFixed(1),
      r.testing
        ? `testFiles=${r.testing.testFilePaths.length}, pass=${r.testing.passCount}, fail=${r.testing.failCount}, healed=${r.testing.healedCount}`
        : r.errors.find((e) => e.startsWith('Testing')) ?? 'unknown error',
    ]);

    // Print as aligned table
    const colWidths = rows[0].map((_, ci) =>
      Math.max(...rows.map((row) => (row[ci] ?? '').length)),
    );
    for (const row of rows) {
      console.log(
        '  ' + row.map((cell, ci) => cell.padEnd(colWidths[ci])).join('  '),
      );
    }

    const totalTime = Object.values(r.timings).reduce((a, b) => a + b, 0);
    const estimatedCost = r.implementation ? r.implementation.totalCostUsd : 0;
    console.log(`\n  Total time: ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`  Estimated API cost (implementation stage): $${estimatedCost.toFixed(4)}`);
    console.log('  * Review/Testing ran with mock MCP (best-effort LLM output)');

    if (r.errors.length > 0) {
      console.log(`\n  ERRORS (${r.errors.length}):`);
      for (const err of r.errors) {
        console.log(`    - ${err}`);
      }
    }

    console.log('='.repeat(72) + '\n');
  });
});

// ============================================================================
// Skip guard (always runs)
// ============================================================================

describe('E2E Cost Dashboard (skip guard)', () => {
  it('e2e tests are skipped when RUN_E2E_PROOF is not set', () => {
    if (E2E_ENABLED) {
      console.log('[e2e] RUN_E2E_PROOF=true — e2e pipeline tests are running');
    } else {
      console.log('[e2e] RUN_E2E_PROOF not set — e2e pipeline tests skipped (expected)');
    }
    expect(true).toBe(true);
  });
});
