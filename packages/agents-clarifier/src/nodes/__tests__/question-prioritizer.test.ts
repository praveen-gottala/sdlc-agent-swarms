/**
 * Question Prioritizer node tests.
 * Scope: EVPI scoring, budget enforcement, assumption creation,
 * multiple-choice generation, question text formatting.
 */

import type { ClarifierDeps } from '../../deps.js';
import type { ClarifierState, Gap } from '../../types.js';
import type { PRD } from '@agentforge/core';
import {
  createQuestionPrioritizer,
  computeEVPI,
  computeBudget,
  gapsToAssumptions,
  EVPI_THRESHOLD,
} from '../question-prioritizer.js';

const SMALL_PRD: PRD = {
  id: 'prd-001',
  title: 'Todo App',
  description: 'Simple todo',
  features: [{ id: 'f1', name: 'Add Todo', description: 'Add a task' }],
  personas: [{ id: 'p1', name: 'User', role: 'user', goals: ['track tasks'] }],
  dataEntities: [{ id: 'e1', name: 'Todo', fields: [{ name: 'text', type: 'string' }] }],
  screens: [{ id: 's1', name: 'Home', description: 'Main screen' }],
  nfrs: [],
  successMetrics: [{ id: 'm1', name: 'Usage', description: 'test', target: '1', measurement: 'count' }],
  outOfScope: [],
  version: '1.0.0',
  status: 'draft',
};

const LARGE_PRD: PRD = {
  ...SMALL_PRD,
  features: Array.from({ length: 8 }, (_, i) => ({
    id: `f${i}`,
    name: `Feature ${i}`,
    description: `Description ${i}`,
  })),
  screens: Array.from({ length: 6 }, (_, i) => ({
    id: `s${i}`,
    name: `Screen ${i}`,
    description: `Description ${i}`,
  })),
  dataEntities: Array.from({ length: 4 }, (_, i) => ({
    id: `e${i}`,
    name: `Entity ${i}`,
    fields: [{ name: 'id', type: 'string' }],
  })),
};

const HIGH_EVPI_GAP: Gap = {
  id: 'gap-high',
  description: 'No auth strategy specified',
  category: 'missing',
  confidence: 0.1,
  deterministic: true,
};

const LOW_EVPI_GAP: Gap = {
  id: 'gap-low',
  description: 'Minor formatting preference',
  category: 'incomplete',
  confidence: 0.9,
  deterministic: true,
};

const MEDIUM_EVPI_GAP: Gap = {
  id: 'gap-mid',
  description: 'Ambiguous navigation pattern',
  category: 'ambiguous',
  confidence: 0.4,
  deterministic: false,
  divergentInterpretations: ['Tab bar', 'Sidebar', 'Bottom nav'],
};

function makeState(overrides: Partial<ClarifierState> = {}): ClarifierState {
  return {
    rawInput: 'Build app',
    mode: 'bootstrap',
    context: {},
    gaps: [HIGH_EVPI_GAP, LOW_EVPI_GAP, MEDIUM_EVPI_GAP],
    questions: [],
    humanResponses: [],
    requirement: null,
    assumptions: null,
    round: 1,
    maxRounds: 3,
    error: null,
    prdDraft: SMALL_PRD,
    featurePlan: null,
    criticRetries: 0,
    criticPassed: false,
    escalationDecision: null,
    ...overrides,
  };
}

const mockDeps: ClarifierDeps = {
  provider: { complete: jest.fn(), stream: jest.fn() } as unknown as ClarifierDeps['provider'],
  projectRoot: '/tmp/test',
  projectId: 'test-project',
};

describe('computeEVPI', () => {
  it('scores high for missing gap with low confidence', () => {
    const score = computeEVPI(HIGH_EVPI_GAP);
    expect(score).toBeGreaterThan(0.5);
  });

  it('scores low for incomplete gap with high confidence', () => {
    const score = computeEVPI(LOW_EVPI_GAP);
    expect(score).toBeLessThan(EVPI_THRESHOLD);
  });

  it('ranks missing > ambiguous > incomplete for same confidence', () => {
    const missingScore = computeEVPI({ ...HIGH_EVPI_GAP, category: 'missing', confidence: 0.5 });
    const ambiguousScore = computeEVPI({ ...HIGH_EVPI_GAP, category: 'ambiguous', confidence: 0.5 });
    const incompleteScore = computeEVPI({ ...HIGH_EVPI_GAP, category: 'incomplete', confidence: 0.5 });
    expect(missingScore).toBeGreaterThan(ambiguousScore);
    expect(ambiguousScore).toBeGreaterThan(incompleteScore);
  });

  it('scores higher for LLM gaps (lower answerability) than deterministic', () => {
    const det = computeEVPI({ ...HIGH_EVPI_GAP, deterministic: true });
    const llm = computeEVPI({ ...HIGH_EVPI_GAP, deterministic: false });
    expect(det).toBeGreaterThan(llm);
  });
});

