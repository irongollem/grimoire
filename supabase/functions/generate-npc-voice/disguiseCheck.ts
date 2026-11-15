/**
 * The disguise check on the Voice Coach's suggested lines (#1061).
 *
 * The true name is masked out of what the text model reads, but the backstory
 * still goes in, and nothing checked what came back: an epithet or a hint could
 * reach the DM's screen as a line to read aloud. With a TypeSafe key, each
 * suggested line of a disguised NPC is judged for whether it gives the hidden
 * identity away. A flagged line is never removed (the DM decides); the coach
 * shows a caution beside it. A failed judgment leaves the line unflagged, as
 * before this check existed, unless it speaks the true name outright.
 *
 * Pure: the judge is injected and nothing here throws.
 */

import type { JudgeRequest, NoulQuestion } from "../_shared/typesafe.ts";
import { runBounded } from "../import-match/judging.ts";

/**
 * Measured live on 15 Nov 2026 with 14 invented lines of one disguised NPC (7 that give the identity away, 7 that do
 * not, three of them repeating rumour about the hidden person): with the question below every revealing line scored
 * 0.49 or more and every safe one 0.34 or less. The first wording ("would someone hearing the line learn or suspect
 * what the hidden text describes?") missed 4 of the 7 at any threshold, because it asks about a listener's inference;
 * asking whether the SPEAKER lets something slip, with the cover named, is what separates "I have seen a granary
 * burn, a man does not forget what he ordered" from "they say the duke's men burned the granary".
 */
export const REVEAL_MIN_PROBABILITY = 0.4;
export const DISGUISE_JUDGE_CONCURRENCY = 8;
export const DISGUISE_JUDGE_DEADLINE_MS = 8_000;

export const REVEAL_QUESTION = "reveals";

export const REVEAL_QUESTION_BODY: NoulQuestion = {
  type: "noul",
  instructions: "The speaker of `line` is living under `cover` and hiding `secret`. Does `line` let slip something of `secret`?",
  criteria: {
    true: "The speaker uses their real name, or speaks from first-hand experience of the past in `secret` (having commanded, ordered, ruled or done those things).",
    false: "The line could be said by anyone living as `cover`, including repeating common rumour about other people.",
  },
};

/** What a disguised NPC hides, and what the party takes them for. */
export interface HiddenIdentity {
  realName: string;
  /** The backstory the prompt is told not to surface; may be empty. */
  past: string;
  /** The name the party knows them by. */
  cover: string;
}

export function buildHiddenIdentity(trueName: string, backstory: string, disguiseName: string): HiddenIdentity {
  return { realName: trueName.trim(), past: backstory.trim(), cover: disguiseName.trim() };
}

export function buildRevealRequest(line: string, hidden: HiddenIdentity): JudgeRequest {
  const secret = hidden.past ? { real_name: hidden.realName, past: hidden.past } : { real_name: hidden.realName };
  return { state: { line, secret, cover: `Known to everyone as ${hidden.cover}.` }, questions: { [REVEAL_QUESTION]: REVEAL_QUESTION_BODY } };
}

/** Words of a name too common to mean anything by themselves: titles and particles. */
const NAME_FILLER = new Set(["the", "of", "van", "von", "der", "den", "del", "de", "la", "le", "lord", "lady", "sir", "dame", "duke", "duchess", "king", "queen", "master", "mistress", "brother", "sister", "captain", "old"]);

/**
 * Whether the line speaks a word of the true name that the cover name does not share. Looked up in code, not asked:
 * it is an exact fact, and the model scored "You may call me Varric" at 0.49, the lowest of the revealing lines.
 */
export function speaksTrueName(line: string, hidden: HiddenIdentity): boolean {
  const words = (text: string): string[] => text.toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length >= 4 && !NAME_FILLER.has(w));
  const cover = new Set(words(hidden.cover));
  const spoken = new Set(words(line));
  return words(hidden.realName).some((w) => !cover.has(w) && spoken.has(w));
}

export interface RevealProbability {
  /** Probability that the line reveals the identity, or null when the answer was missing. */
  probability: number | null;
  inputTokens: number;
}

export interface DisguiseCheck {
  /** One flag per line, in order; false for a line that was not judged. */
  reveals: boolean[];
  inputTokens: number;
  judged: number;
}

export async function checkLinesForReveal(args: {
  lines: string[];
  hidden: HiddenIdentity;
  judgeReveal: (request: JudgeRequest, signal: AbortSignal) => Promise<RevealProbability>;
}): Promise<DisguiseCheck> {
  const { lines, hidden, judgeReveal } = args;
  const none: DisguiseCheck = { reveals: lines.map((line) => speaksTrueName(line, hidden)), inputTokens: 0, judged: 0 };
  try {
    const outcomes = await runBounded(
      lines.map((line) => (signal: AbortSignal) => judgeReveal(buildRevealRequest(line, hidden), signal)),
      { concurrency: DISGUISE_JUDGE_CONCURRENCY, deadlineMs: DISGUISE_JUDGE_DEADLINE_MS },
    );
    let inputTokens = 0;
    let judged = 0;
    const reveals = outcomes.map((o, i) => {
      // The name is checked whether or not the judgment came back.
      const named = speaksTrueName(lines[i], hidden);
      if (!o.done) return named;
      inputTokens += o.value.inputTokens;
      if (o.value.probability === null) return named;
      judged++;
      return named || o.value.probability >= REVEAL_MIN_PROBABILITY;
    });
    return { reveals, inputTokens, judged };
  } catch {
    return none;
  }
}
