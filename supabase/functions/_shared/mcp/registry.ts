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

/** Writable-field value kinds the `create`/`update` tools validate + coerce. */
export type FieldType =
  | "text"
  | "enum"
  | "number"
  | "boolean"
  | "uuid"
  | "text[]";

export interface FieldDef {
  type: FieldType;
  /** Required on create (ignored on update — updates are partial). */
  required?: boolean;
  /** Allowed values when `type` is "enum". */
  values?: readonly string[];
  /** Short hint surfaced in the tool description. */
  description?: string;
}

/**
 * Declares the columns the `create`/`update` tools may write for an entity.
 * Entities without a `create` block are read-only over MCP. `user_id`, `id`,
 * and the timestamps are NEVER fields — `user_id` is forced to the caller and
 * the rest are DB-managed.
 */
export interface CreateDef {
  fields: Record<string, FieldDef>;
}

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
  /** Writable fields for `create`/`update`. Omit to keep the entity read-only. */
  create?: CreateDef;
}

// Enum value-lists, mirrored from the DB enums (quest_status_enum,
// location_type_enum). Keep in sync if the enums change.
const QUEST_STATUS = [
  "active",
  "on_hold",
  "completed",
  "failed",
  "undiscovered",
] as const;
const LOCATION_TYPE = [
  "continent",
  "region",
  "country",
  "city",
  "town",
  "village",
  "district",
  "building",
  "room",
  "dungeon",
  "wilderness",
  "other",
  "world",
  "plane",
  "store",
  "tavern",
  "inn",
] as const;

export const ENTITY_REGISTRY: Record<string, EntityDef> = {
  npc: {
    type: "npc",
    label: "NPC",
    table: "npcs",
    nameField: "name",
    summaryField: "occupation",
    searchFields: [
      "name",
      "occupation",
      "personality",
      "backstory",
      "appearance",
      "notes",
      "alignment",
      "status",
    ],
    extraListColumns: ["alignment", "status"],
    campaignScoped: true,
    create: {
      fields: {
        name: { type: "text", required: true },
        campaign_id: {
          type: "uuid",
          description: "Campaign to file this NPC under.",
        },
        location_id: { type: "uuid" },
        race: { type: "text" },
        alignment: { type: "text" },
        age: { type: "text" },
        occupation: { type: "text" },
        appearance: { type: "text" },
        personality: { type: "text" },
        backstory: { type: "text" },
        notes: { type: "text" },
        status: {
          type: "text",
          description:
            "Free text, e.g. alive / dead / missing. Defaults to alive.",
        },
        relationship: {
          type: "text",
          description:
            "e.g. friendly / hostile / neutral. Defaults to neutral.",
        },
        relevance: {
          type: "number",
          description: "1 (minor) to 5 (major). Defaults to 3.",
        },
        tags: { type: "text[]" },
      },
    },
  },
  monster: {
    type: "monster",
    label: "Monster",
    table: "monsters",
    nameField: "name",
    summaryField: "monster_type",
    searchFields: [
      "name",
      "description",
      "notes",
      "monster_type",
      "size",
      "alignment",
    ],
    extraListColumns: ["size", "alignment"],
    campaignScoped: false,
  },
  spell: {
    type: "spell",
    label: "Spell",
    table: "spells",
    nameField: "name",
    summaryField: "school",
    searchFields: [
      "name",
      "description",
      "school",
      "casting_time",
      "range",
      "duration",
    ],
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
    create: {
      fields: {
        name: { type: "text", required: true },
        campaign_id: { type: "uuid" },
        parent_id: {
          type: "uuid",
          description:
            "Parent location, for nesting (e.g. a room inside a building).",
        },
        location_type: {
          type: "enum",
          values: LOCATION_TYPE,
          description: "Defaults to other.",
        },
        description: { type: "text" },
        notes: { type: "text" },
        player_summary: { type: "text", description: "Player-facing blurb." },
        tags: { type: "text[]" },
      },
    },
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
    create: {
      fields: {
        name: { type: "text", required: true },
        campaign_id: { type: "uuid" },
        location_id: { type: "uuid" },
        description: { type: "text" },
      },
    },
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
    create: {
      fields: {
        title: { type: "text", required: true },
        campaign_id: { type: "uuid" },
        summary: { type: "text" },
        description: { type: "text" },
        status: {
          type: "enum",
          values: QUEST_STATUS,
          description: "Defaults to active.",
        },
        rewards: { type: "text" },
        notes: { type: "text" },
        location_id: { type: "uuid" },
        giver_npc_id: { type: "uuid" },
        tags: { type: "text[]" },
      },
    },
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
    create: {
      fields: {
        name: { type: "text", required: true },
        campaign_id: { type: "uuid" },
        faction_type: {
          type: "text",
          description: "e.g. Guild, Cult, Government.",
        },
        description: { type: "text" },
        alignment: { type: "text" },
        tags: { type: "text[]" },
      },
    },
  },
  deity: {
    type: "deity",
    label: "Deity",
    table: "deities",
    nameField: "name",
    summaryField: "portfolio",
    searchFields: [
      "name",
      "titles",
      "portfolio",
      "description",
      "dm_notes",
      "symbol",
      "alignment",
    ],
    extraListColumns: ["alignment", "pantheon_id"],
    campaignScoped: true,
    create: {
      fields: {
        name: { type: "text", required: true },
        campaign_id: { type: "uuid", required: true },
        titles: {
          type: "text",
          description: 'Epithets, e.g. "The Morninglord".',
        },
        alignment: { type: "text" },
        symbol: { type: "text", description: "Holy symbol description." },
        portfolio: { type: "text", description: "What the deity governs." },
        description: { type: "text" },
        dm_notes: { type: "text" },
        pantheon_id: { type: "uuid" },
        domains: { type: "text[]", description: "Cleric domains." },
        tags: { type: "text[]" },
      },
    },
  },
  pantheon: {
    type: "pantheon",
    label: "Pantheon",
    table: "pantheons",
    nameField: "name",
    summaryField: "description",
    searchFields: ["name", "description"],
    campaignScoped: true,
    create: {
      fields: {
        name: { type: "text", required: true },
        campaign_id: { type: "uuid", required: true },
        description: { type: "text" },
        tags: { type: "text[]" },
      },
    },
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
    searchFields: [
      "name",
      "description",
      "solution",
      "success_outcome",
      "failure_consequence",
      "read_aloud",
    ],
    extraListColumns: ["puzzle_type", "difficulty"],
    campaignScoped: true,
    create: {
      fields: {
        name: { type: "text", required: true },
        campaign_id: { type: "uuid" },
        puzzle_type: {
          type: "text",
          description: "e.g. Logic, Riddle, Mechanical. Defaults to Logic.",
        },
        difficulty: {
          type: "text",
          description: "e.g. Easy, Medium, Hard. Defaults to Medium.",
        },
        description: { type: "text" },
        solution: { type: "text" },
        success_outcome: { type: "text" },
        failure_consequence: { type: "text" },
        read_aloud: {
          type: "text",
          description: "Boxed text to read to players.",
        },
        notes: { type: "text" },
        tags: { type: "text[]" },
      },
    },
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
    create: {
      fields: {
        title: { type: "text", required: true },
        campaign_id: { type: "uuid" },
        content: { type: "text" },
        category: { type: "text", description: "Defaults to general." },
        session_num: { type: "number" },
        tags: { type: "text[]" },
      },
    },
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
    searchFields: [
      "name",
      "player_name",
      "class",
      "notes",
      "personality_traits",
      "ideals",
      "bonds",
      "flaws",
    ],
    extraListColumns: ["class", "level"],
    campaignScoped: true,
  },
};

