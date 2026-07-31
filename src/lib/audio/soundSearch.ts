/**
 * Ranking for the soundboard command palette.
 *
 * Deliberately not a fuzzy matcher. The palette exists to be fired mid-session
 * without looking, which means the DM has to be able to predict what the top
 * hit will be from the letters they typed. Subsequence matching ranks "thunder"
 * above "the hunter's door" for the query "thd" and is impressive right up until
 * it plays the wrong thing in front of six people.
 *
 * So: exact, prefix, word-prefix, substring — in that order, on name first,
 * then tags, then a secondary field (artist, or a playlist's track count).
 */

export interface MatchFields {
  name: string;
  tags?: readonly string[];
  /** Artist, playlist description — matched last and scored lowest. */
  secondary?: string | null;
}

const SCORE_NAME_EXACT = 1000;
const SCORE_NAME_PREFIX = 800;
const SCORE_NAME_WORD_PREFIX = 600;
const SCORE_NAME_SUBSTRING = 400;
const SCORE_TAG_EXACT = 350;
const SCORE_TAG_PREFIX = 300;
const SCORE_TAG_SUBSTRING = 250;
const SCORE_SECONDARY = 200;

function normalise(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Split a query into terms; every term must match for the entry to qualify. */
export function queryTerms(query: string): string[] {
  const cleaned = normalise(query);
  return cleaned === "" ? [] : cleaned.split(" ");
}

function scoreName(name: string, term: string): number | null {
  if (name === term) return SCORE_NAME_EXACT;
  if (name.startsWith(term)) {
    // Shorter names win among prefix matches: typing "rain" should surface
    // "Rain" ahead of "Rain on a tin roof, distant thunder".
    return SCORE_NAME_PREFIX - Math.min(name.length, 100);
  }
  if (name.split(" ").some((word) => word.startsWith(term))) return SCORE_NAME_WORD_PREFIX;
  if (name.includes(term)) return SCORE_NAME_SUBSTRING;
  return null;
}

function scoreTags(tags: readonly string[], term: string): number | null {
  let best: number | null = null;
  for (const raw of tags) {
    const tag = normalise(raw);
    const score =
      tag === term
        ? SCORE_TAG_EXACT
        : tag.startsWith(term)
          ? SCORE_TAG_PREFIX
          : tag.includes(term)
            ? SCORE_TAG_SUBSTRING
            : null;
    if (score !== null && (best === null || score > best)) best = score;
  }
  return best;
}

/**
 * Score one entry against one term, taking the best field. Null when the term
 * appears nowhere — one unmatched term disqualifies the whole entry.
 */
function scoreTerm(fields: MatchFields, term: string): number | null {
  const nameScore = scoreName(normalise(fields.name), term);
  if (nameScore !== null) return nameScore;

  if (fields.tags) {
    const tagScore = scoreTags(fields.tags, term);
    if (tagScore !== null) return tagScore;
  }

  const secondary = fields.secondary;
  if (secondary !== undefined && secondary !== null && normalise(secondary).includes(term)) {
    return SCORE_SECONDARY;
  }
  return null;
}

/**
 * Total score for an entry, or null when it does not match.
 * An empty query matches everything at zero, so the caller keeps its own order.
 */
export function scoreEntry(query: string, fields: MatchFields): number | null {
  const terms = queryTerms(query);
  if (terms.length === 0) return 0;

  let total = 0;
  for (const term of terms) {
    const score = scoreTerm(fields, term);
    if (score === null) return null;
    total += score;
  }
  return total;
}

/**
 * Rank entries best-first, dropping non-matches. Ties keep their input order,
 * so a caller's own sort (sort_order, name) still shows through.
 */
export function rankEntries<T>(
  query: string,
  entries: readonly T[],
  toFields: (entry: T) => MatchFields,
  limit?: number,
): T[] {
  const scored: { entry: T; score: number; index: number }[] = [];

  entries.forEach((entry, index) => {
    const score = scoreEntry(query, toFields(entry));
    if (score !== null) scored.push({ entry, score, index });
  });

  scored.sort((a, b) => (b.score === a.score ? a.index - b.index : b.score - a.score));
  const ranked = scored.map((s) => s.entry);
  return limit === undefined ? ranked : ranked.slice(0, limit);
}
