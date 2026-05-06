/**
 * @module @agentforge/eval/simulator
 *
 * Cooperative user simulator for eval scenarios.
 * Generates HumanResponse[] from Question[] using a deterministic strategy.
 */

import type { Question, HumanResponse } from '@agentforge/agents-clarifier';

/**
 * Generate cooperative answers for clarifier questions.
 *
 * - MC with recommended option: picks the recommended option
 * - MC without recommended: picks the first option
 * - Open question: answers with a generic affirmative
 *
 * @param maxAnswers - When set, only answers the first N questions.
 *   Unanswered questions leave gaps unresolved, forcing multi-round routing.
 */
export function simulateCooperativeAnswers(
  questions: readonly Question[],
  maxAnswers?: number,
): readonly HumanResponse[] {
  const toAnswer = maxAnswers !== undefined
    ? questions.slice(0, maxAnswers)
    : questions;

  return toAnswer.map((q): HumanResponse => {
    if (q.type === 'multiple-choice' && q.options && q.options.length > 0) {
      const recommended = q.options.find((o) => o.recommended);
      const picked = recommended ?? q.options[0]!;
      return {
        questionId: q.id,
        answer: picked.description,
        selectedOption: picked.label,
      };
    }

    return {
      questionId: q.id,
      answer: 'Yes, that sounds right.',
    };
  });
}
