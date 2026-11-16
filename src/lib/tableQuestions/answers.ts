import type { TableQuestion, TableQuestionAnswer, TableQuestionOption } from "@/types/tableQuestion.types";

export function answerOf(answers: readonly TableQuestionAnswer[], userId: string): TableQuestionAnswer | null {
  return answers.find((a) => a.user_id === userId) ?? null;
}

/** An open question this user has not answered yet. */
export function isWaitingOn(
  question: TableQuestion,
  answers: readonly TableQuestionAnswer[],
  userId: string,
): boolean {
  return question.closed_at === null && answerOf(answers, userId) === null;
}

/** For an exclusive pick, the options someone else already holds. Empty for any other question. */
export function takenByOthers(
  question: TableQuestion,
  answers: readonly TableQuestionAnswer[],
  userId: string,
): Set<string> {
  const taken = new Set<string>();
  if (question.mode !== "pick" || !question.exclusive) return taken;
  for (const a of answers) {
    if (a.user_id !== userId && a.option_id) taken.add(a.option_id);
  }
  return taken;
}

export function optionById(question: TableQuestion, id: string | null): TableQuestionOption | null {
  if (!id) return null;
  return question.options.find((o) => o.id === id) ?? null;
}

/** Answers grouped by option in option order; a roll that landed in a gap has no option and comes back apart. */
export function tally(
  question: TableQuestion,
  answers: readonly TableQuestionAnswer[],
): { rows: { option: TableQuestionOption; answers: TableQuestionAnswer[] }[]; unmatched: TableQuestionAnswer[] } {
  const rows = question.options.map((option) => ({
    option,
    answers: answers.filter((a) => a.option_id === option.id),
  }));
  const unmatched = answers.filter((a) => a.option_id === null);
  return { rows, unmatched };
}
