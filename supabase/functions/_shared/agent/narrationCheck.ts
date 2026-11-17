/**
 * The narration check (#1021): does the narrator's text tell the player anything the characters' lines did not?
 *
 * Live, after characters had spoken, the narrator kept closing the turn by restating what they had just said or done
 * in its own words, right after the page showed the very line. Five rounds of instructions did not stop it, so the
 * handler holds that text back and asks this question instead. Only the lines this turn showed and the narrator's own
 * text go to the judge, both already meant for the player.
 *
 * Pure except for the injected judge. The caller decides what a failed judgment means (the handler shows the text).
 */

import { noulOf, type JudgeRequest, type JudgeResult, type NoulQuestion } from "../typesafe.ts";
import type { AgentLine } from "./types.ts";

/**
 * Where "adds something" starts. Measured on 17 Nov 2026 against sixteen invented examples (jev-latest, about
 * 170 ms a call): the seven narrations that added something (a new detail, an event, a roll's outcome) all scored
 * 0.98 or 0.99, and six of the nine that only restated scored 0.45 or lower. The other three restatements scored
 * 0.83, 0.85 and 0.95: each also mentions something the lines did not (who else is listening, that the room is
 * quiet), which the judge fairly counts as new. At 0.9, fifteen of sixteen are right and nothing that added
 * something is hidden; hiding a real event costs the player far more than showing a repetition, so the line sits
 * just under where real narration scores, not at the midpoint. Sixteen examples is a small set: move the number
 * when a labelled set from real play says otherwise.
 */
export const NARRATION_ADDS_MIN = 0.9;

/** The newest lines, each cut, and the narration cut: a judgment is small and the page never needs more to decide. */
export const MAX_LINES_SENT = 12;
export const MAX_LINE_CHARS = 400;
export const MAX_NARRATION_CHARS = 1500;

export const NARRATION_ADDS = "adds";

export const NARRATION_ADDS_QUESTION: NoulQuestion = {
  type: "noul",
  instructions:
    "`lines` is what the reader has just been shown, in order: what characters said and did. `narration` is text about to be shown right after them. Does `narration` tell the reader something that `lines` do not already tell them?",
  criteria: {
    true: "The narration brings something new: a detail of the place, something that happens, the result of an action or a roll, a consequence, a change in the scene, or a question put to the reader that the lines did not ask.",
    false: "The narration only restates, summarises or rephrases who said or did what, or only asks the reader what they do next.",
  },
};

function cut(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

export function buildNarrationRequest(lines: AgentLine[], narration: string): JudgeRequest {
  return {
    state: {
      lines: lines.slice(-MAX_LINES_SENT).map((l) => ({
        who: l.speaker.name,
        kind: l.kind === "spoken" ? "said" : "did",
        text: cut(l.text, MAX_LINE_CHARS),
      })),
      narration: cut(narration, MAX_NARRATION_CHARS),
    },
    questions: { [NARRATION_ADDS]: NARRATION_ADDS_QUESTION },
  };
}

/**
 * True when the narration should be shown. No lines means nothing can be restated, and empty narration means nothing
 * to show, and neither costs a call. An answer that is missing is an error for the caller to treat as "show it".
 */
export async function narrationAdds(input: {
  lines: AgentLine[];
  narration: string;
  judge: (request: JudgeRequest) => Promise<JudgeResult>;
}): Promise<boolean> {
  if (input.narration.trim() === "") return false;
  if (input.lines.length === 0) return true;
  const result = await input.judge(buildNarrationRequest(input.lines, input.narration));
  const probability = noulOf(result, NARRATION_ADDS);
  if (probability === null) throw new Error("the narration check came back without an answer");
  return probability >= NARRATION_ADDS_MIN;
}
