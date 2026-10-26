/**
 * Global search by words (#1084): "who worships the drowned lady", "who controls
 * the crossing", "members of the toll-men", "harl's rivals". The query holds a
 * catalogue word and a name; the word says which tie, the name says whose.
 * Plain matching over the catalogue, so it works on every plan and calls no model.
 *
 * Grammar. The query is lowercased, possessives are dropped ("harl's" is "harl")
 * and split into tokens. A catalogue word is its head plus an optional trailing
 * particle ("member of" is head `member`, particle `of`; "seen as a rival by" is
 * head `seen as a rival`, particle `by`). It matches when the head's tokens occur
 * in a row, the last one in singular or plural ("rival", "rivals", "worships",
 * "worship"), followed by the particle if present; the particle may be missing
 * ("harl's rivals"). The longest match wins, and every catalogue word spelling
 * that same span answers. The words that remain, minus filler such as "who",
 * "the" and "of", are the name.
 *
 * Reading. The matched word describes the far end towards the name: "members of
 * the toll-men" is "X member of the Toll-men", "who worships the drowned lady" is
 * "X worships the Drowned Lady". Matching the word's forward spelling means the
 * far end is the stored `from` end and the name is the `to` end, so on the name's
 * own sheet the row is not `outward`; matching the reverse spelling is the other
 * way round. A symmetric word matches either way.
 */
import { QUEST_RECORDS, WORLD_LINK_PAIRS } from "@edge-shared/worldLinkCatalogue.ts";

/** One catalogue word a query can hold, read as the far end speaking of the name. */
export interface TieWord {
  /** The catalogue key, as `Connection.type`. */
  key: string;
  /** The word as written in the catalogue: "worships", "member of". */
  word: string;
  /** Whether the matching row is `outward` on the name's sheet. Ignored when `symmetric`. */
  outward: boolean;
  /** Reads the same from both ends, so the row's direction does not matter. */
  symmetric: boolean;
}

export interface TieQuery {
  words: TieWord[];
  /** The rest of the query: whose ties to read. */
  name: string;
}

interface VocabEntry extends TieWord {
  head: string[];
  particle: string | null;
  /** A one-token head that is also everyday speech, so only the whole phrase counts. */
  phraseOnly: boolean;
}

const PARTICLES = new Set(["of", "by", "to", "with", "in", "at", "from", "for"]);
/** Heads that would turn "who is at the inn" or "where is Harl" into a tie query. */
const PHRASE_ONLY_HEADS = new Set(["is", "set", "seen", "quest", "bound", "sworn"]);
/** Catalogue words too ordinary to mean a tie on their own. */
const NEVER_WORDS = new Set(["where"]);

const FILLER = new Set([
  "who", "whom", "whose", "what", "which", "that", "are", "is", "was", "were", "all", "the", "a", "an",
  "of", "by", "to", "with", "in", "at", "from", "for", "me", "show", "list", "find", "and", "has", "have", "does", "do",
]);

function splitWord(word: string): { head: string[]; particle: string | null } {
  const tokens = word.toLowerCase().split(/\s+/);
  const last = tokens[tokens.length - 1];
  if (tokens.length > 1 && PARTICLES.has(last)) return { head: tokens.slice(0, -1), particle: last };
  return { head: tokens, particle: null };
}

function buildVocabulary(): VocabEntry[] {
  const out: VocabEntry[] = [];
  const seen = new Set<string>();
  const add = (key: string, word: string, outward: boolean, symmetric: boolean) => {
    if (NEVER_WORDS.has(word.toLowerCase())) return;
    const id = `${key}|${word}|${outward}`;
    if (seen.has(id)) return;
    seen.add(id);
    const { head, particle } = splitWord(word);
    out.push({ key, word, outward, symmetric, head, particle, phraseOnly: head.length === 1 && PHRASE_ONLY_HEADS.has(head[0]) });
  };
  const addType = (key: string, forward: string, reverse: string, symmetric: boolean) => {
    add(key, forward, false, symmetric);
    if (!symmetric) add(key, reverse, true, false);
  };
  for (const pair of WORLD_LINK_PAIRS) {
    for (const t of pair.types) addType(t.key, t.forward, t.reverse, t.symmetric === true);
    for (const r of pair.records ?? []) addType(r.key, r.forward, r.reverse, r.forward === r.reverse);
  }
  for (const r of QUEST_RECORDS) addType(r.key, r.forward, r.reverse, r.forward === r.reverse);
  return out;
}

const VOCABULARY = buildVocabulary();

/** "rivals" and "rival", "worships" and "worship", "boxes" and "box" read the same. */
function stem(token: string): string {
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/['’]/g, "")
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((t) => t.length > 0);
}

interface Span {
  entry: VocabEntry;
  start: number;
  /** One past the last token the word used, particle included. */
  end: number;
}

function matchAt(tokens: string[], start: number, entry: VocabEntry): Span | null {
  const { head, particle } = entry;
  for (let i = 0; i < head.length; i++) {
    const token = tokens[start + i];
    if (token === undefined) return null;
    const isLast = i === head.length - 1;
    if (isLast ? stem(token) !== stem(head[i]) : token !== head[i]) return null;
  }
  let end = start + head.length;
  if (particle !== null) {
    if (tokens[end] === particle) end += 1;
    else if (entry.phraseOnly) return null;
  }
  return { entry, start, end };
}

function trimFiller(tokens: string[]): string[] {
  let from = 0;
  let to = tokens.length;
  while (from < to && FILLER.has(tokens[from])) from += 1;
  while (to > from && FILLER.has(tokens[to - 1])) to -= 1;
  return tokens.slice(from, to);
}

/**
 * Reads a search box query as a tie question, or returns null when it holds no
 * catalogue word or no name to ask about.
 */
export function parseTieQuery(query: string): TieQuery | null {
  const tokens = tokenize(query);
  if (tokens.length < 2) return null;

  let best: Span[] = [];
  let bestLength = 0;
  for (let start = 0; start < tokens.length; start++) {
    for (const entry of VOCABULARY) {
      const span = matchAt(tokens, start, entry);
      if (!span) continue;
      const length = span.end - span.start;
      if (length > bestLength) {
        best = [span];
        bestLength = length;
      } else if (length === bestLength && best[0].start === span.start) {
        best.push(span);
      }
    }
  }
  if (best.length === 0) return null;

  const { start, end } = best[0];
  const name = trimFiller([...tokens.slice(0, start), ...tokens.slice(end)]).join(" ");
  if (name.length === 0) return null;

  const words: TieWord[] = [];
  for (const { entry } of best) {
    if (words.some((w) => w.key === entry.key && w.outward === entry.outward)) continue;
    words.push({ key: entry.key, word: entry.word, outward: entry.outward, symmetric: entry.symmetric });
  }
  return { words, name };
}

/** Whether a connection row answers one of the parsed words. */
export function rowMatchesTie(row: { type: string; outward: boolean }, words: readonly TieWord[]): TieWord | null {
  return words.find((w) => w.key === row.type && (w.symmetric || w.outward === row.outward)) ?? null;
}
