/**
 * The roll check (#1021, #1205 "an uncertain action settled without a roll"): is the player's character attempting
 * something whose outcome is uncertain and where failure would matter?
 *
 * 5e calls for an ability check exactly then (SRD 5.1 "Ability Checks": the DM calls for one when "the outcome is
 * uncertain" and failure has a cost). The narrator sometimes told how such an attempt went without asking for a roll.
 * Narration has already streamed by the time that is known, so the turn is not re-run: the question is asked before
 * the narrator runs and a high answer adds one sentence to what it reads (a hint, not a ruling), and the handler logs
 * the fault when a flagged attempt still ended with no roll asked.
 *
 * Pure except for the injected judge. A judge that cannot answer never changes the turn.
 */

import { noulOf, type JudgeRequest, type JudgeResult, type NoulQuestion } from "../typesafe.ts";
import type { AgentBlock, AgentMessage, PlayerMove } from "./types.ts";

/**
 * Where an attempt counts as needing a roll. NOT measured: no labelled set exists yet (the narration check's 0.85 was
 * measured on 17 Nov 2026 with invented examples; this one has not been). 0.7 errs toward fewer hints, because a hint
 * on an attempt that needed none makes the narrator ask for pointless rolls, which is worse than the rare miss that
 * the logged fault will show. Move it when a labelled set from real play says otherwise.
 */
export const ROLL_NEEDED_MIN = 0.7;

/** What the narrator reads when an attempt is flagged. A hint: the narrator may still decide otherwise. */
export const ROLL_HINT =
  "The player's character is attempting something whose outcome is uncertain and where failing would matter. Call ask_roll before telling how it goes.";

/** The scene sent to the judge: only the narrator's last visible text, cut, so "I pick the lock" is judged where it happens. */
export const SCENE_MAX_CHARS = 400;
export const MESSAGE_MAX_CHARS = 400;

const QUESTION: NoulQuestion = {
  type: "noul",
  instructions:
    "`message` is what a player's character says or does at a table roleplaying game. `scene` is the last thing the narrator told, where it happens (it may be empty). Is the character attempting something whose outcome is uncertain, where failing would matter?",
  criteria: {
    true: "The character tries something that could fail and failure has a cost or consequence: picking a lock under watch, climbing a wet wall, sneaking past a guard, forcing a door, leaping a chasm, noticing something hidden. Speech that tries to persuade, deceive or intimidate someone counts as an attempt.",
    false: "The outcome is certain, trivial or impossible, nothing is at stake if it fails, or it is plain conversation, a question, walking through an open door or looking at what is in plain view.",
  },
};

function cut(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/** The narrator's newest visible text in the history: text the player was shown, from an assistant message. */
export function lastNarratorText(history: readonly AgentMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "assistant") continue;
    const text = history[i].blocks
      .filter((b): b is Extract<AgentBlock, { type: "text" }> => b.type === "text" && b.unshown !== true)
      .map((b) => b.text.trim())
      .filter((t) => t !== "")
      .join(" ");
    if (text !== "") return text;
  }
  return "";
}

export function rollCheckRequest(input: { mode: PlayerMove["kind"]; message: string; scene: string }): JudgeRequest {
  return {
    state: {
      mode: input.mode === "say" ? "says aloud" : "does",
      message: cut(input.message, MESSAGE_MAX_CHARS),
      // The tail is the part nearest the player's action.
      scene: input.scene.length > SCENE_MAX_CHARS ? input.scene.slice(-SCENE_MAX_CHARS) : input.scene,
    },
    questions: { roll: QUESTION },
  };
}

/** The probability the attempt needs a roll, or null when the judge gave no answer. */
export function needsRoll(result: JudgeResult): number | null {
  return noulOf(result, "roll");
}

/**
 * Which messages are judged: the player's own say or do, with words in it, that does not answer a roll, outside a
 * fight (a fight has its own rolls). The turns the page asks for on its own (opening, aftermath, listening, a helper's
 * or a foe's line) carry no words of the player's (`turnBody.ts` refuses any), so the empty-message rule skips them.
 */
export function isJudgedForRoll(input: {
  mode: PlayerMove["kind"];
  message: string;
  answersRoll: boolean;
  fightRunning: boolean;
}): boolean {
  if (input.mode !== "say" && input.mode !== "do") return false;
  if (input.message.trim() === "") return false;
  return !input.answersRoll && !input.fightRunning;
}

/**
 * The probability to act on: the judge's answer when it is at or above ROLL_NEEDED_MIN, else null. Fails open: no
 * judge, a throw (logged, without the player's text), a judgment slower than `limitMs` or a missing answer all give
 * null, so the turn runs exactly as it did before this check.
 */
export async function flaggedForRoll(input: {
  judge: ((request: JudgeRequest) => Promise<JudgeResult>) | null;
  request: JudgeRequest;
  limitMs: number;
}): Promise<number | null> {
  if (input.judge === null) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), input.limitMs);
  });
  const asked = input
    .judge(input.request)
    .then((result) => needsRoll(result))
    .catch((error: unknown) => {
      console.warn("agent-turn: the roll check was skipped (the judge failed).", error);
      return null;
    });
  try {
    const p = await Promise.race([asked, slow]);
    return p !== null && p >= ROLL_NEEDED_MIN ? p : null;
  } finally {
    clearTimeout(timer);
  }
}
