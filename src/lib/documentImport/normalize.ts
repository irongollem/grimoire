/**
 * Widens a narrow `Extracted*` payload (src/types/documentImport.types.ts)
 * into a real Insert row for the entity's own table, applying the same
 * defaults a hand-created row would get, resolving free text into the app's
 * closed enums, and enforcing the prose cap on descriptive fields.
 *
 * Pure by design: no Supabase client, no network, no Vue. Every mapper is a
 * plain function of (payload, campaignId, provenance) → { row, links }, so
 * the wizard can call it synchronously while building the review cards and
 * the same function is trivially unit-testable without mocking anything.
 *
 * ── Why campaign_id and ai_provenance are parameters, not extracted ─────────
 *
 * Neither can come from the document: campaign_id is which campaign the DM
 * is importing into, not a fact a page can state, and ai_provenance records
 * that *this* extraction pass produced the row (generator, model, timestamp)
 * — constructing it here would be the mapper vouching for its own inputs.
 * The caller (the wizard, driving the actual extraction call) builds it once
 * and this module stamps it onto every row unchanged.
 *
 * ── Why cross-entity name references never become uuids here ────────────────
 *
 * `ExtractedNpc.faction_name`, `ExtractedLocation.parent_name`, and
 * `ExtractedQuest.giver_npc_name` / `location_name` name another entity in
 * the same document, which may not have a row yet — the wizard imports kinds
 * in `IMPORT_ENTITY_KINDS` order, but even within a kind, insert order isn't
 * guaranteed to match reference order. Resolving them here would mean
 * silently dropping a link whenever the referent hasn't been inserted yet,
 * which is worse than always deferring the resolution. So a mapper leaves
 * the FK column null and returns the raw name in `links`; a second pass over
 * the *already-inserted* rows for that document does the name → id lookup.
 */
import type { AiProvenance } from "@/ai/provenance";
import type {
  ExtractedFaction,
  ExtractedItem,
  ExtractedLocation,
  ExtractedMonster,
  ExtractedNpc,
  ExtractedPayloadMap,
  ExtractedQuest,
  ExtractedSpell,
  ImportEntityKind,
} from "@/types/documentImport.types";
import { PROSE_FIELD_LIMIT } from "@/types/documentImport.types";
import type { FactionInsert } from "@/types/faction.types";
import type { ItemInsert } from "@/types/item.types";
import { ITEM_RARITIES, ITEM_TYPES } from "@/types/item.types";
import type { LocationInsert, LocationType } from "@/types/location.types";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { MonsterInsert, MonsterSize, MonsterStatBlock, MonsterType } from "@/types/monster.types";
import { MONSTER_SIZES, MONSTER_TYPES } from "@/types/monster.types";
import type { NpcInsert } from "@/types/npc.types";
import type { QuestInsert } from "@/types/quest.types";
import type { SpellInsert, SpellSchool } from "@/types/spell.types";
import { SPELL_SCHOOLS } from "@/types/spell.types";

// ── The return envelope ──────────────────────────────────────────────────────

/** Kind → the Insert type its mapper produces. */
export interface ImportRowMap {
  monsters: MonsterInsert;
  npcs: NpcInsert;
  locations: LocationInsert;
  items: ItemInsert;
  spells: SpellInsert;
  quests: QuestInsert;
  factions: FactionInsert;
}

/**
 * Raw names for entities this row refers to that could not be resolved to a
 * uuid (see the file header). All optional: most kinds produce no links at
 * all, and even the kinds that can rarely produce every one of theirs.
 */
export interface EntityLinks {
  /** NPC → faction, by name. */
  faction_name?: string;
  /** Location → parent location, by name. */
  parent_name?: string;
  /** Quest → quest-giver NPC, by name. */
  giver_npc_name?: string;
  /** Quest → location, by name. */
  location_name?: string;
}

