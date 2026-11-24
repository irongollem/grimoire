/**
 * The name check (#1021, #1205 "a name the world does not have"): the narrator named a person or place the campaign
 * has no record of and never introduced them, so the name lives only in the story text and is lost to continuity.
 *
 * At the start of a turn the narration the player was shown last turn is read for proper names in code, every name the
 * campaign already knows is dropped (the caller's lookup), the rest go to the judge in one request ("is this the name
 * of a specific person or place?", because capitals alone also mark exclamations and common words) and what passes is
 * told to the narrator as one sentence: a person gets a record with `introduce`, anything else a fact with `record`, or
 * the name is left out. A hint, not a ruling.
 *
 * Pure except for the injected lookup and judge. Anything that cannot answer never changes the turn.
 */

import { noulOf, type JudgeRequest, type JudgeResult, type NoulQuestion } from "../typesafe.ts";

/**
 * Where a candidate counts as really being a name. NOT measured: no labelled set exists yet. 0.8 errs toward fewer
 * hints, because a hint about a word that is no name makes the narrator file a record for nothing, which is worse than
 * the rare miss a logged fault will show. Move it when a labelled set from real play says otherwise.
 */
export const UNKNOWN_NAME_MIN = 0.8;

/** How many candidates one turn asks about: one Noul each, so this bounds the judge's work. */
export const NAME_CANDIDATES_MAX = 8;

/** The narration sent to the judge, cut: the names come from the same stretch. */
export const NARRATION_MAX_CHARS = 1_500;

/** Words that are capitalised without being a name: sentence openers, pronouns, calendar words, common table words. */
const STOP_WORDS = new Set([
  "i", "i'm", "i'll", "i've", "i'd", "a", "an", "the", "and", "but", "or", "nor", "so", "yet", "for", "if", "then", "when", "while",
  "as", "at", "by", "in", "on", "of", "to", "from", "with", "without", "into", "onto", "upon", "over", "under", "after", "before",
  "he", "she", "it", "they", "we", "you", "his", "her", "hers", "its", "their", "theirs", "our", "ours", "your", "yours", "my", "mine",
  "him", "them", "us", "me", "who", "whom", "whose", "what", "which", "where", "why", "how", "this", "that", "these", "those",
  "there", "here", "now", "once", "just", "still", "yes", "no", "not", "oh", "ah", "well", "please", "thank", "thanks", "very",
  "some", "any", "all", "each", "every", "both", "one", "two", "three", "another", "other", "something", "nothing", "everything",
  "someone", "anyone", "everyone", "nobody", "somewhere", "perhaps", "maybe", "suddenly", "meanwhile", "outside", "inside",
  "behind", "beside", "beyond", "below", "above", "around", "across", "through", "toward", "towards", "against", "between",
  "is", "are", "was", "were", "be", "been", "do", "does", "did", "have", "has", "had", "will", "would", "can", "could", "should",
  "may", "might", "must", "shall", "let", "come", "look", "listen", "wait", "stop", "go", "take", "give", "tell", "see", "hold",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "june", "july", "august", "september", "october", "november", "december",
  "dawn", "dusk", "morning", "evening", "night", "day", "gods", "god", "lord", "lady", "sir", "master", "mistress", "madam",
  "captain", "king", "queen", "prince", "princess", "duke", "duchess", "mother", "father", "brother", "sister", "old", "young",
]);

/** Words that may sit inside a name ("Duke of Ashfield", "Ravi de la Cruz"), never at its start or end. */
const CONNECTORS = new Set(["of", "the", "de", "del", "della", "di", "da", "du", "la", "le", "van", "von", "der", "den", "al", "el", "bin", "ibn"]);

/** A title alone is not a name: "Master" in "the Master nodded" names nobody. With a name after it, it stays in the run. */
const TITLES = new Set([
  "master", "mistress", "lord", "lady", "sir", "madam", "captain", "king", "queen", "prince", "princess", "duke", "duchess",
  "mother", "father", "brother", "sister", "old", "young", "good", "great",
]);

