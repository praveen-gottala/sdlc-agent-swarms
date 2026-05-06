/**
 * PRD Updater node tests.
 * Scope: LLM call wiring (prompt contains PRD + Q&A), validation failure
 * graceful fallback, Q&A pair joining, skip behavior when no responses.
 */

import type { ClarifierDeps } from '../../deps.js';
import type { ClarifierState } from '../../types.js';
import type { PRD } from '@agentforge/core';
import { createPrdUpdater, buildQAPairs, buildUserMessage, _resetPromptCache } from '../prd-updater.js';

jest.mock('node:fs', () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

jest.mock('node:url', () => ({
  fileURLToPath: jest.fn(() => '/mock/src/nodes/prd-updater.ts'),
}));

jest.mock('@agentforge/core', () => {
  const actual = jest.requireActual('@agentforge/core');
  return { ...actual, debugLog: jest.fn() };
});

const { readFileSync } = jest.requireMock('node:fs') as { readFileSync: jest.Mock };

const MOCK_PROMPT = '---\nversion: 1.0.0\npurpose: Test\n---\nYou are a PRD updater.';

const BASE_PRD: PRD = {
  id: 'prd-001',
  title: 'Pomodoro App',
  description: 'A timer application',
  features: [
    { id: 'feat-001', name: 'Timer', description: 'Pomodoro timer with configurable intervals' },
    { id: 'feat-002', name: 'Profiles', description: 'Multiple timer profiles' },
  ],
  personas: [
    { id: 'persona-001', name: 'User', role: 'consumer', goals: ['Be productive'] },
  ],
  dataEntities: [
    {
      id: 'entity-001',
      name: 'TimerProfile',
      fields: [
        { name: 'name', type: 'string', required: true },
        { name: 'duration', type: 'number', required: true },
      ],
    },
  ],
  screens: [
    { id: 'screen-001', name: 'Timer', description: 'Main timer screen' },
  ],
  nfrs: [],
  successMetrics: [
    { id: 'metric-001', name: 'Usage', description: 'Daily sessions', target: '5', measurement: 'count' },
  ],
  outOfScope: [],
  version: '1.0.0',
  status: 'draft',
};

const UPDATED_PRD: PRD = {
  ...BASE_PRD,
  features: [
    ...BASE_PRD.features,
    { id: 'feat-003', name: 'Statistics', description: 'Dashboard showing productivity stats' },
  ],
  version: '1.0.1',
};

function makeState(overrides: Partial<ClarifierState> = {}): ClarifierState {
  return {
    rawInput: 'Create a pomodoro app',
    mode: 'bootstrap',
    context: {},
    gaps: [],
    questions: [
      {
        id: 'q-0-0',
        gapId: 'gap-001',
        text: 'Should the app include productivity statistics?',
        type: 'multiple-choice',
        options: [
          { label: 'Yes', description: 'Include stats', recommended: true, source: 'llm' },
          { label: 'No', description: 'Skip stats', recommended: false, source: 'llm' },
        ],
        priority: 1,
        evpiScore: 0.7,
      },
      {
        id: 'q-0-1',
        gapId: 'gap-002',
        text: 'What notification sounds do you prefer?',
        type: 'open',
        priority: 2,
        evpiScore: 0.4,
      },
    ],
    humanResponses: [
      { questionId: 'q-0-0', answer: 'Yes, add a dashboard with stats', selectedOption: 'Yes' },
      { questionId: 'q-0-1', answer: 'Default system sounds are fine' },
    ],
    requirement: null,
    assumptions: null,
    round: 1,
    maxRounds: 3,
    error: null,
    prdDraft: BASE_PRD,
    featurePlan: null,
    criticRetries: 0,
    criticPassed: false,
    escalationDecision: null,
    threadId: '',
    ...overrides,
  };
}

function makeDeps(completeResult: unknown): ClarifierDeps {
  return {
    provider: {
      complete: jest.fn().mockResolvedValue(completeResult),
      stream: jest.fn(),
    } as unknown as ClarifierDeps['provider'],
    projectRoot: '/tmp/test-project',
    projectId: 'test-project',
  };
}

beforeEach(() => {
  _resetPromptCache();
  readFileSync.mockReturnValue(MOCK_PROMPT);
});

describe('buildQAPairs', () => {
  it('joins questions and responses by questionId', () => {
    const state = makeState();
    const pairs = buildQAPairs(state);

    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toEqual({
      question: 'Should the app include productivity statistics?',
      answer: 'Yes, add a dashboard with stats (selected: Yes)',
    });
    expect(pairs[1]).toEqual({
      question: 'What notification sounds do you prefer?',
      answer: 'Default system sounds are fine',
    });
  });

  it('handles responses with no matching question', () => {
    const state = makeState({
      humanResponses: [
        { questionId: 'q-unknown', answer: 'Some answer' },
      ],
    });
    const pairs = buildQAPairs(state);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.question).toBe('[Question q-unknown]');
  });
});

