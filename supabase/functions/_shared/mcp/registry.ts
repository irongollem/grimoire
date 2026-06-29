// Registry of DM-facing entity types exposed to the read-only MCP server.
//
// One entry per type drives `search` / `get` / `list` generically, so adding a
// new entity is a single registry line rather than new tool code. Tenancy is NOT
// enforced here — every query runs through a Supabase client carrying the DM's
// OAuth JWT, so the existing RLS policies (`user_id = auth.uid()` plus campaign
// visibility) scope results automatically.
//
// Notes baked in from the schema:
//   • `monsters`, `spells`, `items`, `traps`, `rules` are a DM's *global* library
//     (no `campaign_id`) — `campaignScoped: false`.
//   • `quests`, `notes`, `rules` name their entity in `title`, not `name`.
//   • Heavy JSONB columns (`stat_block`, `combatants`, `content`, trap `description`,
//     …) are kept OUT of `searchFields`/list columns — `get` returns them via `*`.

export interface EntityDef {
  /** Canonical type key exposed to the AI (also the value in tool enums). */
  type: string;
  /** Human label for descriptions. */
  label: string;
  /** Postgres table name. */
  table: string;
  /** Human-name column: "name" | "title". */
  nameField: string;
  /** Short text column used for list snippets (must be TEXT, never JSONB). */
  summaryField?: string;
  /** TEXT columns matched by `search` via ilike (never JSONB columns). */
  searchFields: string[];
  /** Extra lightweight columns to include in list/search rows. */
  extraListColumns?: string[];
  /** Whether the table has a `campaign_id` column (enables campaign filtering). */
  campaignScoped: boolean;
}

export const ENTITY_REGISTRY: Record<string, EntityDef> = {
  npc: {
    type: "npc",
    label: "NPC",
    table: "npcs",
    nameField: "name",
    summaryField: "occupation",
    searchFields: ["name", "occupation", "personality", "backstory", "appearance", "notes", "alignment", "status"],
    extraListColumns: ["alignment", "status"],
    campaignScoped: true,
  },
  monster: {
    type: "monster",
    label: "Monster",
    table: "monsters",
    nameField: "name",
    summaryField: "monster_type",
    searchFields: ["name", "description", "notes", "monster_type", "size", "alignment"],
    extraListColumns: ["size", "alignment"],
    campaignScoped: false,
  },
  spell: {
    type: "spell",
    label: "Spell",
    table: "spells",
    nameField: "name",
    summaryField: "school",
    searchFields: ["name", "description", "school", "casting_time", "range", "duration"],
    extraListColumns: ["level", "school"],
    campaignScoped: false,
  },
  item: {
    type: "item",
    label: "Item",
    table: "items",
    nameField: "name",
    summaryField: "item_type",
    searchFields: ["name", "description", "item_type", "rarity"],
    extraListColumns: ["item_type", "rarity"],
    campaignScoped: false,
  },
  location: {
    type: "location",
    label: "Location",
    table: "locations",
    nameField: "name",
    summaryField: "location_type",
    searchFields: ["name", "description", "notes", "player_summary"],
    extraListColumns: ["location_type", "parent_id"],
    campaignScoped: true,
  },
  encounter: {
    type: "encounter",
    label: "Encounter",
    table: "encounters",
    nameField: "name",
    summaryField: "description",
    searchFields: ["name", "description"],
    extraListColumns: ["is_finished", "location_id"],
    campaignScoped: true,
  },
  quest: {
    type: "quest",
    label: "Quest",
    table: "quests",
    nameField: "title",
    summaryField: "summary",
    searchFields: ["title", "summary", "description", "notes"],
    extraListColumns: ["status"],
    campaignScoped: true,
  },
  faction: {
    type: "faction",
    label: "Faction",
    table: "factions",
    nameField: "name",
    summaryField: "faction_type",
    searchFields: ["name", "description", "faction_type", "alignment"],
    extraListColumns: ["faction_type", "alignment"],
    campaignScoped: true,
  },
  deity: {
    type: "deity",
    label: "Deity",
    table: "deities",
    nameField: "name",
    summaryField: "portfolio",
    searchFields: ["name", "titles", "portfolio", "description", "dm_notes", "symbol", "alignment"],
    extraListColumns: ["alignment", "pantheon_id"],
    campaignScoped: true,
  },
  pantheon: {
    type: "pantheon",
    label: "Pantheon",
    table: "pantheons",
    nameField: "name",
    summaryField: "description",
    searchFields: ["name", "description"],
    campaignScoped: true,
  },
  trap: {
    type: "trap",
    label: "Trap",
    table: "traps",
    nameField: "name",
    summaryField: "effect_description",
    // `description` and `notes` are JSONB on traps — excluded from text search.
    searchFields: ["name", "effect_description", "trap_type", "trigger_type"],
    extraListColumns: ["trap_type", "cr"],
    campaignScoped: false,
  },
  puzzle: {
    type: "puzzle",
    label: "Puzzle",
    table: "puzzle_rooms",
    nameField: "name",
    summaryField: "puzzle_type",
    searchFields: ["name", "description", "solution", "success_outcome", "failure_consequence", "read_aloud"],
    extraListColumns: ["puzzle_type", "difficulty"],
    campaignScoped: true,
  },
  note: {
    type: "note",
    label: "Note",
    table: "notes",
    nameField: "title",
    summaryField: "category",
    searchFields: ["title", "content", "category"],
    extraListColumns: ["category", "session_num"],
    campaignScoped: true,
  },
  rule: {
    type: "rule",
    label: "Rule",
    table: "rules",
    nameField: "title",
    summaryField: "category",
    // `content` is JSONB on rules — excluded from text search.
    searchFields: ["title", "category"],
    extraListColumns: ["category"],
    campaignScoped: false,
  },
  party_member: {
    type: "party_member",
    label: "Party Member",
    table: "party_members",
    nameField: "name",
    summaryField: "class",
    searchFields: ["name", "player_name", "class", "notes", "personality_traits", "ideals", "bonds", "flaws"],
    extraListColumns: ["class", "level"],
    campaignScoped: true,
  },
};

/** All exposed type keys — used to build tool input enums. */
export const ENTITY_TYPES = Object.keys(ENTITY_REGISTRY);

/** Lightweight column list for list/search rows (keeps heavy JSONB out). */
export function listColumns(def: EntityDef): string {
  const cols = new Set<string>(["id", def.nameField]);
  if (def.summaryField) cols.add(def.summaryField);
  for (const c of def.extraListColumns ?? []) cols.add(c);
  if (def.campaignScoped) cols.add("campaign_id");
  cols.add("updated_at");
  return [...cols].join(",");
}
