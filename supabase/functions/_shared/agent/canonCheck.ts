/**
 * The three checks on an invention (#1226 story 9, frame 09): when the Narrator puts an invention on the record,
 * it must not contradict a truth, must not answer an open question, and may hint at a secret only where a clue to it
 * lies, never state it. The judge is TypeSafe's Jev; it is the only reader besides the DM who is given a secret's
 * statement, and what comes back to the Narrator names the truth or the question and never the secret.
 *
 * A failed check answers with the reason and nothing is filed: the Narrator rephrases in the same reply. A judge that
 * cannot answer (no key, a timeout, an error) never blocks a fact: it is filed and the skip is logged, the stance the
 * narration check takes. Facts the server writes (a fight's result, a harvest) never come through here.
 *
 * Pure except for the injected judge.
 */

import { noulOf, type JudgeRequest, type JudgeResult, type NoulQuestion } from "../typesafe.ts";

/**
 * Where a finding counts. NOT measured: unlike the narration check's 0.85 these have no labelled set behind them
 * (17 Nov 2026 measured only that one). 0.8 refuses a clear finding and lets a borderline phrasing through, which
 * errs toward letting the story run; move the numbers when a labelled set from real play says otherwise.
 */
export const CANON_CONTRADICTS_MIN = 0.8;
export const CANON_ANSWERS_MIN = 0.8;
export const CANON_STATES_MIN = 0.8;
export const CANON_HINTS_MIN = 0.8;

/** Bounds: one judge request holds at most this many questions of each kind. */
export const MAX_TRUTHS_CHECKED = 24;
export const MAX_QUESTIONS_CHECKED = 12;
export const MAX_SECRETS_CHECKED = 12;
export const STATEMENT_MAX_CHARS = 400;
export const INVENTION_MAX_CHARS = 400;

/** What the checks hold the invention against. Read by the server, given to the judge, never to the Narrator. */
export interface CanonCheckMaterial {
  /** Every truth, known to all, to some or secret. A secret truth is still true: an invention may not contradict it. */
  truths: { text: string; secret: boolean }[];
  /** The titles of the open questions the DM keeps. */
  questions: string[];
  /** Each secret's statement, with the id its clues point at. */
  secrets: { id: string; statement: string }[];
}

export const NO_CHECK_MATERIAL: CanonCheckMaterial = { truths: [], questions: [], secrets: [] };

const cut = (text: string, max: number): string => (text.length > max ? text.slice(0, max) : text);

const truthKey = (i: number) => `contradicts_${i}`;
const questionKey = (i: number) => `answers_${i}`;
const statesKey = (i: number) => `states_${i}`;
const hintsKey = (i: number) => `hints_${i}`;

function noul(instructions: string, yes: string, no: string): NoulQuestion {
  return { type: "noul", instructions, criteria: { true: yes, false: no } };
}

/** The secrets that have no clue lying here: a hint at one of them has no place. */
function unclued(material: CanonCheckMaterial, clueSecretIds: ReadonlySet<string>): { i: number; id: string }[] {
  return material.secrets.slice(0, MAX_SECRETS_CHECKED).flatMap((s, i) => (clueSecretIds.has(s.id) ? [] : [{ i, id: s.id }]));
}

/** The judge request for one invention; null when there is nothing to hold it against. */
export function canonCheckRequest(invention: string, material: CanonCheckMaterial, clueSecretIds: ReadonlySet<string>): JudgeRequest | null {
  const truths = material.truths.slice(0, MAX_TRUTHS_CHECKED);
  const questions = material.questions.slice(0, MAX_QUESTIONS_CHECKED);
  const secrets = material.secrets.slice(0, MAX_SECRETS_CHECKED);
  if (truths.length === 0 && questions.length === 0 && secrets.length === 0) return null;

  const questionSet: Record<string, NoulQuestion> = {};
  truths.forEach((_, i) => {
    questionSet[truthKey(i)] = noul(
      `\`invention\` is a sentence a game master has just put on a campaign's record. \`truths[${i}]\` is a fact of the campaign's world. Does \`invention\` say something that cannot be so if \`truths[${i}]\` is so?`,
      "The invention contradicts that truth, denies it, or makes it impossible.",
      "The invention agrees with that truth, or has nothing to do with it.",
    );
  });
  questions.forEach((_, i) => {
    questionSet[questionKey(i)] = noul(
      `\`questions[${i}]\` is a mystery the campaign leaves open on purpose. Does \`invention\` settle it, by giving the answer it asks for?`,
      "The invention states who, what or why that the question asks, or an answer a reader would take for it.",
      "The invention does not answer it. Touching on its subject, or deepening the mystery, is not answering.",
    );
  });
  secrets.forEach((_, i) => {
    questionSet[statesKey(i)] = noul(
      `\`secrets[${i}]\` is something the players must not be told. Does \`invention\` state it, in whole or in its essential part, as a fact?`,
      "The invention says what that secret says, or the part of it that matters.",
      "The invention does not state it. A rumour, a hint, or a mention of its subject is not stating it.",
    );
  });
  for (const { i } of unclued(material, clueSecretIds)) {
    questionSet[hintsKey(i)] = noul(
      `\`secrets[${i}]\` is something the players must not be told. Does \`invention\` point toward it, so that a careful reader would begin to suspect it?`,
      "The invention points toward that secret, even without stating it.",
      "The invention has nothing to do with that secret.",
    );
  }

  return {
    state: {
      invention: cut(invention, INVENTION_MAX_CHARS),
      truths: truths.map((t) => cut(t.text, STATEMENT_MAX_CHARS)),
      questions: questions.map((q) => cut(q, STATEMENT_MAX_CHARS)),
      secrets: secrets.map((s) => cut(s.statement, STATEMENT_MAX_CHARS)),
    },
    questions: questionSet,
  };
}