const WORD = /[\p{L}][\p{L}'’-]*/gu;
const QUOTES = new Set(['"', "“", "‘", "'", "«", "(", "["]);

interface Token {
  text: string;
  lower: string;
  capitalised: boolean;
  /** Starts a sentence or follows an opening quote: its capital proves nothing. */
  initial: boolean;
  start: number;
  end: number;
}

function tokenise(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(WORD)) {
    const start = m.index;
    // A trailing possessive is not part of the name.
    const word = m[0].replace(/['’]s$/i, "").replace(/[-'’]+$/, "");
    if (word === "") continue;
    const before = text.slice(0, start);
    const prevChar = before.length > 0 ? before[before.length - 1] : "";
    const trimmed = before.trimEnd();
    const lastSignificant = trimmed.replace(/["”’'»)\]]+$/, "");
    const initial =
      before.trim() === "" ||
      QUOTES.has(prevChar) ||
      /[.!?…:]$/.test(lastSignificant) ||
      /\n\s*$/.test(before);
    tokens.push({
      text: word,
      lower: word.toLowerCase(),
      capitalised: /^\p{Lu}/u.test(word),
      initial,
      start,
      end: start + word.length,
    });
  }
  return tokens;
}

/**
 * Candidate proper names in `text`, in order of appearance, at most NAME_CANDIDATES_MAX.
 *
 * A name is a run of capitalised words, joined by single spaces, with connectors ("of", "de", "van") allowed inside.
 * A lone capitalised word that opens a sentence or a quotation is dropped: its capital proves nothing, and when it is
 * a name it is capitalised mid-sentence elsewhere and found there. Stop words and titles standing alone are dropped.
 */
export function candidateNames(text: string): string[] {
  const tokens = tokenise(text);
  const found: string[] = [];
  const seen = new Set<string>();
  const push = (name: string) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push(name);
  };

  let i = 0;
  while (i < tokens.length) {
    const first = tokens[i];
    if (!first.capitalised) { i++; continue; }
    // Extend the run: capitalised words, or connectors that are followed by a capitalised word.
    let j = i;
    let end = i;
    while (j + 1 < tokens.length) {
      const gap = text.slice(tokens[j].end, tokens[j + 1].start);
      if (gap !== " ") break;
      const next = tokens[j + 1];
      if (next.capitalised) { j++; end = j; continue; }
      if (CONNECTORS.has(next.lower)) {
        // Up to two connectors in a row ("Tower of the Moon"), then a capital.
        let k = j + 1;
        while (k < tokens.length && CONNECTORS.has(tokens[k].lower) && text.slice(tokens[k - 1].end, tokens[k].start) === " " && k - j <= 2) k++;
        if (k < tokens.length && tokens[k].capitalised && text.slice(tokens[k - 1].end, tokens[k].start) === " ") { j = k; end = k; continue; }
      }
      break;
    }
    let run = tokens.slice(i, end + 1);
    i = end + 1;
    // A run opens on a stop word or a title that has nothing after it to be a title of ("Then Floss" -> "Floss").
    while (run.length > 0 && STOP_WORDS.has(run[0].lower) && !(TITLES.has(run[0].lower) && run.length > 1)) {
      // What follows an opener that began the sentence is, in effect, the sentence's first word too.
      const opened = run[0].initial;
      run = run.slice(1);
      if (opened && run.length > 0) run[0] = { ...run[0], initial: true };
    }
    while (run.length > 0 && (STOP_WORDS.has(run[run.length - 1].lower) || CONNECTORS.has(run[run.length - 1].lower))) run = run.slice(0, -1);
    if (run.length === 0) continue;
    // One capitalised word that only opens a sentence or a quotation proves nothing.
    if (run.length === 1 && run[0].initial) continue;
    if (run.length === 1 && TITLES.has(run[0].lower)) continue;
    push(text.slice(run[0].start, run[run.length - 1].end));
    if (found.length >= NAME_CANDIDATES_MAX) break;
  }
  return found;
}

/**
 * The part of a candidate a record would hold: its leading titles dropped ("Lord Ashfield" is the record "Ashfield"),
 * so a name told with its title is still found as known (#1268 review). A title alone is never a candidate.
 */
export function nameCore(name: string): string {
  const words = name.trim().split(/\s+/);
  while (words.length > 1 && TITLES.has(words[0].toLowerCase())) words.shift();
  return words.join(" ");
}

function questionFor(name: string): NoulQuestion {
  return {
    type: "noul",
    instructions: `\`narration\` is what a storyteller told the players at a table roleplaying game. Is "${name}" used in it as the name of a specific person, creature, group or place in the story?`,
    criteria: {
      true: `"${name}" names someone or somewhere in the story: a character, a monster, a faction, a town, an inn, a river.`,
      false: `"${name}" is a common noun, an exclamation, a title standing alone, the start of a sentence, or a god's name in an oath.`,
    },
  };
}

const keyOf = (i: number): string => `name_${i}`;

/** One request, one Noul per name. */
export function nameCheckRequest(input: { narration: string; names: readonly string[] }): JudgeRequest {
  const questions: Record<string, NoulQuestion> = {};
  input.names.forEach((name, i) => { questions[keyOf(i)] = questionFor(name); });
  return {
    state: { narration: input.narration.length > NARRATION_MAX_CHARS ? input.narration.slice(-NARRATION_MAX_CHARS) : input.narration },
    questions,
  };
}

/** The names the judge is at least UNKNOWN_NAME_MIN sure are names. A missing answer is not a name. */
export function namesJudged(result: JudgeResult, names: readonly string[]): string[] {
  return names.filter((_, i) => {
    const p = noulOf(result, keyOf(i));
    return p !== null && p >= UNKNOWN_NAME_MIN;
  });
}

/** The one sentence the narrator reads. Plain: the names are the story's own. */
export function unknownNamesHint(names: readonly string[]): string {
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  // `introduce` makes a person; a place, a group or a thing goes on record as a fact (#1268 review: the hint sent every
  // name to `introduce`, which would have made an NPC called "Saltmarsh Ferry").
  return `Last turn you named ${list}, which the campaign has no record of. If they will matter, give a person or creature a record with introduce, and put a place, group or thing on record with record; otherwise leave them unnamed.`;
}

/**
 * The names last turn's narration used that the campaign does not know and the judge says are names. Fails open: no
 * narration, no candidates, all known, no judge, a throw (logged, without the story text), a lookup and judgment
 * together slower than `limitMs` or a missing answer all give an empty list, so the turn runs as it did before.
 */
export async function unknownNames(input: {
  narration: string;
  /** Which of these the campaign already has a record of. */
  known: (candidates: string[]) => Promise<string[]>;
  judge: ((request: JudgeRequest) => Promise<JudgeResult>) | null;
  limitMs: number;
}): Promise<string[]> {
  if (input.judge === null || input.narration.trim() === "") return [];
  const candidates = candidateNames(input.narration);
  if (candidates.length === 0) return [];
  const judge = input.judge;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<string[]>((resolve) => {
    timer = setTimeout(() => resolve([]), input.limitMs);
  });
  const asked = (async (): Promise<string[]> => {
    const knownLower = new Set((await input.known(candidates)).map((n) => n.toLowerCase()));
    const unknown = candidates.filter((c) => !knownLower.has(c.toLowerCase()));
    if (unknown.length === 0) return [];
    const result = await judge(nameCheckRequest({ narration: input.narration, names: unknown }));
    return namesJudged(result, unknown);
  })().catch((error: unknown) => {
    console.warn("agent-turn: the name check was skipped (the lookup or the judge failed).", error);
    return [];
  });
  try {
    return await Promise.race([asked, slow]);
  } finally {
    clearTimeout(timer);
  }
}