export interface MappedEntity<K extends ImportEntityKind = ImportEntityKind> {
  row: ImportRowMap[K];
  links: EntityLinks;
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Truncates a paraphrased descriptive field to `limit` on a word boundary,
 * marking the cut with an ellipsis instead of chopping mid-word. Absent or
 * blank input becomes `null` — there is no schema default for these columns,
 * so that is the honest "nothing here," not an invented value. See the types
 * file header for why prose (and only prose) is capped at all.
 */
export function capProse(text: string | undefined, limit: number = PROSE_FIELD_LIMIT): string | null {
  if (text === undefined) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= limit) return trimmed;
  const slice = trimmed.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");
  const boundary = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${boundary}…`;
}

/**
 * Resolves free text as printed in a document ("Large fiend (demon)", "a
 * walled city") to one of a closed set of values the schema expects, by
 * case-insensitive substring match. Underscored candidates ("very_rare",
 * "wondrous_item") are matched against their space-separated form, since
 * nothing is ever printed with an underscore in it. Falls back to the
 * schema/type default when nothing matches — inventing a value here is
 * exactly the "confident fabrication" the narrow payload contract
 * (documentImport.types.ts) exists to avoid.
 *
 * **Longest match wins, and that is load-bearing.** 5e's vocabularies nest one
 * term inside another: "uncommon" contains "common", "very rare" contains
 * "rare". Scanning for the *first* candidate the text contains therefore
 * downgraded every Very Rare item to Rare and every Uncommon item to Common,
 * decided purely by the order `ITEM_RARITIES` happens to be declared in. That
 * failure is invisible in review — the field is populated, plausible, and
 * wrong — so it is fixed here rather than left to the DM to catch. Any future
 * candidate list with a shared stem (a `damage_type`, a `school`) inherits the
 * correct behaviour for free.
 */
export function resolveEnum<T extends string>(
  raw: string | undefined,
  candidates: readonly T[],
  fallback: T,
): T {
  if (!raw) return fallback;
  const haystack = raw.toLowerCase();

  let best: T | null = null;
  let bestLength = 0;
  for (const candidate of candidates) {
    const needle = candidate.toLowerCase().replace(/_/g, " ");
    if (haystack.includes(needle) && needle.length > bestLength) {
      best = candidate;
      bestLength = needle.length;
    }
  }
  return best ?? fallback;
}

/**
 * `location.types.ts` exports `LOCATION_TYPE_LABELS` (a `Record`) but no
 * plain array of `LocationType` values the way `monster.types.ts` exports
 * `MONSTER_TYPES`. Deriving from the label map's keys avoids hand-duplicating
 * the enum's membership a second time here, which would drift the moment a
 * type is added to one and not the other.
 */
const LOCATION_TYPES = Object.keys(LOCATION_TYPE_LABELS) as LocationType[];

/**
 * `Monster.stat_block` is a full `MonsterStatBlock`, not a partial one, even
 * though the `monsters` table's own default is the bare `{}` jsonb — every
 * other write path (`MonsterDetail.vue`'s create form) always fills a
 * complete block before saving, so the column default exists only as a
 * last-resort safety net, not something callers are meant to rely on.
 *
 * `ExtractedMonster.stat_block` is `Partial<MonsterStatBlock>` because a page
 * break can cost the extractor the reactions block without costing the rest.
 * Any required field it didn't recover is filled here with a value chosen to
 * read as obviously placeholder rather than plausible — average ability
 * scores, CR 0 — so a DM reviewing the import isn't misled into thinking the
 * extractor actually read a stat off the page that it did not.
 */
const BLANK_MONSTER_STAT_BLOCK: MonsterStatBlock = {
  armor_class: 10,
  hit_points: "1",
  speed: "30 ft.",
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
  challenge_rating: "0",
};

// ── Monsters ─────────────────────────────────────────────────────────────────

export function mapExtractedMonster(
  payload: ExtractedMonster,
  campaignId: string,
  provenance: AiProvenance,
): MappedEntity<"monsters"> {
  const row: MonsterInsert = {
    campaign_id: campaignId,
    name: payload.name,
    monster_type: resolveEnum<MonsterType>(payload.monster_type, MONSTER_TYPES, "humanoid"),
    size: resolveEnum<MonsterSize>(payload.size, MONSTER_SIZES, "medium"),
    alignment: payload.alignment ?? "unaligned", // schema default (monsters.alignment)
    habitat: payload.habitat ?? null,
    source: null, // not an Open5e import
    tags: [], // schema default '{}'; not extracted
    stat_block: { ...BLANK_MONSTER_STAT_BLOCK, ...payload.stat_block },
    description: capProse(payload.description),
    notes: null, // no corresponding field in ExtractedMonster
    image_url: null,
    ai_provenance: provenance,
  };
  return { row, links: {} };
}

// ── NPCs ─────────────────────────────────────────────────────────────────────

export function mapExtractedNpc(
  payload: ExtractedNpc,
  campaignId: string,
  provenance: AiProvenance,
): MappedEntity<"npcs"> {
  const row: NpcInsert = {
    campaign_id: campaignId,
    name: payload.name,
    race: payload.race ?? null,
    alignment: payload.alignment ?? null, // NPC alignment is free text, no schema default
    age: payload.age ?? null,
    occupation: payload.occupation ?? null,
    appearance: capProse(payload.appearance),
    personality: capProse(payload.personality),
    backstory: capProse(payload.backstory),
    notes: capProse(payload.notes),
    status: "alive", // schema default; not extracted (ExtractedNpc has no status field)
    // Matches the live column default: `npcs.relationship` is an
    // `npc_relationship` enum defaulting to 'unknown', not the free-text
    // 'neutral' the squashed schema shows — 20260519000001_npc_relationship_5e_scale
    // converted the column to the 5e attitude scale. It is also the honest read
    // for a freshly imported NPC: the party has not met them, so no attitude is
    // known yet.
    relationship: "unknown",
    portrait_url: null,
    disguise_name: null,
    disguise_portrait_url: null,
    is_revealed: false, // schema default
    tags: [], // schema default '{}'; not extracted
    stat_block: null, // no schema default; NPC statblocks aren't part of this payload
    scriptorium_doc_id: null,
    player_visible_to: [], // schema default '{}'
    player_visible_fields: [], // schema default '{}'
    ai_provenance: provenance,
  };
  return { row, links: { faction_name: payload.faction_name } };
}

// ── Locations ────────────────────────────────────────────────────────────────

export function mapExtractedLocation(
  payload: ExtractedLocation,
  campaignId: string,
  provenance: AiProvenance,
): MappedEntity<"locations"> {
  const row: LocationInsert = {
    campaign_id: campaignId,
    parent_id: null, // resolved from links.parent_name in a second pass, see file header
    name: payload.name,
    location_type: resolveEnum<LocationType>(payload.location_type, LOCATION_TYPES, "other"),
    description: capProse(payload.description),
    notes: capProse(payload.notes),
    tags: [], // not extracted
    image_url: null,
    map_url: null,
    map_pins: [], // schema default '[]'
    is_map_shared: false, // schema default
    player_visible_to: [], // schema default '{}'
    player_summary: null,
    is_description_shared: false, // schema default
    is_npcs_shared: false, // schema default
    is_inventory_shared: false, // schema default
    npc_owner_id: null,
    related_location_ids: [], // schema default '{}'
    source_map_id: null,
    is_battle_map: false, // schema default
    grid_calibration: null,
    era_start: null,
    era_end: null,
    ai_provenance: provenance,
    // audio_theme omitted — its own type comment says to omit for the column
    // default of null, which is exactly what applies here.
  };
  return { row, links: { parent_name: payload.parent_name } };
}

// ── Items ────────────────────────────────────────────────────────────────────

export function mapExtractedItem(
  payload: ExtractedItem,
  campaignId: string,
  provenance: AiProvenance,
): MappedEntity<"items"> {
  const row: ItemInsert = {
    name: payload.name,
    item_type: resolveEnum(payload.item_type, ITEM_TYPES, "gear"),
    subtype: payload.subtype ?? null,
    rarity: resolveEnum(payload.rarity, ITEM_RARITIES, "mundane"),
    requires_attunement: payload.requires_attunement ?? false, // schema default
    attunement_requirements: payload.attunement_requirements ?? null,
    weight: payload.weight ?? null,
    cost: payload.cost ?? null,
    damage_rolls: null, // structured damage isn't part of this payload
    armor_class: payload.armor_class ?? null,
    properties: payload.properties ?? [], // schema default '{}'
    charges: payload.charges ?? null,
    recharge: null,
    spell_ids: [], // schema default '{}'; not extracted
    weapon_range: payload.weapon_range ?? null,
    versatile_damage: payload.versatile_damage ?? null,
    description: payload.description ?? "", // schema default ''; MECHANICAL — never capped, see file header of documentImport.types.ts
    source: null, // not an Open5e import
    tags: [], // not extracted
    image_url: null,
    is_arcane_focus: false, // schema default
    curse_description: null, // no schema default; not extracted
    campaign_id: campaignId,
    ai_provenance: provenance,
    // mastery, source_title/url, bundle_items, image_focal_point, mundane_*,
    // dm_notes, content, content_player_writable omitted — none has a
    // corresponding field in ExtractedItem, so there is nothing to set and
    // each is optional on ItemInsert; the DB applies its own default.
  };
  return { row, links: {} };
}

// ── Spells ───────────────────────────────────────────────────────────────────

function isValidSpellLevel(level: number | undefined): level is number {
  return typeof level === "number" && Number.isInteger(level) && level >= 0 && level <= 9;
}

export function mapExtractedSpell(
  payload: ExtractedSpell,
  campaignId: string,
  provenance: AiProvenance,
): MappedEntity<"spells"> {
  const row: SpellInsert = {
    name: payload.name,
    level: isValidSpellLevel(payload.level) ? payload.level : 1, // schema default; CHECK (0 <= level <= 9)
    school: resolveEnum<SpellSchool>(payload.school, SPELL_SCHOOLS, "evocation"),
    casting_time: payload.casting_time ?? "Action", // schema default; column is free text, not an enum
    casting_time_custom: null,
    range: payload.range ?? "60 ft.", // schema default
    range_custom: null,
    duration: payload.duration ?? "Instantaneous", // schema default
    duration_custom: null,
    components: payload.components ?? [], // schema default '{}'
    material: payload.material ?? null,
    concentration: payload.concentration ?? false, // schema default
    ritual: payload.ritual ?? false, // schema default
    attack_type: null,
    save_attribute: null,
    save_effect: null,
    damage_rolls: null,
    healing_dice: null,
    target_description: null,
    aoe_shape: null,
    aoe_size: null,
    condition_inflicted: null,
    description: payload.description ?? "", // schema default ''; MECHANICAL — never capped, a spell's description IS its rules text
    higher_levels: payload.higher_levels ?? null, // MECHANICAL — never capped
    higher_level_damage: null,
    higher_level_healing: null,
    classes: payload.classes ?? [], // schema default '{}'
    tags: [], // not extracted
    source: null, // not an Open5e import
    source_title: null,
    source_url: null,
    open5e_import: false, // schema default
    image_url: null,
    campaign_id: campaignId,
    ai_provenance: provenance,
    // conceptual_key, ruleset, source_document_key/record_key/revision/license,
    // provenance, casting_options, effect_schema_version, effects,
    // mechanics_reviewed, image_focal_point omitted — all optional and none
    // has a corresponding field in ExtractedSpell.
  };
  return { row, links: {} };
}

// ── Quests ───────────────────────────────────────────────────────────────────

export function mapExtractedQuest(
  payload: ExtractedQuest,
  campaignId: string,
  provenance: AiProvenance,
): MappedEntity<"quests"> {
  const row: QuestInsert = {
    campaign_id: campaignId,
    parent_quest_id: null,
    title: payload.title,
    summary: capProse(payload.summary),
    // 'undiscovered', matching the live column default — and semantically the
    // only defensible value. A quest lifted off a page is one the party has not
    // met yet; importing a setting book's twenty plot hooks as 'active' would
    // dump twenty live quests onto the DM's kanban board and make the import
    // something they have to clean up rather than something they can use.
    //
    // Not extracted, deliberately: `ExtractedQuest` has no status field, because
    // a printed adventure cannot report a *live* campaign's state. The enum and
    // the `QuestStatus` union agree on all five members (undiscovered/rumor/
    // active/completed/failed); the squashed schema's 'on_hold' was renamed to
    // 'rumor' by 20260508000007, so that apparent drift is only in the snapshot.
    status: "undiscovered",
    giver_npc_id: null, // resolved from links.giver_npc_name in a second pass, see file header
    location_id: null, // resolved from links.location_name in a second pass, see file header
    rewards: payload.rewards ?? null,
    reward_pp: 0, // schema default; ExtractedQuest carries a free-text `rewards` field, not a currency breakdown
    reward_gp: 0,
    reward_ep: 0,
    reward_sp: 0,
    reward_cp: 0,
    tags: [], // not extracted
    description: capProse(payload.description),
    notes: capProse(payload.notes),
    player_visible_to: [], // schema default '{}'
    reward_item_ids: [], // schema default '{}'
    reward_currency_pools: [], // schema default '[]'
    started_at: null,
    resolved_at: null,
    ai_provenance: provenance,
    // flow_enabled_at omitted — optional, DB default now().
  };
  return { row, links: { giver_npc_name: payload.giver_npc_name, location_name: payload.location_name } };
}

// ── Factions ─────────────────────────────────────────────────────────────────

export function mapExtractedFaction(
  payload: ExtractedFaction,
  campaignId: string,
  provenance: AiProvenance,
): MappedEntity<"factions"> {
  const row: FactionInsert = {
    // The `factions.campaign_id` *column* is nullable, like all six siblings —
    // it is the `Faction` TS interface that types it `string`, because a
    // campaign-less faction is meaningless to the app even though the database
    // tolerates one. An import always has a campaign (`document_imports.campaign_id`
    // is NOT NULL), so there is nothing to reconcile here.
    campaign_id: campaignId,
    name: payload.name,
    faction_type: payload.faction_type ?? null, // free text, no restricted enum
    description: capProse(payload.description),
    emblem_url: null,
    alignment: payload.alignment ?? null,
    player_visible_to: [], // schema default '{}'
    tags: [], // schema default '{}'; not extracted
    ai_provenance: provenance,
  };
  return { row, links: {} };
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

type EntityMapper<K extends ImportEntityKind> = (
  payload: ExtractedPayloadMap[K],
  campaignId: string,
  provenance: AiProvenance,
) => MappedEntity<K>;

/**
 * Kind → mapper, typed against `{ [K in ImportEntityKind]: EntityMapper<K> }`
 * via `satisfies` so a new kind added to `IMPORT_ENTITY_KINDS` without a
 * matching mapper here is a compile error, not a silently-skipped wizard step.
 *
 * `campaignId` is `string`, not `string | null`, throughout. An import is
 * always into a specific campaign — `document_imports.campaign_id` is NOT NULL
 * (migration 20260824204224) — so a null could only arrive from a caller
 * mistake, and accepting one here would let it reach a row instead of failing
 * at the type. An earlier draft widened it and cast this entry back, which is
 * the same hole with a lid on it.
 */
export const ENTITY_MAPPERS = {
  monsters: mapExtractedMonster,
  npcs: mapExtractedNpc,
  locations: mapExtractedLocation,
  items: mapExtractedItem,
  spells: mapExtractedSpell,
  quests: mapExtractedQuest,
  factions: mapExtractedFaction,
} satisfies { [K in ImportEntityKind]: EntityMapper<K> };
