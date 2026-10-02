/**
 * The document importer's name-lookup key — an exact TypeScript port of
 * `private.normalize_entity_name` (SQL, `supabase/migrations/20261002131333_import_name_match_punctuation_and_partial_names.sql`).
 *
 * Two runtimes need the same answer to "are these two printed names the same
 * entity?" and cannot share a module: `match_import_entity_names` (Postgres)
 * runs the name tier of import-candidate matching against the database, while
 * `importPlan.ts`'s `findByName` and `normalize.ts`'s
 * `findEncounterCandidateByName` run entirely in the browser, matching a
 * *page's* raw name against rows already fetched into memory. Both need to
 * agree that "The Giant Rats" and "giant rat" are the same key, or a DM's
 * link decision in one place would silently fail to resolve in the other.
 *
 * Deliberately naive, exactly like its SQL counterpart: this is a lookup key
 * for entity names, not an English stemmer. A wrong singularisation costs a
 * missed match, never a wrong one — see the SQL migration's own comment for
 * the reasoning (own-vault-first ranking, no `pg_trgm`, etc.), which this
 * file does not repeat.
 */

/**
 * Apostrophes are dropped outright: a printed book sets ’ where a keyboard
 * types ', so "Dougan’s Hole" and "Dougan's Hole" must share a key (and both
 * meet a "Dougans Hole" typed without one).
 */
const APOSTROPHES = /['’‘ʼ`´]/g;

/**
 * Every other mark becomes a space, so "Ten-Towns" meets "Ten Towns" and
 * "L5. Icy Tomb" keys on its words alone. An explicit list, character for
 * character the one in the SQL function, rather than "anything that is not a
 * letter": what counts as a letter is a locale question Postgres and
 * JavaScript answer differently. `+` is deliberately absent, since
 * "+1 Longsword" is a different item from "Longsword".
 */
const PUNCTUATION = /[\][().,:;!?"“”/‐‑‒–—-]/g;

/**
 * Lowercases, drops apostrophes, turns other punctuation into spaces, trims,
 * drops a leading article, collapses internal whitespace, and de-pluralises
 * the last word — and, for an "X of Y" name, the *head* noun as well
 * ("Potions of Healing" → "Potion of Healing", since English pluralises the
 * head of that construction, not "Y"). Returns `null` for anything that
 * normalizes to nothing, the same as the SQL `nullif(..., '')`.
 *
 * Order mirrors the SQL function exactly — lower, fold punctuation, trim,
 * strip article, collapse whitespace, de-pluralise the "X of Y" head,
 * de-pluralise the trailing word — because the steps are not independent: the
 * trailing-word rule must not fire before the "X of Y" rule already has (or
 * "potions of healing" would de-pluralise "healing" instead of "potions"),
 * and punctuation has to go before the article does, or `"The" Blue Clam`
 * keeps its article.
 *
 * Examples (from the SQL comment): "The Giant Rats" → "giant rat";
 * "Potions of Healing" → "potion of healing"; "Dougan’s Hole" → "dougans
 * hole"; "Ten-Towns" → "ten town"; "   " → null.
 */
export function normalizeEntityName(name: string): string | null {
  const folded = name.toLowerCase().replace(APOSTROPHES, "").replace(PUNCTUATION, " ").trim();
  const noArticle = folded.replace(/^(a|an|the)\s+/, "");
  const collapsed = noArticle.replace(/\s+/g, " ");
  const headDepluralized = collapsed.replace(/^([a-z]{3,})s( of )/, "$1$2");
  const depluralized = headDepluralized.replace(/([a-z]{3,})s$/, "$1");
  return depluralized.length > 0 ? depluralized : null;
}
