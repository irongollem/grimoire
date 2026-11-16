import type { TableQuestion, TableQuestionAnswer } from "@/types/tableQuestion.types";

export const RECENTLY_CLOSED_MS = 24 * 60 * 60 * 1000;

/**
 * What a player's Hearth shows, newest first: every open question, and a
 * question closed within the last day that this player answered or that is a
 * vote with an outcome (so they see how it went). Older closed ones are gone.
 */
export function questionsToShow(
  questions: readonly TableQuestion[],
  answers: readonly TableQuestionAnswer[],
  /** Null in DM preview, where nothing is the viewer's own. */
  userId: string | null,
  now: number,
): TableQuestion[] {
  return questions
    .filter((q) => {
      if (q.closed_at === null) return true;
      if (now - Date.parse(q.closed_at) > RECENTLY_CLOSED_MS) return false;
      const answered = userId !== null && answers.some((a) => a.question_id === q.id && a.user_id === userId);
      return answered || (q.mode === "vote" && q.outcome_option_id !== null);
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