const at = (result: JudgeResult, key: string, min: number): boolean => {
  const p = noulOf(result, key);
  return p !== null && p >= min;
};

/**
 * The reason an invention is refused, in words the Narrator can act on, or null when it stands. A secret outright is
 * refused first, then a contradiction, then an answered question, then a hint where no clue lies. A reason names a
 * truth or a question, and for a secret says only that it is one: the Narrator never learns what it says. A secret
 * truth is not named either.
 */
export function canonVerdict(material: CanonCheckMaterial, clueSecretIds: ReadonlySet<string>, result: JudgeResult): string | null {
  const secrets = material.secrets.slice(0, MAX_SECRETS_CHECKED);
  for (let i = 0; i < secrets.length; i++) {
    if (at(result, statesKey(i), CANON_STATES_MIN)) return "It states a secret. Only the DM reveals a secret. Nothing was filed: tell the story without it.";
  }
  const truths = material.truths.slice(0, MAX_TRUTHS_CHECKED);
  for (let i = 0; i < truths.length; i++) {
    if (!at(result, truthKey(i), CANON_CONTRADICTS_MIN)) continue;
    const t = truths[i];
    return `${t.secret ? "It contradicts a truth the DM keeps." : `It contradicts a truth: ${t.text.replace(/[.\s]+$/, "")}.`} Invent around it. Nothing was filed: rephrase and file it again.`;
  }
  const questions = material.questions.slice(0, MAX_QUESTIONS_CHECKED);
  for (let i = 0; i < questions.length; i++) {
    if (at(result, questionKey(i), CANON_ANSWERS_MIN)) {
      return `It answers an open question the DM keeps: ${questions[i].replace(/[.?\s]+$/, "")}. Leave it open. Nothing was filed: rephrase and file it again.`;
    }
  }
  for (const { i } of unclued(material, clueSecretIds)) {
    if (at(result, hintsKey(i), CANON_HINTS_MIN)) {
      return "It points toward a secret where no clue to it lies. A secret may be hinted at only where the DM placed a clue. Nothing was filed: rephrase and file it again.";
    }
  }
  return null;
}

/**
 * Holds one invention against the material. Returns `{ error }` to refuse it, null to let it be filed. A judge that
 * is missing, throws or gives no verdict lets it through and says so in the log: a narrator that cannot file is worse
 * than one that is sometimes unchecked.
 */
export async function checkInvention(input: {
  invention: string;
  material: CanonCheckMaterial;
  clueSecretIds: ReadonlySet<string>;
  judge: ((request: JudgeRequest) => Promise<JudgeResult>) | null;
  /** Where a skip is told; the handler's own log by default. */
  log?: (message: string, error?: unknown) => void;
}): Promise<{ error: string } | null> {
  const log = input.log ?? ((message, error) => console.error(message, error ?? ""));
  const request = canonCheckRequest(input.invention, input.material, input.clueSecretIds);
  if (request === null) return null;
  if (input.judge === null) {
    log("agent-turn: the canon check was skipped (no judge): the fact was filed unchecked.");
    return null;
  }
  let result: JudgeResult;
  try {
    result = await input.judge(request);
  } catch (error) {
    log("agent-turn: the canon check was skipped (the judge failed): the fact was filed unchecked.", error);
    return null;
  }
  const reason = canonVerdict(input.material, input.clueSecretIds, result);
  return reason === null ? null : { error: reason };
}
