/**
 * Building Freesound's `filter` and `sort` parameters.
 *
 * Freesound takes a Solr-style filter string, and everything that goes into it
 * is DM-typed. Two rules follow from that and are the reason this is a module
 * rather than string concatenation at the call site:
 *
 * 1. **The licence filter is not optional.** Every filter this builds starts
 *    from it, so there is no code path that can search Freesound without it.
 *    Dropping it would surface CC-BY-NC results a commercial product cannot
 *    use — and the DM would only discover that after adding one.
 * 2. **Sort is an allowlist, not a pass-through.** It lands in a URL we sign
 *    with our API token, so an unrecognised value is replaced rather than
 *    forwarded.
 */

/**
 * Only CC0 + CC-BY. CC-BY-NC is excluded because Grimoire is a commercial
 * product, and we respect contributor intent regardless of free-tier arguments.
 */
export const LICENSE_FILTER = 'license:("Creative Commons 0" OR "Attribution")';

/** Sort orders we expose, mapped to Freesound's own vocabulary. */
export const SORT_OPTIONS = {
  relevance: "score",
  shortest: "duration_asc",
  longest: "duration_desc",
  newest: "created_desc",
  downloads: "downloads_desc",
  rating: "rating_desc",
} as const;

export type SortKey = keyof typeof SORT_OPTIONS;

export const DEFAULT_SORT: SortKey = "relevance";

export function resolveSort(value: string | null): string {
  if (value !== null && value in SORT_OPTIONS) {
    return SORT_OPTIONS[value as SortKey];
  }
  return SORT_OPTIONS[DEFAULT_SORT];
}

/**
 * Freesound tags are single tokens; quotes and whitespace would break out of
 * the quoted term and change the query's meaning.
 */
function sanitiseTag(tag: string): string {
  return tag.replace(/["\\\s]+/g, " ").trim();
}

function parseSeconds(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export interface FilterInput {
  minDuration: string | null;
  maxDuration: string | null;
  tag: string | null;
}

/**
 * The full `filter` value: licence, plus any duration window and tag.
 *
 * A half-specified duration is honoured rather than discarded — "under five
 * seconds" is the single most useful filter for finding a door creak, and it
 * only sets a maximum.
 */
export function buildFreesoundFilter({ minDuration, maxDuration, tag }: FilterInput): string {
  const clauses = [LICENSE_FILTER];

  const min = parseSeconds(minDuration);
  const max = parseSeconds(maxDuration);
  if (min !== null || max !== null) {
    // Freesound reads `*` as unbounded on either end of the range.
    const lower = min === null ? "*" : String(min);
    const upper = max === null ? "*" : String(max);
    clauses.push(`duration:[${lower} TO ${upper}]`);
  }

  if (tag !== null) {
    const clean = sanitiseTag(tag);
    if (clean !== "") clauses.push(`tag:"${clean}"`);
  }

  return clauses.join(" ");
}
