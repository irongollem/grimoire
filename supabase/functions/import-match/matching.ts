/**
 * Pure logic for the `import-match` edge function (#353 review-wizard rework):
 * payload validation, per-kind embed-text mapping, and the name+similar merge.
 *
 * Deliberately Deno-free — no `@supabase/supabase-js`, no `std/http`, nothing
 * that only resolves under the edge runtime — so `matching.test.ts` runs under
 * vitest like every other `_shared/*.test.ts` module. `index.ts` owns the
 * Deno-only parts: auth, the DM gate, the RPC calls and the embedding provider.
 */

import {
  buildFactionEmbedText,
  buildItemEmbedText,
  buildLocationEmbedText,
  buildNpcEmbedText,
} from "../_shared/entityEmbedText.ts";
import { buildMonsterEmbedText } from "../_shared/monsterEmbedText.ts";

// ── Contract types ───────────────────────────────────────────────────────────

/** The eight kinds import-extract can produce. Anything else in the request body is ignored. */
export const SUPPORTED_KINDS = [
  "npcs",
  "factions",
  "locations",
  "encounters",
  "quests",
  "monsters",
  "items",
  "spells",
] as const;

export type SupportedKind = (typeof SUPPORTED_KINDS)[number];

/** Kinds `match_import_entity_names` covers but that have no embedding corpus (no side table, or — quests/encounters/spells — never got one). */
export type SemanticKind = "npcs" | "factions" | "locations" | "monsters" | "items";

const SEMANTIC_KINDS: readonly SemanticKind[] = ["npcs", "factions", "locations", "monsters", "items"];

export function isSemanticKind(kind: SupportedKind): kind is SemanticKind {
  return (SEMANTIC_KINDS as readonly string[]).includes(kind);
}

export interface RawEntity {
  ref: string;
  name: string;
  data: Record<string, unknown>;
}

export interface ValidatedPayload {
  documentImportId: string;
  /** Only supported kinds, only entities that passed validation. A kind absent here had nothing valid to match. */
  byKind: Partial<Record<SupportedKind, RawEntity[]>>;
}

export type MatchKind = "exact" | "contains" | "similar";
export type MatchSource = "campaign" | "library";

export interface Candidate {
  targetId: string;
  source: MatchSource;
  name: string;
  matchKind: MatchKind;
  detail: string | null;
  distance: number | null;
}

// ── Payload validation ───────────────────────────────────────────────────────

export class PayloadValidationError extends Error {}

const MAX_TOTAL_ENTITIES = 300;
const MAX_ENTITY_JSON_CHARS = 16000;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validates the request body against the contract: `id` a non-empty string,
 * `entities` an object of kind -> entity array. Kinds outside SUPPORTED_KINDS
 * are dropped silently (forward-compatible with an importer that ever adds a
 * ninth kind before this function learns about it) rather than rejected.
 *
 * Individual entities fail soft: a blank/whitespace-only name, after
 * trimming, drops just that entity (nothing to match a nameless row against).
 * The two caps — total entity count and per-entity JSON size — fail the whole
 * request with 400, because either one describes a request too large to be a
 * real document import rather than a partially-bad one.
 */
export function validatePayload(body: unknown): ValidatedPayload {
  if (!isPlainObject(body)) throw new PayloadValidationError("Request body must be a JSON object.");

  const { id, entities } = body;
  if (typeof id !== "string" || !id.trim()) {
    throw new PayloadValidationError("`id` must be a non-empty string.");
  }
  if (!isPlainObject(entities)) {
    throw new PayloadValidationError("`entities` must be an object of kind -> entity array.");
  }

  const byKind: Partial<Record<SupportedKind, RawEntity[]>> = {};
  let total = 0;

  for (const kind of SUPPORTED_KINDS) {
    const list = entities[kind];
    if (!Array.isArray(list)) continue;

    const validated: RawEntity[] = [];
    for (const raw of list) {
      total++;
      if (total > MAX_TOTAL_ENTITIES) {
        throw new PayloadValidationError(`Too many entities in one request (max ${MAX_TOTAL_ENTITIES}).`);
      }
      if (!isPlainObject(raw)) continue;
      const { ref, name, data } = raw;
      if (typeof ref !== "string" || !ref.trim()) continue;
      if (typeof name !== "string" || !name.trim()) continue;
      if (!isPlainObject(data)) continue;
      if (JSON.stringify(data).length > MAX_ENTITY_JSON_CHARS) {
        throw new PayloadValidationError(
          `Entity "${ref}" (${kind}) exceeds the ${MAX_ENTITY_JSON_CHARS}-character payload limit.`,
        );
      }
      validated.push({ ref, name, data });
    }
    if (validated.length > 0) byKind[kind] = validated;
  }

  return { documentImportId: id, byKind };
}