describe('computeBudget', () => {
  it('returns 2 for micro PRD (<=5 items)', () => {
    expect(computeBudget(SMALL_PRD)).toBe(2);
  });

  it('returns 7 for standard PRD (6-15 items)', () => {
    const prd: PRD = {
      ...SMALL_PRD,
      features: Array.from({ length: 4 }, (_, i) => ({ id: `f${i}`, name: `F${i}`, description: 'D' })),
      screens: Array.from({ length: 3 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, description: 'D' })),
    };
    expect(computeBudget(prd)).toBe(7);
  });

  it('returns 15 for cross-cutting PRD (>15 items)', () => {
    expect(computeBudget(LARGE_PRD)).toBe(15);
  });

  it('returns 2 when prdDraft is null', () => {
    expect(computeBudget(null)).toBe(2);
  });
});

describe('gapsToAssumptions', () => {
  it('creates assumption entries for each gap', () => {
    const result = gapsToAssumptions([LOW_EVPI_GAP], null);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].id).toBe('assumption-gap-low');
    expect(result.entries[0].statement).toContain('formatting preference');
  });

  it('preserves existing ledger entries', () => {
    const existing = {
      id: 'ledger-1',
      entries: [{ id: 'old-1', statement: 'Old assumption', evidence: 'test', confidence: 0.5, blastRadius: 'low' as const, requiresConfirmation: false }],
      createdAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
    };
    const result = gapsToAssumptions([LOW_EVPI_GAP], existing);
    expect(result.entries).toHaveLength(2);
    expect(result.id).toBe('ledger-1');
    expect(result.createdAt).toBe('2026-01-01');
  });

  it('does not duplicate assumptions for same gap id', () => {
    const existing = {
      id: 'ledger-1',
      entries: [{ id: 'assumption-gap-low', statement: 'Already assumed', evidence: 'test', confidence: 0.5, blastRadius: 'low' as const, requiresConfirmation: false }],
      createdAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
    };
    const result = gapsToAssumptions([LOW_EVPI_GAP], existing);
    expect(result.entries).toHaveLength(1);
  });

  it('flags low-confidence gaps as requiring confirmation', () => {
    const lowConfGap: Gap = { ...LOW_EVPI_GAP, confidence: 0.3 };
    const result = gapsToAssumptions([lowConfGap], null);
    expect(result.entries[0].requiresConfirmation).toBe(true);
  });
});

describe('createQuestionPrioritizer', () => {
  it('returns empty questions and preserves assumptions when no gaps', async () => {
    const node = createQuestionPrioritizer(mockDeps);
    const result = await node(makeState({ gaps: [] }));
    expect(result.questions).toEqual([]);
  });

  it('produces questions sorted by EVPI (high first)', async () => {
    const node = createQuestionPrioritizer(mockDeps);
    const result = await node(makeState());

    const questions = result.questions!;
    expect(questions.length).toBeGreaterThan(0);
    for (let i = 1; i < questions.length; i++) {
      expect(questions[i - 1].evpiScore).toBeGreaterThanOrEqual(questions[i].evpiScore);
    }
  });

  it('enforces budget limit for micro PRD', async () => {
    const manyGaps: Gap[] = Array.from({ length: 5 }, (_, i) => ({
      id: `gap-${i}`,
      description: `Critical gap ${i}`,
      category: 'missing' as const,
      confidence: 0.1,
      deterministic: true,
    }));

    const node = createQuestionPrioritizer(mockDeps);
    const result = await node(makeState({ gaps: manyGaps, prdDraft: SMALL_PRD }));

    expect(result.questions!.length).toBeLessThanOrEqual(2);
    expect(result.assumptions).toBeDefined();
    expect(result.assumptions!.entries.length).toBeGreaterThan(0);
  });

  it('converts below-threshold gaps to assumptions', async () => {
    const node = createQuestionPrioritizer(mockDeps);
    const result = await node(makeState({ gaps: [HIGH_EVPI_GAP, LOW_EVPI_GAP] }));

    const questionGapIds = result.questions!.map((q) => q.gapId);
    expect(questionGapIds).toContain('gap-high');
    expect(questionGapIds).not.toContain('gap-low');

    expect(result.assumptions).toBeDefined();
    const assumptionIds = result.assumptions!.entries.map((e) => e.id);
    expect(assumptionIds).toContain('assumption-gap-low');
  });

  it('generates multiple-choice for evolution mode with code context', async () => {
    const node = createQuestionPrioritizer(mockDeps);
    const result = await node(
      makeState({
        mode: 'evolution',
        context: { codeChunks: ['src/app.ts:1-3\ncode here'] },
        gaps: [MEDIUM_EVPI_GAP],
      }),
    );

    const mcQuestion = result.questions!.find((q) => q.type === 'multiple-choice');
    expect(mcQuestion).toBeDefined();
    expect(mcQuestion!.options).toEqual(['Tab bar', 'Sidebar', 'Bottom nav']);
  });

  it('generates open questions in bootstrap mode', async () => {
    const node = createQuestionPrioritizer(mockDeps);
    const result = await node(
      makeState({
        mode: 'bootstrap',
        gaps: [MEDIUM_EVPI_GAP],
      }),
    );

    expect(result.questions!.every((q) => q.type === 'open')).toBe(true);
  });

  it('assigns unique question IDs including round number', async () => {
    const node = createQuestionPrioritizer(mockDeps);
    const result = await node(makeState({ round: 2 }));

    const ids = result.questions!.map((q) => q.id);
    expect(ids.every((id) => id.startsWith('q-2-'))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
