/**
 * Single source of truth for the text embedded into an NPC's, faction's,
 * location's, or note's semantic-search vector (#600 — grounding the
 * quest-hook generator and the Chronicler recap generator, and whatever
 * generator follows them, in the DM's own content; generalises the #595
 * monster mechanism).
 *
 * Each entity gets its own side table (npc_embeddings / faction_embeddings /
 * location_embeddings / note_embeddings — see the migrations that create them
 * alongside these stories), and each one MUST be built from the corresponding
 * function here.
 * `entityEmbedHash` feeds every row's `source_hash`, which lets the
 * backfill/embed-on-write path in embed-content skip rows whose text hasn't
 * changed. Because the hash is over a builder's *output*, changing anything
 * about a format below (field order, punctuation, truncation length, which
 * fields are included, ...) changes every hash for that entity type, which
 * invalidates every stored `source_hash` at once. That is not a bug to route
 * around — it means the format change requires a full re-embed for that
 * entity type, not a partial/silent drift where old and new vectors coexist
 * in the same similarity index.
 *
 * The format-neutral string utilities (whitespace collapsing, word-boundary
 * truncation, the source_hash digest) are shared with monsterEmbedText.ts via
 * embedTextUtil.ts — see its module doc for why their behavior is frozen.
 */

import { toPlainText } from "./ai-prompt.ts";
import { collapseWhitespace, sha256Hex, truncateAtWordBoundary } from "./embedTextUtil.ts";

// Keeps every embedded free-text field bounded and matches the same
// ~150 token/field cost estimate monsterEmbedText.ts's DESCRIPTION_CHAR_LIMIT
// uses. Cut at a word boundary, never mid-word. Applied independently per
// field (e.g. an NPC with long appearance AND long backstory keeps both, each
// capped) rather than as one shared budget across the whole entity.
const FREE_TEXT_CHAR_LIMIT = 500;