// ── Field readers — untrusted, client-supplied `data` ───────────────────────
// `data` is a JSON object the client extracted from `document_imports.extracted`
// (itself untrusted model output, per documentImport.types.ts's own header
// comment) and re-sent in the request body, so nothing about its shape is
// guaranteed even though ExtractedNpc/ExtractedItem/etc. describe what
// import-extract INTENDED to produce. Every read below narrows defensively.

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function boolOr(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

// ── Embed-text mapping, per semantic kind ────────────────────────────────────
// Each maps the extracted `data` onto the corresponding Embeddable* interface
// from entityEmbedText.ts / monsterEmbedText.ts -- the SAME builders the
// backfill/embed-on-write path uses for the stored rows the query is compared
// against, so the query text lands in the same shape as what it's matched
// against. `tags` is never present on an extracted payload (import-extract's
// schema has no tags field for any kind), so it is always the type's empty/
// null default, never invented.
//
// A few fields are NOT NULL in the target table but optional on the extracted
// payload (`location_type`, `item_type`, `rarity`, `requires_attunement`).
// Those fall back to the column's own DB default (see the schema comments
// inline) rather than being left absent -- that is restating a fact the
// schema already asserts, not inventing one.

export function buildNpcQueryText(name: string, data: Record<string, unknown>): string {
  return buildNpcEmbedText({
    name,
    race: str(data.race),
    occupation: str(data.occupation),
    alignment: str(data.alignment),
    tags: [],
    appearance: str(data.appearance),
    personality: str(data.personality),
    backstory: str(data.backstory),
  });
}

export function buildFactionQueryText(name: string, data: Record<string, unknown>): string {
  return buildFactionEmbedText({
    name,
    faction_type: str(data.faction_type),
    alignment: str(data.alignment),
    tags: [],
    description: str(data.description),
  });
}

export function buildLocationQueryText(name: string, data: Record<string, unknown>): string {
  return buildLocationEmbedText({
    name,
    // locations.location_type is NOT NULL, default 'other' (migration
    // 20260426000099) -- restating the column default for an absent field,
    // not inventing a value.
    location_type: str(data.location_type) ?? "other",
    tags: [],
    player_summary: null, // ExtractedLocation has no player-facing summary field.
    description: str(data.description),
  });
}

export function buildItemQueryText(name: string, data: Record<string, unknown>): string {
  return buildItemEmbedText({
    name,
    // items.item_type / items.rarity are NOT NULL, defaults 'gear' / 'mundane'
    // (migrations 20260426000099, 20260724000001) -- same reasoning as
    // location_type above.
    item_type: str(data.item_type) ?? "gear",
    rarity: str(data.rarity) ?? "mundane",
    subtype: str(data.subtype),
    // items.requires_attunement is NOT NULL, default false.
    requires_attunement: boolOr(data.requires_attunement, false),
    attunement_requirements: str(data.attunement_requirements),
    cost: str(data.cost),
    tags: [],
    description: str(data.description),
  });
}

export function buildMonsterQueryText(name: string, data: Record<string, unknown>): string {
  const statBlock = isPlainObject(data.stat_block) ? data.stat_block : null;
  return buildMonsterEmbedText({
    name,
    monster_type: str(data.monster_type),
    size: str(data.size),
    habitat: str(data.habitat),
    tags: null,
    description: str(data.description),
    stat_block: statBlock ? { challenge_rating: str(statBlock.challenge_rating) } : null,
  });
}

export function buildQueryText(kind: SemanticKind, name: string, data: Record<string, unknown>): string {
  switch (kind) {
    case "npcs": return buildNpcQueryText(name, data);
    case "factions": return buildFactionQueryText(name, data);
    case "locations": return buildLocationQueryText(name, data);
    case "items": return buildItemQueryText(name, data);
    case "monsters": return buildMonsterQueryText(name, data);
  }
}

// ── Similar-distance thresholds, per kind ────────────────────────────────────
//
// Calibrated 18 Sep 2026 against production: for each kind, the 5th
// percentile of the cosine distance from an existing row to its nearest
// DIFFERENT row of the same kind in the same campaign. A hit under that
// number is closer than 95% of genuinely distinct neighbours are to each
// other, so it is a strong same-thing signal rather than merely "somewhat
// related" -- and because the review UI defaults a "similar" candidate's
// action to Link, a false positive here costs the DM a real row, not just a
// suggestion they can shrug off. Measured (nearest-distinct median / p05):
// npcs 0.295/0.136, locations 0.362/0.240, factions 0.435/0.202,
// items 0.264/0.095, library monsters 0.185/0.073. A single shared constant
// would have meant picking one kind's p05 for all five -- either too loose
// for monsters/items (many false Link defaults) or needlessly strict for
// factions/locations (real duplicates missed) -- so each kind gets its own
// threshold instead.
export const SIMILAR_MAX_DISTANCE: Record<SemanticKind, number> = {
  npcs: 0.13,
  factions: 0.20,
  locations: 0.22,
  monsters: 0.07,
  items: 0.09,
};

// ── Semantic-tier detail strings ─────────────────────────────────────────────
//
// The name tier's `detail` column (match_import_entity_names, migration
// 20260918141022) is built with `concat_ws(' · ', ...)` -- join non-blank
// parts with " · ", drop blanks entirely, never a dangling separator. A
// semantic hit is rendered the same way from whatever fields its match RPC
// returns, so a DM sees one consistent voice regardless of which tier found
// the candidate. The RPCs return less than the name tier's own pool query
// (no race alongside occupation, no "all campaigns" tag -- they don't select
// campaign_id), so the semantic detail is a subset of what a name-tier row for
// the same entity might show, not a mismatch.

function joinDetail(...parts: (string | null | undefined)[]): string | null {
  const nonEmpty = parts.map((p) => p?.trim()).filter((p): p is string => !!p);
  return nonEmpty.length > 0 ? nonEmpty.join(" · ") : null;
}

export interface SemanticNpcRow { id: string; name: string; occupation: string | null; distance: number }
export interface SemanticFactionRow { id: string; name: string; faction_type: string | null; distance: number }
export interface SemanticLocationRow { id: string; name: string; location_type: string | null; distance: number }
export interface SemanticMonsterRow {
  id: string; name: string; monster_type: string | null; challenge_rating: string | null; distance: number;
}
export interface SemanticItemRow { id: string; name: string; item_type: string; rarity: string; distance: number }

export function npcDetail(row: SemanticNpcRow): string | null {
  return joinDetail(row.occupation);
}
export function factionDetail(row: SemanticFactionRow): string | null {
  return joinDetail(row.faction_type);
}
export function locationDetail(row: SemanticLocationRow): string | null {
  return joinDetail(row.location_type);
}
/** "CR 1/4 · humanoid" -- CR before type, matching the name tier's monster pool order. */
export function monsterDetail(row: SemanticMonsterRow): string | null {
  return joinDetail(row.challenge_rating ? `CR ${row.challenge_rating}` : null, row.monster_type);
}
/** "mundane · gear" -- rarity before type, matching the name tier's item pool order. */
export function itemDetail(row: SemanticItemRow): string | null {
  return joinDetail(row.rarity, row.item_type);
}

// ── Merge ────────────────────────────────────────────────────────────────────

// Similar hits are capped, but name hits are NOT: `match_import_entity_names`
// itself never trims the DM's own rows (up to 25) for exactly the reason in
// its own comment -- if a DM owns five goblins and the page says "goblin", all
// five must be offered, or the one the DM meant can be the one left off. A
// per-ref total cap here would silently re-impose the limit the SQL function
// deliberately removed. Semantic hits stay capped, both because they are a
// weaker signal (nearest-neighbour, not a name match) and to keep the
// candidate list from ballooning when a kind has both a large vault and a
// crowded library.
const MAX_SIMILAR_APPEND = 3;

/**
 * Name candidates first, ALL of them, in the order `match_import_entity_names`
 * ranked them. Similar (embedding) candidates are appended after, skipping any
 * targetId the name tier already found -- a row already surfaced by name
 * should not also occupy a "similar" slot under a different guise -- capped at
 * MAX_SIMILAR_APPEND regardless of how many the semantic tier returned.
 */
export function mergeCandidates(nameCandidates: Candidate[], similarCandidates: Candidate[]): Candidate[] {
  const seen = new Set(nameCandidates.map((c) => c.targetId));
  const merged = [...nameCandidates];
  let appended = 0;
  for (const candidate of similarCandidates) {
    if (appended >= MAX_SIMILAR_APPEND) break;
    if (seen.has(candidate.targetId)) continue;
    seen.add(candidate.targetId);
    merged.push(candidate);
    appended++;
  }
  return merged;
}
