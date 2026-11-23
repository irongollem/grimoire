/**
 * The narration check (#1021): which sentences of the narrator's text tell the player something the characters' lines
 * did not?
 *
 * Live, after characters had spoken, the narrator kept closing the turn by restating what they had just said or done
 * in its own words, right after the page showed the very line. Five rounds of instructions did not stop it, so the
 * handler holds that text back and asks this question instead, one sentence at a time: narrator text is usually a
 * mix (the outcome of the player's action, then a restated deed), and judged whole a mix scores high and all of it shows. Only the lines this turn showed and the narrator's own
 * text go to the judge, both already meant for the player.
 *
 * Pure except for the injected judge. The caller decides what a failed judgment means (the handler shows the text).
 */

import { noulOf, type JudgeRequest, type JudgeResult, type NoulQuestion } from "../typesafe.ts";
import { CANON_STATES_MIN, MAX_SECRETS_CHECKED, STATEMENT_MAX_CHARS } from "./canonCheck.ts";
import type { AgentLine } from "./types.ts";

/**
 * Where a sentence counts as adding something. Measured on 17 Nov 2026 with invented examples (jev-latest), one
 * question per sentence: sentences bringing an event, a roll's outcome, what the player's character perceives or a
 * plain detail of the place scored 0.92 to 0.99; sentences restating a character's line or deed, or saying someone
 * waits or watches, scored 0.10 to 0.25; borderline restatements that mention a bystander scored 0.52 to 0.77. The
 * line sits at 0.85, just under real narration. The set was small and invented: move the number when a labelled set
 * from real play says otherwise.
 */
export const NARRATION_ADDS_MIN = 0.85;

/** More sentences than this are rare; the first ones are judged and the rest are shown as they are (fail open). */
export const MAX_SENTENCES_JUDGED = 8;

/** The newest lines, each cut, and each sentence cut: a judgment is small and the page never needs more to decide. */
export const MAX_LINES_SENT = 12;
export const MAX_LINE_CHARS = 400;
export const MAX_SENTENCE_CHARS = 400;

const sentenceKey = (i: number): string => `s${i}`;
const leakKey = (i: number, j: number): string => `leak_${i}_${j}`;

/**
 * Asked of every judged sentence against every secret, in the same request as the repetition question. A secret that
 * reaches the page cannot be unshown, so this is the one check that also holds back text no character has spoken
 * beside. The statement goes to the judge only: it is never shown, logged or sent to the browser.
 */
function leakQuestion(i: number, j: number): NoulQuestion {
  return {
    type: "noul",
    instructions: `\`secrets[${j}]\` is something the players must not be told. \`sentences[${i}]\` is one sentence of narration about to be shown to them. Does that sentence state the secret, in whole or in its essential part, as a fact, so a reader learns it?`,
    criteria: {
      true: "The sentence says what that secret says, or the part of it that matters.",
      false: "The sentence does not state it. A rumour, a hint, or a mention of its subject is not stating it.",
    },
  };
}

function sentenceQuestion(i: number): NoulQuestion {
  return {
    type: "noul",
    instructions: `\`lines\` is what the reader has just been shown, in order: what characters said and did. \`sentences[${i}]\` is one sentence of the narration shown right after them. Does that sentence tell the reader something that \`lines\` do not already tell them?`,
    criteria: {
      true: "The sentence brings something new: a detail of the place, something that happens, the result of an action or a roll, a consequence, a change in the scene, or what the reader's own character perceives or finds (including that there is nothing to hear or see).",
      false: "The sentence only restates, summarises or rephrases what a character in `lines` said or did, says only that someone is waiting, watching or listening, or only asks the reader what they do next.",
    },
  };
}