/** Non-empty, whitespace-collapsed clause text, or null when the source field is absent/blank. */
function normalizeField(value: string | null): string | null {
  if (!value) return null;
  const normalized = collapseWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

/**
 * `${a} ${b}, ${c}.` clause with any part optionally absent — mirrors
 * monsterEmbedText's size/type/CR clause exactly (two space-joined parts,
 * then a comma-joined third), just relabelled per entity. Degrades
 * gracefully and is omitted entirely (empty string) when nothing is
 * available — never a dangling comma or trailing space.
 */
function buildTwoPlusOneClause(a: string | null, b: string | null, c: string | null): string {
  const ab = [a, b]
    .filter((part): part is string => normalizeField(part) !== null)
    .map((part) => normalizeField(part)!)
    .join(" ");
  const cNorm = normalizeField(c);

  if (ab && cNorm) return `${ab}, ${cNorm}.`;
  if (ab) return `${ab}.`;
  if (cNorm) return `${cNorm}.`;
  return "";
}

/** `${a}, ${b}.` clause with either part optionally absent. Same degrade-gracefully rule as `buildTwoPlusOneClause`. */
function buildTwoPartClause(a: string | null, b: string | null): string {
  const aNorm = normalizeField(a);
  const bNorm = normalizeField(b);
  if (aNorm && bNorm) return `${aNorm}, ${bNorm}.`;
  if (aNorm) return `${aNorm}.`;
  if (bNorm) return `${bNorm}.`;
  return "";
}

/** Tags clause identical in shape across all three entities — `tags` is NOT NULL in every one of their tables (default `'{}'`), unlike Monster's nullable `tags`. */
function buildTagsClause(tags: string[]): string {
  const normalized = tags.map(collapseWhitespace).filter((tag) => tag.length > 0);
  return normalized.length > 0 ? `${normalized.join(", ")}.` : "";
}

/** Truncated clause from a Tiptap-JSON-or-plain-string field, flattened via `toPlainText`. */
function buildRichTextClause(content: string | null): string {
  if (!content) return "";
  const plain = collapseWhitespace(toPlainText(content));
  return truncateAtWordBoundary(plain, FREE_TEXT_CHAR_LIMIT);
}

/** Truncated clause from a field that is already plain text (never Tiptap JSON) — no `toPlainText` pass. */
function buildPlainTextClause(content: string | null): string {
  const normalized = normalizeField(content);
  if (!normalized) return "";
  return truncateAtWordBoundary(normalized, FREE_TEXT_CHAR_LIMIT);
}

// A note-specific limit, deliberately 8x FREE_TEXT_CHAR_LIMIT: a session
// note's substance IS its content — the 500-char field cap that fits an
// NPC/faction/location descriptor (one clause among several) would drop the
// events a recap actually needs to find. ~1k tokens is still negligible embed
// cost. Chunking long notes into multiple vectors is #599's problem, not
// this one's -- this builder always produces exactly one embedding per note.
const NOTE_CONTENT_CHAR_LIMIT = 4000;

/** Truncated clause from a note's Tiptap-JSON-or-plain-string content, flattened via `toPlainText` — uses NOTE_CONTENT_CHAR_LIMIT rather than FREE_TEXT_CHAR_LIMIT; see that constant's comment for why. */
function buildNoteContentClause(content: string | null): string {
  if (!content) return "";
  const plain = collapseWhitespace(toPlainText(content));
  return truncateAtWordBoundary(plain, NOTE_CONTENT_CHAR_LIMIT);
}

// ── NPC ───────────────────────────────────────────────────────────────────

export interface EmbeddableNpc {
  name: string;
  race: string | null;
  occupation: string | null;
  alignment: string | null;
  tags: string[];
  appearance: string | null;
  personality: string | null;
  backstory: string | null;
  // `notes` is deliberately NOT a field on this interface. It's session
  // scratch space (DM reminders, "ask player about X next week"), not part
  // of the NPC's identity — embedding it would pull the retrieval vector
  // toward transient table-talk instead of who the NPC actually is.
}

/**
 * Deterministic natural-language summary of an NPC, used as the embedding
 * input. Leads with the name, then a race/occupation/alignment clause, then
 * tags, then appearance, personality, and backstory (each Tiptap-flattened
 * and independently truncated) — each part omitted entirely when the source
 * field is absent, never emitted as an empty/dangling clause.
 *
 * Example (all fields present):
 *   "Baelin Ironforge. Dwarf blacksmith, Lawful Good. gruff, reliable.
 *   Broad-shouldered with soot-stained hands... Short-tempered but
 *   fiercely loyal... Fled the mines after the cave-in that..."
 *
 * Example (name only):
 *   "Baelin Ironforge."
 */
export function buildNpcEmbedText(npc: EmbeddableNpc): string {
  const clauses: string[] = [];

  clauses.push(`${collapseWhitespace(npc.name)}.`);

  const raceOccupationAlignment = buildTwoPlusOneClause(npc.race, npc.occupation, npc.alignment);
  if (raceOccupationAlignment) clauses.push(raceOccupationAlignment);

  const tagsClause = buildTagsClause(npc.tags);
  if (tagsClause) clauses.push(tagsClause);

  const appearance = buildRichTextClause(npc.appearance);
  if (appearance) clauses.push(appearance);

  const personality = buildRichTextClause(npc.personality);
  if (personality) clauses.push(personality);

  const backstory = buildRichTextClause(npc.backstory);
  if (backstory) clauses.push(backstory);

  return clauses.join(" ");
}

// ── Faction ───────────────────────────────────────────────────────────────

export interface EmbeddableFaction {
  name: string;
  faction_type: string | null;
  alignment: string | null;
  tags: string[];
  description: string | null;
}

/**
 * Deterministic natural-language summary of a faction, used as the embedding
 * input. Leads with the name, then a faction_type/alignment clause, then
 * tags, then a Tiptap-flattened, word-boundary-truncated description — each
 * part omitted entirely when the source field is absent.
 *
 * Example (all fields present):
 *   "The Iron Concord. Guild, Lawful Neutral. smugglers, docks. A merchant
 *   consortium that controls..."
 *
 * Example (name only):
 *   "The Iron Concord."
 */
export function buildFactionEmbedText(faction: EmbeddableFaction): string {
  const clauses: string[] = [];

  clauses.push(`${collapseWhitespace(faction.name)}.`);

  const typeAlignment = buildTwoPartClause(faction.faction_type, faction.alignment);
  if (typeAlignment) clauses.push(typeAlignment);

  const tagsClause = buildTagsClause(faction.tags);
  if (tagsClause) clauses.push(tagsClause);

  const description = buildRichTextClause(faction.description);
  if (description) clauses.push(description);

  return clauses.join(" ");
}

// ── Location ──────────────────────────────────────────────────────────────

export interface EmbeddableLocation {
  name: string;
  // NOT NULL in the schema (default 'other') — unlike the other optional
  // string fields on this interface, this is never absent.
  location_type: string;
  tags: string[];
  player_summary: string | null;
  description: string | null;
  // `notes` is deliberately NOT a field on this interface. It's a dead
  // column: LocationEditor hardcodes it to null on every save, so a live
  // location's `notes` is never anything a DM actually wrote.
}

/**
 * Deterministic natural-language summary of a location, used as the
 * embedding input. Leads with the name, then the location_type, then tags,
 * then the player-facing summary (plain text, no Tiptap flattening — this
 * field is never rich text), then a Tiptap-flattened, word-boundary-
 * truncated description — each part omitted entirely when the source field
 * is absent.
 *
 * Example (all fields present):
 *   "The Rusty Anchor. tavern. waterfront, smugglers. A dockside tavern
 *   known for cheap ale and quiet corners. Beneath the taproom..."
 *
 * Example (name only):
 *   "The Rusty Anchor."
 */
export function buildLocationEmbedText(location: EmbeddableLocation): string {
  const clauses: string[] = [];

  clauses.push(`${collapseWhitespace(location.name)}.`);

  const locationType = normalizeField(location.location_type);
  if (locationType) clauses.push(`${locationType}.`);

  const tagsClause = buildTagsClause(location.tags);
  if (tagsClause) clauses.push(tagsClause);

  const playerSummary = buildPlainTextClause(location.player_summary);
  if (playerSummary) clauses.push(playerSummary);

  const description = buildRichTextClause(location.description);
  if (description) clauses.push(description);

  return clauses.join(" ");
}

// ── Note ──────────────────────────────────────────────────────────────────

export interface EmbeddableNote {
  title: string;
  // NOT NULL in the schema (default 'general') -- unlike the other optional
  // string fields on this interface, this is never absent.
  category: string;
  session_num: number | null;
  tags: string[];
  content: string | null;
}

/**
 * Deterministic natural-language summary of a note, used as the embedding
 * input. Leads with the title, then a category/session clause (the session
 * number rendered as "Session N" only when set), then tags, then the
 * Tiptap-flattened, word-boundary-truncated content — each part omitted
 * entirely when the source field is absent.
 *
 * Example (all fields present):
 *   "The Sunken Vault. session, Session 7. dungeon, vault. The party
 *   descended into the flooded ruins and found the vault door ajar..."
 *
 * Example (title and category only, no session number, no content):
 *   "Loose thread: the merchant's ledger. general."
 */
export function buildNoteEmbedText(note: EmbeddableNote): string {
  const clauses: string[] = [];

  clauses.push(`${collapseWhitespace(note.title)}.`);

  const sessionClause = note.session_num != null ? `Session ${note.session_num}` : null;
  const categorySession = buildTwoPartClause(note.category, sessionClause);
  if (categorySession) clauses.push(categorySession);

  const tagsClause = buildTagsClause(note.tags);
  if (tagsClause) clauses.push(tagsClause);

  const content = buildNoteContentClause(note.content);
  if (content) clauses.push(content);

  return clauses.join(" ");
}

// ── Hash ──────────────────────────────────────────────────────────────────

/**
 * Stable lowercase-hex SHA-256 of the embed text — stored as an embedding
 * row's `source_hash` so a backfill can skip rows whose text hasn't changed.
 * Same digest as `monsterEmbedHash`, by construction.
 */
export const entityEmbedHash = sha256Hex;
