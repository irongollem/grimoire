// Ask's `read_rules` (#1253 follow-up): the pure half. A rules question is answered from the campaign's own enabled
// books, in its edition, never from the model's memory. This file holds what has no database in it: the search terms
// out of a question, the ranking of what the books returned, the cut that keeps an answer short, and the words the
// model is handed. The reads themselves are `askRulesRead.ts`.

/** What `read_rules` may be asked for. `any` looks in the rules and conditions first, then in the rest. */
export const RULES_KINDS = ["rule", "condition", "spell", "monster", "item", "any"] as const;
export type RulesKind = (typeof RULES_KINDS)[number];
export type RulesHitKind = Exclude<RulesKind, "any">;

export const RULES_QUERY_MAX = 200;
/** A rules answer is a few passages; more only buries the one the DM asked about. */
export const RULES_HITS_MAX = 4;
/** One hit's text. Long enough for a whole spell or a rule with its examples, short enough that four fit a turn. */
export const RULES_TEXT_MAX = 3500;
const TERMS_MAX = 5;

export interface RulesCandidate {
  kind: RulesHitKind;
  name: string;
  /** The `content_sources` key of the book it came from. */
  source: string;
  text: string;
}

export interface RulesHit extends RulesCandidate {
  /** The book's title (`content_sources.title`); null when the source has none, never a stand-in label. */
  sourceTitle: string | null;
}

/** What the reader found, or why it did not look. */
export type RulesRead =
  | { status: "no_system" }
  | { status: "ok"; edition: "2014" | "2024"; hits: RulesHit[]; /** The titles of the books the campaign has enabled. */ books: string[] };

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "for", "with", "is", "are", "was", "be", "do", "does",
  "how", "what", "when", "which", "who", "can", "i", "my", "me", "it", "its", "this", "that", "work", "works", "rule",
  "rules", "there", "any", "about", "if", "as", "by", "from", "you", "your", "they", "their", "have", "has",
]);

/**
 * The words worth looking for in a question, lower-case letters and digits only. Only those: the terms go into
 * PostgREST filter strings, where a comma or a parenthesis would change the filter, so none can survive. Order is
 * kept, and the first few are enough.
 */
export function searchTerms(query: string): string[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, TERMS_MAX);
}

function countIn(haystack: string, terms: readonly string[]): number {
  const lower = haystack.toLowerCase();
  return terms.filter((t) => lower.includes(t)).length;
}

/**
 * Name hits before body hits, then the passage that matches more of the words. The database only narrowed by any
 * word; this is what puts the entry called "Grappling" above a rule that mentions grappling in passing.
 */
export function rankCandidates<T extends RulesCandidate>(candidates: readonly T[], terms: readonly string[]): T[] {
  return candidates
    .map((c, order) => ({ c, order, inName: countIn(c.name, terms), inText: countIn(c.text, terms) }))
    .filter((r) => r.inName > 0 || r.inText > 0)
    .sort((a, b) => (b.inName > 0 ? 1 : 0) - (a.inName > 0 ? 1 : 0) || b.inName - a.inName || b.inText - a.inText || a.order - b.order)
    .map((r) => r.c);
}

/** The text kept to its limit, cut at the last paragraph that fits, and marked as cut so the model does not take it for the whole. */
export function capText(raw: string, max: number = RULES_TEXT_MAX): string {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const paragraph = head.lastIndexOf("\n\n");
  const line = head.lastIndexOf("\n");
  const space = head.lastIndexOf(" ");
  // A paragraph break is the right place; a half-empty first paragraph is not worth keeping it for.
  const at = paragraph > max * 0.4 ? paragraph : line > max * 0.4 ? line : space > 0 ? space : max;
  return `${head.slice(0, at).trimEnd()}\n[The book goes on; this is the first part.]`;
}

/** What the model reads back from `read_rules`. */
export function rulesAnswer(query: string, read: RulesRead): string {
  if (read.status === "no_system") {
    return JSON.stringify({ query, hits: [], note: "This campaign plays no rules system, so there is no rules library to read. Say so. Anything you add is general knowledge, not from the campaign's books." });
  }
  if (read.hits.length === 0) {
    const books = read.books.length > 0
      ? `The campaign's enabled books (${read.books.join(", ")}) do not cover it.`
      : "The campaign has no rules book enabled.";
    return JSON.stringify({ query, edition: read.edition, hits: [], note: `${books} Tell the DM the campaign's books do not cover it. If you add anything from general knowledge, mark it plainly as not from their books, and keep it to the ${read.edition} rules.` });
  }
  return JSON.stringify({
    query,
    edition: read.edition,
    note: `These passages are from the campaign's own enabled books, in the ${read.edition} rules. Answer from them and name the book. Do not mix in the other edition or what you remember.`,
    hits: read.hits.map((h) => ({ kind: h.kind, name: h.name, book: h.sourceTitle ?? "an enabled book", text: h.text })),
  });
}
