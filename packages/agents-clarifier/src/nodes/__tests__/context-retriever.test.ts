/**
 * Context Retriever node tests.
 * Scope: bootstrap catalog loading, evolution 5-tool retrieval,
 * error handling for missing tools, partial failure tolerance.
 */

import type { ClarifierDeps } from '../../deps.js';
import type { ClarifierState } from '../../types.js';
import type { RetrievalTools } from '@agentforge/retrieval';
import { Ok, Err } from '@agentforge/core';
import { createContextRetriever } from '../context-retriever.js';

jest.mock('node:fs', () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

jest.mock('@agentforge/core', () => {
  const actual = jest.requireActual('@agentforge/core');
  return {
    ...actual,
    loadBaseCatalog: jest.fn(() => ({
      version: '1.0',
      components: {
        Card: { description: 'Content container', category: 'layout' },
        Button: { description: 'Interactive button', category: 'action' },
      },
    })),
    debugLog: jest.fn(),
  };
});

const { existsSync, readFileSync } = jest.requireMock('node:fs') as {
  existsSync: jest.Mock;
  readFileSync: jest.Mock;
};

function makeState(overrides: Partial<ClarifierState> = {}): ClarifierState {
  return {
    rawInput: 'Build a personal expense tracker app',
    mode: 'bootstrap',
    context: {},
    gaps: [],
    questions: [],
    humanResponses: [],
    requirement: null,
    assumptions: null,
    round: 0,
    maxRounds: 3,
    error: null,
    prdDraft: null,
    featurePlan: null,
    criticRetries: 0,
    criticPassed: false,
    escalationDecision: null,
    threadId: '',
    ...overrides,
  };
}

function makeMockDeps(overrides: Partial<ClarifierDeps> = {}): ClarifierDeps {
  return {
    provider: { complete: jest.fn(), stream: jest.fn() } as unknown as ClarifierDeps['provider'],
    projectRoot: '/tmp/test-project',
    projectId: 'test-project',
    ...overrides,
  };
}

function makeMockRetrievalTools(): RetrievalTools {
  return {
    searchCode: jest.fn().mockResolvedValue(Ok({
      hits: [
        {
          chunk: { filePath: 'src/app.ts', language: 'typescript', content: 'export function main() {}', startLine: 1, endLine: 3, scopeChain: [], contentHash: 'abc' },
          relevanceScore: 0.95,
          originalIndex: 0,
        },
      ],
      query: 'expense tracker',
      totalCandidates: 10,
      durationMs: 50,
    })),
    searchDocs: jest.fn().mockResolvedValue(Ok({
      hits: [
        {
          chunk: { filePath: 'docs/README.md', content: 'Project overview', heading: 'Overview', headingLevel: 1, docType: 'markdown' as const, contentHash: 'def' },
          relevanceScore: 0.9,
          originalIndex: 0,
        },
      ],
      query: 'expense tracker',
      totalCandidates: 5,
      durationMs: 30,
    })),
    searchDesigns: jest.fn().mockResolvedValue(Ok({
      hits: [
        {
          chunk: { filePath: 'designs/dashboard.json', content: '{"nodes":{}}', screenId: 'dashboard', contentHash: 'ghi' },
          relevanceScore: 0.85,
          originalIndex: 0,
        },
      ],
      query: 'expense tracker',
      totalCandidates: 3,
      durationMs: 20,
    })),
    getRepoMap: jest.fn().mockResolvedValue(Ok('src/\n  app.ts: main()\n  utils.ts: format()')),
    findSimilarPatterns: jest.fn().mockResolvedValue(Ok({
      hits: [
        {
          chunk: { filePath: 'src/utils.ts', language: 'typescript', content: 'export function format() {}', startLine: 5, endLine: 7, scopeChain: [], contentHash: 'jkl' },
          relevanceScore: 0.7,
          originalIndex: 0,
        },
      ],
      query: 'expense tracker',
      totalCandidates: 8,
      durationMs: 40,
    })),
    definitions: [],
  };
}

describe('createContextRetriever', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    existsSync.mockReturnValue(false);
  });

  describe('bootstrap mode', () => {
    it('loads base catalog and returns non-empty catalog string', async () => {
      const deps = makeMockDeps();
      const node = createContextRetriever(deps);
      const result = await node(makeState({ mode: 'bootstrap' }));

      expect(result.error).toBeUndefined();
      expect(result.context).toBeDefined();
      expect(result.context!.catalog).toContain('Card');
      expect(result.context!.catalog).toContain('Button');
      expect(result.context!.platformConstraints).toContain('WCAG');
    });

    it('tolerates missing design tokens without error', async () => {
      existsSync.mockReturnValue(false);
      const deps = makeMockDeps();
      const node = createContextRetriever(deps);
      const result = await node(makeState({ mode: 'bootstrap' }));

      expect(result.error).toBeUndefined();
      expect(result.context).toBeDefined();
      expect(result.context!.catalog).toBeDefined();
      expect(result.context!.patternLibrary).toBeUndefined();
    });

    it('includes design tokens when file exists', async () => {
      existsSync.mockImplementation((p: string) => p.includes('design-tokens'));
      readFileSync.mockReturnValue('tokens:\n  primary: "#007bff"');
      const deps = makeMockDeps();
      const node = createContextRetriever(deps);
      const result = await node(makeState({ mode: 'bootstrap' }));

      expect(result.context!.patternLibrary).toContain('#007bff');
    });
  });

  describe('evolution mode', () => {
    it('returns error when retrievalTools not provided', async () => {
      const deps = makeMockDeps();
      const node = createContextRetriever(deps);
      const result = await node(makeState({ mode: 'evolution' }));

      expect(result.error).toBe('Evolution mode requires retrieval tools but none were provided');
    });

    it('calls all 5 retrieval tools with correct arguments', async () => {
      const tools = makeMockRetrievalTools();
      const deps = makeMockDeps({ retrievalTools: tools });
      const node = createContextRetriever(deps);
      const state = makeState({ mode: 'evolution', rawInput: 'add user auth' });
      await node(state);

      expect(tools.searchCode).toHaveBeenCalledWith({ query: 'add user auth', projectId: 'test-project' });
      expect(tools.searchDocs).toHaveBeenCalledWith({ query: 'add user auth', projectId: 'test-project' });
      expect(tools.searchDesigns).toHaveBeenCalledWith({ query: 'add user auth', projectId: 'test-project' });
      expect(tools.getRepoMap).toHaveBeenCalledWith({ tokenBudget: 2000 });
      expect(tools.findSimilarPatterns).toHaveBeenCalledWith({ codeSnippet: 'add user auth', projectId: 'test-project' });
    });

    it('populates context from successful tool results', async () => {
      const tools = makeMockRetrievalTools();
      const deps = makeMockDeps({ retrievalTools: tools });
      const node = createContextRetriever(deps);
      const result = await node(makeState({ mode: 'evolution' }));

      expect(result.error).toBeUndefined();
      const ctx = result.context!;
      expect(ctx.codeChunks).toBeDefined();
      expect(ctx.codeChunks!.length).toBeGreaterThanOrEqual(2);
      expect(ctx.codeChunks![0]).toContain('src/app.ts');
      expect(ctx.docChunks).toBeDefined();
      expect(ctx.docChunks![0]).toContain('docs/README.md');
      expect(ctx.designChunks).toBeDefined();
      expect(ctx.designChunks![0]).toContain('screen:dashboard');
      expect(ctx.repoMap).toContain('app.ts');
    });

    it('handles partial tool failures gracefully', async () => {
      const tools = makeMockRetrievalTools();
      (tools.searchCode as jest.Mock).mockRejectedValue(new Error('Connection refused'));
      (tools.searchDesigns as jest.Mock).mockResolvedValue(Err({ code: 'SEARCH_ERROR', message: 'No collection' }));
      (tools.findSimilarPatterns as jest.Mock).mockRejectedValue(new Error('Timeout'));

      const deps = makeMockDeps({ retrievalTools: tools });
      const node = createContextRetriever(deps);
      const result = await node(makeState({ mode: 'evolution' }));

      expect(result.error).toBeUndefined();
      const ctx = result.context!;
      expect(ctx.codeChunks).toBeUndefined();
      expect(ctx.designChunks).toBeUndefined();
      expect(ctx.docChunks).toBeDefined();
      expect(ctx.repoMap).toBeDefined();
    });

    it('falls back to base catalog when project catalog missing', async () => {
      existsSync.mockReturnValue(false);
      const tools = makeMockRetrievalTools();
      const deps = makeMockDeps({ retrievalTools: tools });
      const node = createContextRetriever(deps);
      const result = await node(makeState({ mode: 'evolution' }));

      expect(result.context!.catalog).toContain('Card');
      expect(result.context!.catalog).toContain('Button');
    });

    it('uses project catalog when it exists', async () => {
      existsSync.mockImplementation((p: string) => p.includes('component-catalog'));
      readFileSync.mockReturnValue('components:\n  CustomWidget:\n    description: "Project widget"');
      const tools = makeMockRetrievalTools();
      const deps = makeMockDeps({ retrievalTools: tools });
      const node = createContextRetriever(deps);
      const result = await node(makeState({ mode: 'evolution' }));

      expect(result.context!.catalog).toContain('CustomWidget');
    });
  });
});