function cut(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

const CLOSERS = new Set(['"', "'", "\u201D", "\u2019", ")", "]", "}"]);

/**
 * Sentences in order, trimmed, none empty. A sentence ends at . ! or ? (with any closing quote or bracket after it)
 * when whitespace or the end follows, so a decimal like 17.5 stays whole; "..." stays inside its sentence unless it
 * ends the text. Each line break also ends a sentence. A semicolon followed by whitespace ends one too, and stays on
 * the clause it closes: live, the narrator joined a restated deed to a real detail with a semicolon ("Cantor turns to
 * you; the lamp gutters"), and judged as one sentence the pair scored as new and both showed.
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let start = 0;
    let i = 0;
    while (i < paragraph.length) {
      const ch = paragraph[i];
      if (ch === ";" && i + 1 < paragraph.length && /\s/.test(paragraph[i + 1])) {
        out.push(paragraph.slice(start, i + 1).trim());
        start = i + 1;
        i++;
        continue;
      }
      if (ch !== "." && ch !== "!" && ch !== "?") {
        i++;
        continue;
      }
      let end = i;
      let dots = 0;
      while (end < paragraph.length && (paragraph[end] === "." || paragraph[end] === "!" || paragraph[end] === "?")) {
        if (paragraph[end] === ".") dots++;
        end++;
      }
      const ellipsis = dots >= 2 && end - i === dots;
      while (end < paragraph.length && CLOSERS.has(paragraph[end])) end++;
      const atEnd = end >= paragraph.length;
      if (atEnd || (!ellipsis && /\s/.test(paragraph[end]))) {
        // Never empty: the slice holds at least the terminator.
        out.push(paragraph.slice(start, end).trim());
        start = end;
      }
      i = end;
    }
    const rest = paragraph.slice(start).trim();
    if (rest !== "") out.push(rest);
  }
  return out;
}

export function buildNarrationRequest(lines: AgentLine[], sentences: string[], secrets: readonly string[] = []): JudgeRequest {
  const questions: Record<string, NoulQuestion> = {};
  sentences.forEach((_, i) => {
    // Without a line shown there is nothing to repeat: only the secret questions are asked.
    if (lines.length > 0) questions[sentenceKey(i)] = sentenceQuestion(i);
    secrets.forEach((_, j) => {
      questions[leakKey(i, j)] = leakQuestion(i, j);
    });
  });
  return {
    state: {
      lines: lines.slice(-MAX_LINES_SENT).map((l) => ({
        who: l.speaker.name,
        kind: l.kind === "spoken" ? "said" : "did",
        text: cut(l.text, MAX_LINE_CHARS),
      })),
      sentences: sentences.map((s) => cut(s, MAX_SENTENCE_CHARS)),
      secrets: secrets.map((statement) => cut(statement, STATEMENT_MAX_CHARS)),
    },
    questions,
  };
}

/**
 * The part of the narration to show. Blank narration is "" and, with no lines shown and no secrets to guard, the text
 * comes back whole without a call. Otherwise a sentence is dropped when it only repeats the lines (only judged once
 * a line was shown), or when it states one of `secrets` at CANON_STATES_MIN or above (judged with or without lines).
 * A sentence with no answer is kept, and sentences past the judged eighth are kept. When nothing is dropped the
 * original text comes back untouched, so spacing and paragraphs are not rewritten for nothing. A judge that throws is
 * for the caller to treat as "show it all". `onLeak` hears how many sentences were dropped for stating a secret,
 * never what the secret said.
 */
export async function narrationKept(input: {
  lines: AgentLine[];
  narration: string;
  judge: (request: JudgeRequest) => Promise<JudgeResult>;
  /** The campaign's secrets, as statements. Absent or empty: only the repetition check applies. */
  secrets?: readonly string[];
  onLeak?: (dropped: number) => void;
}): Promise<string> {
  if (input.narration.trim() === "") return "";
  const secrets = input.secrets === undefined ? [] : input.secrets.slice(0, MAX_SECRETS_CHECKED);
  if (input.lines.length === 0 && secrets.length === 0) return input.narration;
  const sentences = splitSentences(input.narration);
  const judged = sentences.slice(0, MAX_SENTENCES_JUDGED);
  const result = await input.judge(buildNarrationRequest(input.lines, judged, secrets));
  let leaks = 0;
  const keep = sentences.map((_, i) => {
    if (i >= judged.length) return true;
    const states = secrets.some((__, j) => {
      const p = noulOf(result, leakKey(i, j));
      return p !== null && p >= CANON_STATES_MIN;
    });
    if (states) {
      leaks++;
      return false;
    }
    if (input.lines.length === 0) return true;
    const probability = noulOf(result, sentenceKey(i));
    return probability === null || probability >= NARRATION_ADDS_MIN;
  });
  if (leaks > 0) input.onLeak?.(leaks);
  if (keep.every(Boolean)) return input.narration;
  return sentences
    .map((sentence, i) => (keep[i] ? mendClause(sentence, sentences[i - 1], keep[i - 1], keep[i + 1]) : null))
    .filter((sentence): sentence is string => sentence !== null)
    .join(" ");
}

/**
 * A kept clause whose neighbour across a semicolon was dropped is made a sentence again: it ends in a full stop when
 * what followed its semicolon is gone, and starts with a capital when what led up to it is gone.
 */
function mendClause(clause: string, before: string | undefined, beforeKept: boolean | undefined, afterKept: boolean | undefined): string {
  let out = clause;
  if (out.endsWith(";") && afterKept !== true) out = `${out.slice(0, -1)}.`;
  if (before?.endsWith(";") && beforeKept === false) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out;
}