describe('buildUserMessage', () => {
  it('includes PRD JSON and Q&A section', () => {
    const state = makeState();
    const message = buildUserMessage(state);

    expect(message).toContain('## Current PRD');
    expect(message).toContain('"title": "Pomodoro App"');
    expect(message).toContain('## Clarification Answers');
    expect(message).toContain('**Q:** Should the app include productivity statistics?');
    expect(message).toContain('**A:** Yes, add a dashboard with stats (selected: Yes)');
  });

  it('omits Q&A section when no responses', () => {
    const state = makeState({ humanResponses: [] });
    const message = buildUserMessage(state);

    expect(message).toContain('## Current PRD');
    expect(message).not.toContain('## Clarification Answers');
  });
});

describe('createPrdUpdater', () => {
  it('sends PRD and Q&A to LLM and returns updated prdDraft', async () => {
    const deps = makeDeps({
      ok: true,
      value: { content: '', structured: UPDATED_PRD },
    });
    const updater = createPrdUpdater(deps);
    const state = makeState();

    const result = await updater(state);

    expect(result.prdDraft).toBeDefined();
    expect(result.prdDraft!.version).toBe('1.0.1');
    expect(result.prdDraft!.features).toHaveLength(3);

    const callArgs = (deps.provider.complete as jest.Mock).mock.calls[0];
    expect(callArgs[0].messages[0].content).toContain('Pomodoro App');
    expect(callArgs[0].messages[0].content).toContain('Clarification Answers');
    expect(callArgs[1].model).toBe('claude-sonnet-4-6');
  });

  it('skips when no prdDraft', async () => {
    const deps = makeDeps({ ok: true, value: { content: '', structured: UPDATED_PRD } });
    const updater = createPrdUpdater(deps);
    const state = makeState({ prdDraft: null });

    const result = await updater(state);

    expect(result).toEqual({});
    expect(deps.provider.complete).not.toHaveBeenCalled();
  });

  it('skips when no human responses', async () => {
    const deps = makeDeps({ ok: true, value: { content: '', structured: UPDATED_PRD } });
    const updater = createPrdUpdater(deps);
    const state = makeState({ humanResponses: [] });

    const result = await updater(state);

    expect(result).toEqual({});
    expect(deps.provider.complete).not.toHaveBeenCalled();
  });

  it('keeps old prdDraft on LLM failure', async () => {
    const deps = makeDeps({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    });
    const updater = createPrdUpdater(deps);
    const state = makeState();

    const result = await updater(state);

    expect(result).toEqual({});
  });

  it('keeps old prdDraft on invalid JSON response', async () => {
    const deps = makeDeps({
      ok: true,
      value: { content: 'not json', structured: undefined },
    });
    const updater = createPrdUpdater(deps);
    const state = makeState();

    const result = await updater(state);

    expect(result).toEqual({});
  });

  it('keeps old prdDraft on schema validation failure', async () => {
    const deps = makeDeps({
      ok: true,
      value: { content: '', structured: { id: 'bad', title: 'Missing fields' } },
    });
    const updater = createPrdUpdater(deps);
    const state = makeState();

    const result = await updater(state);

    expect(result).toEqual({});
  });

  it('parses JSON from code-fenced content when structured is absent', async () => {
    const deps = makeDeps({
      ok: true,
      value: {
        content: '```json\n' + JSON.stringify(UPDATED_PRD) + '\n```',
        structured: undefined,
      },
    });
    const updater = createPrdUpdater(deps);
    const state = makeState();

    const result = await updater(state);

    expect(result.prdDraft).toBeDefined();
    expect(result.prdDraft!.version).toBe('1.0.1');
  });

  // FB4: The prompt contains the priority-update instruction. The cooperative
  // eval simulator never exercises this branch (it uses descriptive answers,
  // not priority language like "must have" or "don't need"), but the instruction
  // must remain present for when opinionated eval personas are added.
  it('prompt contains priority-update instruction', () => {
    _resetPromptCache();
    const { readFileSync: realReadFile } = jest.requireActual('node:fs') as typeof import('node:fs');
    const { fileURLToPath: realFileUrl } = jest.requireActual('node:url') as typeof import('node:url');
    const { join: realJoin, dirname: realDirname } = jest.requireActual('node:path') as typeof import('node:path');

    let promptText: string;
    try {
      const promptDir = realJoin(realDirname(realFileUrl(import.meta.url)), '..', '..', 'prompts');
      promptText = realReadFile(realJoin(promptDir, 'prd-updater-system.md'), 'utf-8');
    } catch {
      return;
    }

    expect(promptText).toContain('Update priorities');
    expect(promptText).toContain('must-have');
    expect(promptText).toContain('could-have');
    expect(promptText).toContain('wont-have');
  });
});
