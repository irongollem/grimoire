/**
 * Single source of truth for the text embedded into a monster's semantic-search
 * vector (#595 — retrieval-backed monster selection).
 *
 * `monsters` (homebrew, `id uuid`) and `library_monsters` (shared content,
 * `id text`) both get an embedding row, but they MUST be built from this one
 * function. If the two tables' embed text diverges even slightly, their
 * vectors land in different regions of the embedding space and cross-table
 * similarity ranking (custom vs. library monsters compared side by side)
 * becomes meaningless — no error, just silently wrong retrieval.
 *
 * `monsterEmbedHash` feeds each embedding row's `source_hash`, which lets the
 * backfill/embed-on-write path skip rows whose text hasn't changed. Because
 * the hash is over this function's *output*, changing anything about the
 * format below (field order, punctuation, truncation length, ...) changes
 * every hash, which invalidates every stored `source_hash` at once. That is
 * not a bug to route around — it means the format change requires a full
 * re-embed, not a partial/silent drift where old and new vectors coexist.
 */

import { toPlainText } from "./ai-prompt.ts";

export interface EmbeddableMonster {
  name: string;
  monster_type: string | null;
  size: string | null;
  habitat: string | null;
  tags: string[] | null;
  description: string | null;
  stat_block: { challenge_rating?: string | null } | null;
}

// Keeps the embedded description bounded and matches the ~150 token/row cost
// estimate in #595. Cut at a word boundary, never mid-word.
const DESCRIPTION_CHAR_LIMIT = 500;

/** Collapse any run of whitespace (spaces, tabs, newlines) to a single space and trim. */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Truncate `text` to at most `maxLength` characters, backing off to the
 * previous space so a word is never cut in half. If no space is found within
 * the window (a single very long "word"), falls back to a hard cut.
 */
function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const window = text.slice(0, maxLength);
  const lastSpace = window.lastIndexOf(" ");
  return lastSpace > 0 ? window.slice(0, lastSpace) : window;
}

/**
 * Build the `size {type}, CR {cr}.` clause. Any of size/type/CR may be
 * absent; the clause degrades gracefully and is omitted entirely (empty
 * string) when nothing is available — never a dangling `CR .` or a lone
 * comma.
 */
function buildSizeTypeCrClause(
  size: string | null,
  monsterType: string | null,
  challengeRating: string | null | undefined,
): string {
  const sizeType = [size, monsterType]
    .filter((part): part is string => !!part && collapseWhitespace(part).length > 0)
    .map(collapseWhitespace)
    .join(" ");
  const cr = challengeRating && collapseWhitespace(challengeRating).length > 0
    ? collapseWhitespace(challengeRating)
    : null;

  if (sizeType && cr) return `${sizeType}, CR ${cr}.`;
  if (sizeType) return `${sizeType}.`;
  if (cr) return `CR ${cr}.`;
  return "";
}

/**
 * Deterministic natural-language summary of a monster, used as the embedding
 * input. Leads with the name, then a size/type/CR clause, then tags, then
 * habitat, then a word-boundary-truncated description — each part omitted
 * entirely (not emitted as an empty/dangling clause) when the source field is
 * absent. `tags` order is preserved as given; nothing here is re-sorted.
 *
 * Example (all fields present):
 *   "Owlbear. Large monstrosity, CR 3. forest, ambush predator. Temperate
 *   forests. A cross between a giant owl and a bear..."
 *
 * Example (name only):
 *   "Owlbear."
 */
export function buildMonsterEmbedText(monster: EmbeddableMonster): string {
  const clauses: string[] = [];

  clauses.push(`${collapseWhitespace(monster.name)}.`);

  const sizeTypeCr = buildSizeTypeCrClause(
    monster.size,
    monster.monster_type,
    monster.stat_block?.challenge_rating,
  );
  if (sizeTypeCr) clauses.push(sizeTypeCr);

  if (monster.tags && monster.tags.length > 0) {
    const tags = monster.tags.map(collapseWhitespace).filter((tag) => tag.length > 0);
    if (tags.length > 0) clauses.push(`${tags.join(", ")}.`);
  }

  if (monster.habitat) {
    const habitat = collapseWhitespace(monster.habitat);
    if (habitat) clauses.push(`${habitat}.`);
  }

  if (monster.description) {
    const plainDescription = collapseWhitespace(toPlainText(monster.description));
    const truncated = truncateAtWordBoundary(plainDescription, DESCRIPTION_CHAR_LIMIT);
    if (truncated) clauses.push(truncated);
  }

  return clauses.join(" ");
}

/**
 * Stable lowercase-hex SHA-256 of the embed text — stored as an embedding
 * row's `source_hash` so a backfill can skip rows whose text hasn't changed.
 * Uses Web Crypto (`crypto.subtle`), available as a global in both Deno (the
 * edge function runtime) and Node 18+ (vitest), so this one implementation
 * runs unmodified in both.
 */
export async function monsterEmbedHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
