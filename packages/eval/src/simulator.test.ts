import type { Question } from '@agentforge/agents-clarifier';
import { simulateCooperativeAnswers } from './simulator.js';

const QUESTIONS: readonly Question[] = [
  {
    id: 'q1',
    gapId: 'g1',
    topic: 'storage',
    text: 'How should data be stored?',
    type: 'multiple-choice',
    options: [
      { label: 'SQLite', description: 'Embedded database', rationale: 'Simple', recommended: false, source: 'llm' as const },
      { label: 'JSON files', description: 'JSON on disk', rationale: 'Simplest', recommended: true, source: 'llm' as const },
      { label: 'PostgreSQL', description: 'Full database', rationale: 'Scalable', recommended: false, source: 'llm' as const },
    ],
    priority: 1,
    evpiScore: 0.8,
  },
  {
    id: 'q2',
    gapId: 'g2',
    topic: 'auth',
    text: 'What auth method?',
    type: 'multiple-choice',
    options: [
      { label: 'OAuth', description: 'OAuth2 flow', recommended: false, source: 'llm' as const },
      { label: 'API keys', description: 'Simple keys', recommended: false, source: 'llm' as const },
    ],
    priority: 2,
    evpiScore: 0.6,
  },
  {
    id: 'q3',
    gapId: 'g3',
    topic: 'ui',
    text: 'What UI framework?',
    type: 'open',
    priority: 3,
    evpiScore: 0.4,
  },
];

describe('simulateCooperativeAnswers', () => {
  it('picks recommended option for MC questions', () => {
    const responses = simulateCooperativeAnswers(QUESTIONS);
    const q1Response = responses.find((r) => r.questionId === 'q1');
    expect(q1Response).toBeDefined();
    expect(q1Response!.selectedOption).toBe('JSON files');
    expect(q1Response!.answer).toBe('JSON on disk');
  });

  it('picks first option when no recommended exists', () => {
    const responses = simulateCooperativeAnswers(QUESTIONS);
    const q2Response = responses.find((r) => r.questionId === 'q2');
    expect(q2Response).toBeDefined();
    expect(q2Response!.selectedOption).toBe('OAuth');
  });

  it('answers open questions with generic affirmative', () => {
    const responses = simulateCooperativeAnswers(QUESTIONS);
    const q3Response = responses.find((r) => r.questionId === 'q3');
    expect(q3Response).toBeDefined();
    expect(q3Response!.answer).toBe('Yes, that sounds right.');
    expect(q3Response!.selectedOption).toBeUndefined();
  });

  it('answers all questions by default', () => {
    const responses = simulateCooperativeAnswers(QUESTIONS);
    expect(responses).toHaveLength(3);
  });

  it('respects maxAnswers parameter', () => {
    const responses = simulateCooperativeAnswers(QUESTIONS, 2);
    expect(responses).toHaveLength(2);
    expect(responses[0]!.questionId).toBe('q1');
    expect(responses[1]!.questionId).toBe('q2');
  });

  it('returns empty array for empty questions', () => {
    const responses = simulateCooperativeAnswers([]);
    expect(responses).toHaveLength(0);
  });

  it('handles maxAnswers larger than question count', () => {
    const responses = simulateCooperativeAnswers(QUESTIONS, 10);
    expect(responses).toHaveLength(3);
  });
});