/** All exposed type keys — used to build tool input enums. */
export const ENTITY_TYPES = Object.keys(ENTITY_REGISTRY);

/** Type keys that support `create`/`update` (i.e. declare a `create` block). */
export const CREATABLE_TYPES = ENTITY_TYPES.filter(
  (t) => ENTITY_REGISTRY[t].create,
);

/**
 * Compact per-type writable-field reference for the `create`/`update` tool
 * descriptions, generated from the registry so it never drifts. Markers:
 * `*` required · `[]` array · `#` number · `?` boolean · `(a|b)` enum values.
 */
export function describeCreatableFields(): string {
  return CREATABLE_TYPES.map((t) => {
    const def = ENTITY_REGISTRY[t];
    const parts = Object.entries(def.create!.fields).map(([name, f]) => {
      let s = name;
      if (f.type === "enum" && f.values) s += `(${f.values.join("|")})`;
      else if (f.type === "text[]") s += "[]";
      else if (f.type === "number") s += "#";
      else if (f.type === "boolean") s += "?";
      if (f.required) s += "*";
      return s;
    });
    return `${t}: ${parts.join(", ")}`;
  }).join("\n");
}

/** Lightweight column list for list/search rows (keeps heavy JSONB out). */
export function listColumns(def: EntityDef): string {
  const cols = new Set<string>(["id", def.nameField]);
  if (def.summaryField) cols.add(def.summaryField);
  for (const c of def.extraListColumns ?? []) cols.add(c);
  if (def.campaignScoped) cols.add("campaign_id");
  cols.add("updated_at");
  return [...cols].join(",");
}
