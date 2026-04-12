import {
  UX_REVIEW_CONTRACT,
  parseReviewOutput,
  registerUXReview,
  uxReviewWork,
} from './ux-review.js';
import type { AgentContext, LLMProviderRef } from '@agentforge/core';
import { Ok, Err, DEFAULT_MODEL } from '@agentforge/core';

// ============================================================================
// Helpers
// ============================================================================

const REVIEW_OUTPUT = JSON.stringify({
  reviewId: 'review-mod-001-1234',
  issues: [
    {
      severity: 'minor',
      category: 'visual_fidelity',
      description: 'Card shadow slightly darker',
      fix: 'Adjust box-shadow opacity',
    },
    {
      severity: 'critical',
      category: 'accessibility',
      description: 'Missing alt text on chart',
      fix: 'Add alt attributes',
    },
    {
      severity: 'major',
      category: 'design_system',
      description: 'Hardcoded color',
      fix: 'Use design token',
    },
  ],
});

const REVIEW_OUTPUT_NO_CRITICAL = JSON.stringify({
  reviewId: 'review-mod-002-5678',
  issues: [
    {
      severity: 'minor',
      category: 'accessibility',
      description: 'Minor contrast issue',
      fix: 'Adjust contrast',
    },
    {
      severity: 'major',
      category: 'design_system',
      description: 'Non-standard spacing',
      fix: 'Use spacing token',
    },
    {
      severity: 'minor',
      category: 'visual_fidelity',
      description: 'Slight misalignment',
      fix: 'Adjust margin',
    },
  ],
});

const makeProvider = (output: string = REVIEW_OUTPUT): LLMProviderRef => ({
  name: 'test-provider',
  complete: jest.fn().mockResolvedValue(Ok({ content: output })),
  stream: jest.fn(),
  estimateCost: jest.fn().mockReturnValue({
    estimatedInputTokens: 1000,
    estimatedOutputTokens: 500,
    estimatedCostUsd: 0.01,
    confidence: 'medium' as const,
  }),
});

const makeContext = (): AgentContext => ({
  taskId: 'task_001',
  projectRoot: '/tmp/test-project',
  eventBus: { publish: jest.fn(), emit: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn(), clear: jest.fn(), history: jest.fn().mockReturnValue([]) },
  fs: {
    readFile: jest.fn().mockReturnValue(Ok('pages: []')),
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
    callTool: jest.fn().mockResolvedValue(Ok({})),
    listTools: jest.fn().mockResolvedValue(Ok([])),
    isAvailable: jest.fn().mockResolvedValue(true),
  },
  runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'proceed' })),
  resolveProvider: jest.fn().mockReturnValue(Ok(makeProvider())),
  recordAudit: jest.fn(),
});

// ============================================================================
// Tests
// ============================================================================

describe('UX_REVIEW_CONTRACT', () => {
  it('contract has all required AgentContract fields', () => {
    expect(UX_REVIEW_CONTRACT.role).toBe('ux_review');
    expect(UX_REVIEW_CONTRACT.category).toBe('design');
    expect(UX_REVIEW_CONTRACT.provider).toBe(DEFAULT_MODEL);
    expect(UX_REVIEW_CONTRACT.tools).toEqual(['playwright:snapshot', 'playwright:screenshot']);
    expect(UX_REVIEW_CONTRACT.permissions).toEqual(['read_spec', 'read_design', 'read_code', 'read_design_system']);
    expect(UX_REVIEW_CONTRACT.denied).toEqual(['write_code', 'write_design', 'create_branch', 'merge_pr']);
    expect(UX_REVIEW_CONTRACT.budget).toEqual({ max_tokens_per_task: 40000, max_cost_per_task_usd: 1.5 });
    expect(UX_REVIEW_CONTRACT.execution).toEqual({ mode: 'complete', progress_events: true, max_context_tokens: 40000 });
    expect(UX_REVIEW_CONTRACT.hitl_policy).toBe('notify_only');
    expect(UX_REVIEW_CONTRACT.on_complete).toBe('UXReviewCompleted');
  });

  it('contract on_complete matches UXReviewCompleted event', () => {
    expect(UX_REVIEW_CONTRACT.on_complete).toBe('UXReviewCompleted');
  });
});

describe('parseReviewOutput', () => {
  it('handles valid JSON', () => {
    const result = parseReviewOutput(REVIEW_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.reviewId).toBe('review-mod-001-1234');
      expect(result.value.issues).toHaveLength(3);
    }
  });

  it('handles JSON in code fences', () => {
    const wrappedOutput = '```json\n' + REVIEW_OUTPUT + '\n```';
    const result = parseReviewOutput(wrappedOutput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.reviewId).toBe('review-mod-001-1234');
      expect(result.value.issues).toHaveLength(3);
    }
  });

  it('returns Err for malformed JSON', () => {
    const result = parseReviewOutput('not json at all');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_MALFORMED_OUTPUT');
    }
  });
});

