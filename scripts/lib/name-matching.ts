/**
 * Name-matching primitives shared by the chapter-NPC and faiths importers.
 *
 * Previously each parser module carried its own copy of `normalizeName` and
 * `findPotentialDuplicates`. Extracted here so the duplicate-detection logic
 * lives in one place — particularly important when adding fuzzy matching, so
 * both importers stay in sync.
 *
 * Detection layers (callers handle the routing):
 *
 *   1. Exact normalized match  — caller treats as idempotent skip
 *   2. Substring match         — different exact names but one contains the
 *                                other (e.g. "Madame Petrichor" vs
 *                                "Madame Petrichor & Cinder"). Block-and-warn.
 *   3. Fuzzy / near-match      — Levenshtein distance ≤ 2 with both names
 *                                ≥ 4 chars (catches single-typo cases like
 *                                "Velette" vs "Vellette", "Old Tippet" vs
 *                                "Old Sippet"). Block-and-warn.
 *
 * Layers 2 and 3 both surface through `findPotentialDuplicates` — the caller
 * doesn't need to know which detector fired, only that there's a near-match
 * worth surfacing.
 */

/** Case-insensitive trimmed comparison key for idempotency checks. */
export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Levenshtein edit distance between two strings.
 *
 * Standard 2D dynamic-programming implementation, O(m·n) time + O(min(m,n))
 * space (rolling rows). For NPC/deity names which are typically <50 chars,
 * this is plenty fast.
 *
 * Returns 0 for identical strings, length of longer string for fully-distinct
 * strings, 1 for single-character insertion/deletion/substitution.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter one — minimizes the rolling-row size.
  let s = a;
  let t = b;
  if (s.length > t.length) {
    const tmp = s;
    s = t;
    t = tmp;
  }

  const prev = new Array<number>(s.length + 1);
  const curr = new Array<number>(s.length + 1);
  for (let i = 0; i <= s.length; i++) prev[i] = i;

  for (let j = 1; j <= t.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= s.length; i++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1]! + 1,         // insertion
        prev[i]! + 1,             // deletion
        prev[i - 1]! + cost,      // substitution
      );
    }
    for (let i = 0; i <= s.length; i++) prev[i] = curr[i]!;
  }
  return prev[s.length]!;
}

/**
 * Threshold config for fuzzy near-match detection. Tuned to catch single-typo
 * cases without flagging legitimately distinct short names.
 *
 * Rationale for `minLengthForFuzzy = 4`:
 *   - Names ≤3 chars (Sip, Pim, Bib) trivially fall within edit distance 1–2
 *     of any other 3-char name. Flagging them all as suspected duplicates
 *     would be pure noise.
 *   - 4 chars is the smallest where a 1-char typo is more likely "same name,
 *     typo" than "two different short names that happen to share letters."
 *
 * Rationale for `maxDistance = 2`:
 *   - 1 covers true typos (Velette ↔ Vellette, Sippet ↔ Tippet)
 *   - 2 catches slightly nastier ones (Anna ↔ Annie, common transpositions)
 *   - 3+ starts catching legitimately different names (Bract ↔ Bramble,
 *     distance 4) and floods the user with false positives.
 */
const FUZZY_CONFIG = {
  maxDistance: 2,
  minLengthForFuzzy: 4,
} as const;

/**
 * Find existing names that look like potential duplicates of `candidate`.
 *
 * Caller handles the routing — typically:
 *   - exact normalized matches are filtered upstream (idempotent skip)
 *   - everything this function returns is treated as a near-match worth
 *     blocking and surfacing for user decision (or overriding via a flag
 *     like `--allow-duplicate-of`)
 *
 * Three detection layers, in priority order:
 *   1. Substring (either direction)         — different exact names but
 *                                              one contains the other
 *   2. Levenshtein ≤ FUZZY_CONFIG.maxDistance — single-typo class
 *
 * Returns deduplicated normalized-name strings for caller log readability.
 */
export function findPotentialDuplicates(
  candidate: string,
  existingNormalizedNames: Iterable<string>,
): string[] {
  const candNorm = normalizeName(candidate);
  if (!candNorm) return [];

  const hits = new Set<string>();
  for (const existing of existingNormalizedNames) {
    if (existing === candNorm) continue; // exact match — caller handles upstream

    // Layer 1: substring (either direction)
    if (existing.includes(candNorm) || candNorm.includes(existing)) {
      hits.add(existing);
      continue;
    }

    // Layer 2: Levenshtein near-match. Length floor avoids flagging
    // legitimately distinct short names.
    if (
      Math.min(existing.length, candNorm.length) >= FUZZY_CONFIG.minLengthForFuzzy &&
      levenshtein(existing, candNorm) <= FUZZY_CONFIG.maxDistance
    ) {
      hits.add(existing);
    }
  }
  return [...hits];
}
