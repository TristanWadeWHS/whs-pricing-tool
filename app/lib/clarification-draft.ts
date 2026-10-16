import type { Answer, Choice, Question, ScopeItem } from './conversation-schema';

// Either clarification action commits the whole visible draft. Blank questions
// remain unanswered; they are never converted into an implicit “Not sure”.
export function clarificationDraft(
  items: ScopeItem[], questions: Question[], choices: Record<string, Choice>,
  answers: Record<string, { text: string; notSure: boolean }>,
) {
  return {
    actions: items.filter(item => choices[item.id] !== undefined)
      .map(item => ({ id: item.id, choice: choices[item.id] })),
    answers: questions.flatMap(question => {
      if ((choices[question.itemId] ?? items.find(item => item.id === question.itemId)?.choice) === 'excluded') return [];
      const answer = answers[question.id];
      if (!answer || (!answer.notSure && !answer.text.trim())) return [];
      return [{ id: question.id, text: answer.notSure ? '' : answer.text.trim(), notSure: answer.notSure } satisfies Answer];
    }),
  };
}