describe('registerUXReview', () => {
  it('subscribes to ImplementationDraftReady', () => {
    const ctx = makeContext();
    const mockEventBus = {
      publish: jest.fn(),
      emit: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      clear: jest.fn(),
      history: jest.fn().mockReturnValue([]),
    };

    registerUXReview(mockEventBus, ctx);

    expect(mockEventBus.subscribe).toHaveBeenCalledTimes(1);
    expect(mockEventBus.subscribe).toHaveBeenCalledWith(
      'ImplementationDraftReady',
      expect.any(Function),
    );
  });
});

// ============================================================================
// Disk-first design system compliance
// ============================================================================

const DISK_TOKENS_YAML = `version: "1.0"
created_by: test
colors:
  primitive:
    cream: "#FFF8E7"
    teal: "#0F6E56"
  semantic:
    background-primary: cream
    cta-primary: teal
typography:
  font_families:
    display: Inter
    body: Inter
  scale:
    - role: heading-1
      size: 32
      weight: 700
      family: display
spacing:
  unit: 8
  scale: [4, 8, 16, 24, 32]
borders:
  radius:
    small: 8
    medium: 12
touch_targets:
  minimum_height: 44
  minimum_width: 44`;

const COMPLIANCE_ISSUES_JSON = JSON.stringify([
  { severity: 'minor', category: 'design_system', description: 'Hardcoded color', fix: 'Use token' },
]);

describe('uxReviewWork — disk-first compliance', () => {
  it('uses disk tokens for design-system compliance, no Figma MCP call', async () => {
    const provider = makeProvider(`\`\`\`json\n${COMPLIANCE_ISSUES_JSON}\n\`\`\``);
    const ctx = makeContext();

    // Disk tokens available
    (ctx.fs.readFile as jest.Mock).mockImplementation((path: string) => {
      if (path.includes('design-tokens.yaml')) {
        return Ok(DISK_TOKENS_YAML);
      }
      return { ok: false, error: { code: 'INVALID_STATE', message: 'not found', recoverable: false } };
    });
    (ctx.fs.exists as jest.Mock).mockImplementation((path: string) => {
      return path.includes('design-tokens.yaml');
    });

    // MCP calls for playwright succeed, but figma should NOT be called
    (ctx.mcpClient!.callTool as jest.Mock).mockImplementation((ns: string, tool: string) => {
      if (ns === 'playwright') return Promise.resolve(Ok({ snapshot: 'data' }));
      // If figma is called, fail the test explicitly
      return Promise.resolve(Err({ code: 'NOT_FOUND', message: 'Should not call Figma', recoverable: false }));
    });

    const input = {
      taskId: 'task-001',
      branch: 'feat/mod-001',
      componentPaths: ['src/components/Dashboard.tsx'],
      moduleId: 'mod-001',
    };

    const result = await uxReviewWork(
      input,
      provider as unknown as LLMProviderRef,
      [],
      ctx,
    );

    expect(result.ok).toBe(true);

    // Verify no Figma MCP calls were made
    const mcpCalls = (ctx.mcpClient!.callTool as jest.Mock).mock.calls;
    const figmaCalls = mcpCalls.filter((call: string[]) => call[0] === 'figma');
    expect(figmaCalls).toHaveLength(0);
  });

  it('returns Err when design-tokens.yaml is missing', async () => {
    const provider = makeProvider(`\`\`\`json\n${COMPLIANCE_ISSUES_JSON}\n\`\`\``);
    const ctx = makeContext();

    (ctx.fs.readFile as jest.Mock).mockReturnValue({ ok: false, error: { code: 'INVALID_STATE', message: 'not found', recoverable: false } });
    (ctx.fs.exists as jest.Mock).mockReturnValue(false);

    const errSpy = jest.spyOn(console, 'error').mockImplementation();

    const input = {
      taskId: 'task-001',
      branch: 'feat/mod-001',
      componentPaths: ['src/components/Dashboard.tsx'],
      moduleId: 'mod-001',
    };

    const result = await uxReviewWork(
      input,
      provider as unknown as LLMProviderRef,
      [],
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DEPENDENCY_NOT_FOUND');
      expect(result.error.recoverable).toBe(false);
    }
    expect(ctx.mcpClient!.callTool).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('review synthesis logic', () => {
  it('overallPassed is false when any critical issue exists', () => {
    const result = parseReviewOutput(REVIEW_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.overallPassed).toBe(false);
      expect(result.value.passedAccessibility).toBe(false);
      expect(result.value.passedDesignSystem).toBe(true);
      expect(result.value.passedVisualFidelity).toBe(true);
    }
  });

  it('overallPassed is true when only minor/major issues exist', () => {
    const result = parseReviewOutput(REVIEW_OUTPUT_NO_CRITICAL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.overallPassed).toBe(true);
      expect(result.value.passedAccessibility).toBe(true);
      expect(result.value.passedDesignSystem).toBe(true);
      expect(result.value.passedVisualFidelity).toBe(true);
    }
  });

  it('issues are sorted by severity (critical → major → minor)', () => {
    const result = parseReviewOutput(REVIEW_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const severities = result.value.issues.map((i) => i.severity);
      expect(severities).toEqual(['critical', 'major', 'minor']);
    }
  });
});
