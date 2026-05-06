/**
 * Scaffold verification tests for @agentforge/agents-clarifier.
 * Validates package structure, type exports, schema parsing, graph assembly,
 * and routing functions.
 */

import {
  GapSchema,
  QuestionSchema,
  ClarifierContextSchema,
  HumanResponseSchema,
  buildClarifierGraph,
  ClarifierStateAnnotation,
  routeAfterCritic,
  routeAfterEscalation,
  routeAfterPrdUpdater,
  routeAfterPrdAnalyzer,
  hasUnresolvedGaps,
} from '../index.js';
import type { ClarifierDeps } from '../deps.js';
import type { ClarifierState } from '../types.js';

const mockDeps: ClarifierDeps = {
  provider: { complete: jest.fn(), stream: jest.fn() } as unknown as ClarifierDeps['provider'],
  projectRoot: '/tmp/test',
  projectId: 'test-project',
};

function makeState(overrides: Partial<ClarifierState> = {}): ClarifierState {
  return {
    rawInput: '',
    mode: 'bootstrap',
    context: {},
    gaps: [],
    questions: [],
    humanResponses: [],
    requirement: null,
    assumptions: null,
    round: 1,
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

describe('agents-clarifier scaffold', () => {
  describe('Zod schemas parse valid data', () => {
    it('GapSchema accepts valid gap', () => {
      const result = GapSchema.safeParse({
        id: 'gap-1',
        description: 'Missing auth strategy',
        category: 'missing',
        confidence: 0.8,
        deterministic: true,
      });
      expect(result.success).toBe(true);
    });

    it('GapSchema rejects invalid confidence', () => {
      const result = GapSchema.safeParse({
        id: 'gap-1',
        description: 'Test',
        category: 'missing',
        confidence: 1.5,
        deterministic: true,
      });
      expect(result.success).toBe(false);
    });

    it('QuestionSchema accepts valid question', () => {
      const result = QuestionSchema.safeParse({
        id: 'q-1',
        gapId: 'gap-1',
        text: 'Which auth strategy?',
        type: 'multiple-choice',
        options: [
          { label: 'OAuth2', description: 'OAuth 2.0 flow', recommended: true, source: 'template' },
          { label: 'JWT', description: 'JSON Web Tokens', recommended: false, source: 'llm' },
          { label: 'Session', description: 'Server-side sessions', recommended: false, source: 'llm' },
        ],
        priority: 1,
        evpiScore: 0.9,
      });
      expect(result.success).toBe(true);
    });

    it('ClarifierContextSchema accepts empty context', () => {
      const result = ClarifierContextSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('HumanResponseSchema accepts valid response', () => {
      const result = HumanResponseSchema.safeParse({
        questionId: 'q-1',
        answer: 'OAuth2',
        selectedOption: 'OAuth2',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('LangGraph StateGraph', () => {
    it('buildClarifierGraph creates a graph with deps', () => {
      const graph = buildClarifierGraph(mockDeps);
      expect(graph).toBeDefined();
    });

    it('ClarifierStateAnnotation has all channel keys including new ones', () => {
      const spec = ClarifierStateAnnotation.spec;
      expect(spec).toHaveProperty('rawInput');
      expect(spec).toHaveProperty('mode');
      expect(spec).toHaveProperty('context');
      expect(spec).toHaveProperty('gaps');
      expect(spec).toHaveProperty('questions');
      expect(spec).toHaveProperty('humanResponses');
      expect(spec).toHaveProperty('requirement');
      expect(spec).toHaveProperty('assumptions');
      expect(spec).toHaveProperty('round');
      expect(spec).toHaveProperty('maxRounds');
      expect(spec).toHaveProperty('error');
      expect(spec).toHaveProperty('prdDraft');
      expect(spec).toHaveProperty('featurePlan');
      expect(spec).toHaveProperty('criticRetries');
      expect(spec).toHaveProperty('criticPassed');
      expect(spec).toHaveProperty('escalationDecision');
    });
  });

  describe('routing functions', () => {
    it('routeAfterCritic routes to storyWriter on critic failure with retries left', () => {
      const state = makeState({ criticPassed: false, criticRetries: 1 });
      expect(routeAfterCritic(state)).toBe('storyWriter');
    });

    it('routeAfterCritic routes to gapDetector for new round with unresolved gaps', () => {
      const state = makeState({
        criticPassed: true,
        round: 1,
        maxRounds: 3,
        gaps: [{ id: 'g1', description: 'test', category: 'missing', confidence: 0.3, deterministic: true }],
      });
      expect(routeAfterCritic(state)).toBe('prdUpdater');
    });

    it('routeAfterCritic routes to escalationGate when max rounds reached', () => {
      const state = makeState({
        criticPassed: true,
        round: 3,
        maxRounds: 3,
        gaps: [{ id: 'g1', description: 'test', category: 'missing', confidence: 0.3, deterministic: true }],
      });
      expect(routeAfterCritic(state)).toBe('escalationGate');
    });

    it('routeAfterCritic routes to emitComplete when no gaps and no human responses', () => {
      const state = makeState({ criticPassed: true, round: 1, maxRounds: 3, gaps: [] });
      expect(routeAfterCritic(state)).toBe('emitComplete');
    });

    it('routeAfterCritic routes to prdUpdater when all gaps resolved but human responses exist', () => {
      const state = makeState({
        criticPassed: true, round: 1, maxRounds: 3, gaps: [],
        humanResponses: [{ questionId: 'q1', answer: 'yes' }],
      });
      expect(routeAfterCritic(state)).toBe('prdUpdater');
    });

    it('routeAfterPrdUpdater routes to gapDetector when unresolved gaps remain', () => {
      const state = makeState({
        round: 1, maxRounds: 3,
        gaps: [{ id: 'g1', description: 'test', category: 'missing', confidence: 0.3, deterministic: true }],
      });
      expect(routeAfterPrdUpdater(state)).toBe('gapDetector');
    });

    it('routeAfterPrdUpdater routes to emitComplete when all gaps resolved', () => {
      const state = makeState({ round: 1, maxRounds: 3, gaps: [] });
      expect(routeAfterPrdUpdater(state)).toBe('emitComplete');
    });

    it('routeAfterEscalation routes to emitComplete on accept', () => {
      const state = makeState({ escalationDecision: 'accept' });
      expect(routeAfterEscalation(state)).toBe('emitComplete');
    });

    it('routeAfterEscalation routes to gapDetector on restart', () => {
      const state = makeState({ escalationDecision: 'restart' });
      expect(routeAfterEscalation(state)).toBe('prdUpdater');
    });

    it('routeAfterEscalation routes to END on abandon', () => {
      const state = makeState({ escalationDecision: 'abandon' });
      expect(routeAfterEscalation(state)).toBe('__end__');
    });

    it('routeAfterPrdAnalyzer routes to emitComplete when prdDraft is null', () => {
      const state = makeState({ prdDraft: null });
      expect(routeAfterPrdAnalyzer(state)).toBe('emitComplete');
    });

    it('routeAfterPrdAnalyzer routes to gapDetector when prdDraft exists', () => {
      const state = makeState({
        prdDraft: {
          id: 'prd-001', title: 'App', description: 'Test',
          features: [], personas: [], dataEntities: [], screens: [],
          nfrs: [], successMetrics: [], outOfScope: [], version: '1.0.0', status: 'draft',
        },
      });
      expect(routeAfterPrdAnalyzer(state)).toBe('gapDetector');
    });

    it('routeAfterPrdAnalyzer routes to emitComplete when error set and prdDraft null', () => {
      const state = makeState({ prdDraft: null, error: 'PRD Analyzer LLM call failed: RATE_LIMITED' });
      expect(routeAfterPrdAnalyzer(state)).toBe('emitComplete');
    });

    it('hasUnresolvedGaps returns false when all gaps are high confidence', () => {
      const state = makeState({
        gaps: [{ id: 'g1', description: 'test', category: 'missing', confidence: 0.9, deterministic: true }],
      });
      expect(hasUnresolvedGaps(state)).toBe(false);
    });

    it('hasUnresolvedGaps returns true when low-confidence gap has no answer', () => {
      const state = makeState({
        gaps: [{ id: 'g1', description: 'test', category: 'missing', confidence: 0.3, deterministic: true }],
        questions: [{ id: 'q1', gapId: 'g1', text: 'test?', type: 'open', priority: 1, evpiScore: 0.9 }],
        humanResponses: [],
      });
      expect(hasUnresolvedGaps(state)).toBe(true);
    });

    it('hasUnresolvedGaps returns false when gap is answered', () => {
      const state = makeState({
        gaps: [{ id: 'g1', description: 'test', category: 'missing', confidence: 0.3, deterministic: true }],
        questions: [{ id: 'q1', gapId: 'g1', text: 'test?', type: 'open', priority: 1, evpiScore: 0.9 }],
        humanResponses: [{ questionId: 'q1', answer: 'yes' }],
      });
      expect(hasUnresolvedGaps(state)).toBe(false);
    });
  });
});
