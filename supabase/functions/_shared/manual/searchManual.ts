// Search of the in-app manual for Ask's `read_manual` tool (#1253 follow-up). Pure: the pages come in as a list.
//
// Not a vector search on purpose: the manual is 88 pages the team writes, with keywords per page, and a ranked match on
// words is explainable and costs nothing per question. Terms are matched by stem so "connections" finds "connection",
// and a term that appears on most pages ("known", "page") counts for less than one that appears on few.

import type { ManualPageSource } from "./buildIndex.ts";

export interface ManualHit {
  id: string;
  title: string;
  section: string;
  /** The page's own Markdown, cut to what fits, the parts that hold the query's words first. */
  text: string;
}

/** About how much of a page an answer gets. A whole manual page is up to 15 KB, which one turn cannot afford. */
export const MANUAL_TEXT_MAX = 6000;
const INTRO_MAX = 800;
const QUERY_MAX = 300;

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "for", "with", "is", "are", "was", "were", "be", "it", "its",
  "this", "that", "these", "those", "i", "my", "me", "we", "you", "your", "do", "does", "did", "can", "could", "how", "what",
  "which", "who", "when", "where", "why", "if", "so", "as", "by", "from", "about", "there", "have", "has", "should", "would",
  "mean", "means", "grimoire", "app", "tome",
]);

function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (word.length > suffix.length + 3 && word.endsWith(suffix)) return word.slice(0, -suffix.length);
  }
  return word;
}

function termsOf(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || STOP_WORDS.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

/** Whether a page word is the query term: the same stem, or a longer word that starts with a term of four letters or more. */
function matches(term: string, word: string): boolean {
  return word === term || (term.length >= 4 && word.startsWith(term));
}

function countMatches(term: string, words: readonly string[]): number {
  let n = 0;
  for (const w of words) if (matches(term, w)) n++;
  return n;
}

interface Indexed {
  page: ManualPageSource;
  title: string[];
  keywords: string[];
  summary: string[];
  body: string[];
}

const WEIGHT = { title: 8, keywords: 5, summary: 3, body: 1 } as const;
/** A body repeating a word fifty times is not fifty times as relevant as one that says it five times. */
const BODY_HITS_MAX = 5;

function scorePage(terms: readonly string[], p: Indexed, idf: ReadonlyMap<string, number>): number {
  let score = 0;
  for (const term of terms) {
    const weight = idf.get(term) ?? 1;
    const raw =
      WEIGHT.title * Math.min(countMatches(term, p.title), 1) +
      WEIGHT.keywords * Math.min(countMatches(term, p.keywords), 1) +
      WEIGHT.summary * Math.min(countMatches(term, p.summary), 1) +
      WEIGHT.body * Math.min(countMatches(term, p.body), BODY_HITS_MAX);
    score += raw * weight;
  }
  return score;
}

/** Splits a body into its intro and its headed sections, each keeping its heading line. */
function sectionsOf(body: string): string[] {
  const parts = body.split(/\n(?=#{1,6} )/);
  return parts.filter((s) => s.trim() !== "");
}

/** The page's text, cut to `max`: the intro first, then the sections that hold the terms, kept in the page's own order. */
export function excerptOf(body: string, terms: readonly string[], max = MANUAL_TEXT_MAX): string {
  if (body.length <= max) return body;
  const sections = sectionsOf(body);
  const ranked = sections.map((text, index) => {
    const heading = text.split("\n", 1)[0];
    const headingWords = termsOf(heading);
    const words = termsOf(text);
    let score = 0;
    for (const t of terms) score += 3 * Math.min(countMatches(t, headingWords), 1) + Math.min(countMatches(t, words), 3);
    return { text, index, score };
  });
  const chosen = new Map<number, string>();
  let used = 0;
  const take = (index: number, text: string, limit: number) => {
    const room = Math.min(limit, max - used);
    if (room < 200) return;
    const piece = text.length <= room ? text : `${text.slice(0, room).trimEnd()} ...`;
    chosen.set(index, piece);
    used += piece.length + 2;
  };
  // The first section is the page's own introduction: it says what the page is, whatever the question was.
  take(0, ranked[0].text, INTRO_MAX);
  for (const s of [...ranked].sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (s.score === 0 || chosen.has(s.index)) continue;
    take(s.index, s.text, max);
  }
  return [...chosen.entries()].sort((a, b) => a[0] - b[0]).map(([, text]) => text).join("\n\n");
}

export function searchManual(query: string, pages: readonly ManualPageSource[], limit = 3): ManualHit[] {
  const terms = [...new Set(termsOf(query.slice(0, QUERY_MAX)))];
  if (terms.length === 0) return [];
  const indexed: Indexed[] = pages.map((page) => ({
    page,
    title: termsOf(page.title),
    keywords: page.keywords.flatMap(termsOf),
    summary: termsOf(page.summary),
    body: termsOf(page.body),
  }));
  const idf = new Map<string, number>();
  for (const term of terms) {
    const df = indexed.filter((p) => [p.title, p.keywords, p.summary, p.body].some((w) => countMatches(term, w) > 0)).length;
    idf.set(term, Math.log(1 + indexed.length / (1 + df)));
  }
  return indexed
    .map((p) => ({ p, score: scorePage(terms, p, idf) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (a.p.page.id < b.p.page.id ? -1 : 1))
    .slice(0, limit)
    .map(({ p }) => ({ id: p.page.id, title: p.page.title, section: p.page.section, text: excerptOf(p.page.body, terms) }));
}
