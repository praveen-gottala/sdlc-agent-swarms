import { uxResearcherWork, UX_RESEARCHER_CONTRACT } from './ux-researcher.js';
import type { AgentContext, LLMProviderRef } from '@agentforge/core';
import { Ok } from '@agentforge/core';

// ============================================================================
// Helpers
// ============================================================================

const RESEARCH_OUTPUT = JSON.stringify({
  layoutSuggestions: [
    'Use a single-column layout for mobile-first',
    'Place primary CTA above the fold',
  ],
  userFlows: ['Landing → Sign Up → Dashboard'],
  accessibilityNotes: ['Ensure 4.5:1 contrast ratio'],
});

const makeProvider = (output: string = RESEARCH_OUTPUT): LLMProviderRef => ({
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

describe('uxResearcherWork', () => {
  it('produces layout suggestions from LLM output', async () => {
    const ctx = makeContext();
    const provider = makeProvider();

    const result = await uxResearcherWork(
      { pageId: 'page-1', taskId: 'task_001', description: 'User profile dashboard' },
      provider,
      [],
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.layoutSuggestions).toHaveLength(2);
      expect(result.value.layoutSuggestions[0]).toContain('single-column');
    }
  });

  it('includes user flows and accessibility notes', async () => {
    const ctx = makeContext();
    const provider = makeProvider();

    const result = await uxResearcherWork(
      { pageId: 'page-1', taskId: 'task_001', description: 'Landing page' },
      provider,
      [],
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.userFlows).toHaveLength(1);
      expect(result.value.accessibilityNotes).toHaveLength(1);
    }
  });

  it('handles JSON wrapped in code blocks', async () => {
    const ctx = makeContext();
    const wrappedOutput = '```json\n' + RESEARCH_OUTPUT + '\n```';
    const provider = makeProvider(wrappedOutput);

    const result = await uxResearcherWork(
      { pageId: 'page-1', taskId: 'task_001', description: 'Test page' },
      provider,
      [],
      ctx,
    );

    expect(result.ok).toBe(true);
  });

  it('returns error on malformed LLM output', async () => {
    const ctx = makeContext();
    const provider = makeProvider('not json at all');

    const result = await uxResearcherWork(
      { pageId: 'page-1', taskId: 'task_001', description: 'Test page' },
      provider,
      [],
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_MALFORMED_OUTPUT');
    }
  });
});

describe('UX_RESEARCHER_CONTRACT', () => {
  it('has correct role and category', () => {
    expect(UX_RESEARCHER_CONTRACT.role).toBe('ux_researcher');
    expect(UX_RESEARCHER_CONTRACT.category).toBe('design');
  });

  it('uses notify_only HITL policy', () => {
    expect(UX_RESEARCHER_CONTRACT.hitl_policy).toBe('notify_only');
  });

  it('has read permissions', () => {
    expect(UX_RESEARCHER_CONTRACT.permissions).toContain('read_spec');
    expect(UX_RESEARCHER_CONTRACT.permissions).toContain('read_design');
  });
});
