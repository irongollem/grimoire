// Registry of DM-facing entity types exposed to the MCP server.
//
// One entry per type drives `search` / `get` / `list` / `create` / `update`
// generically, so adding a new entity is a single registry line rather than new
// tool code. Tenancy is NOT enforced here — every query runs through a Supabase
// client carrying the DM's OAuth JWT, so the existing RLS policies
// (`user_id = auth.uid()` plus campaign visibility) scope results automatically.
//
// Notes baked in from the schema:
//   • `quests`, `notes`, `rules` name their entity in `title`, not `name`.
//   • Heavy JSONB columns (`stat_block`, `combatants`, `content`, trap `description`,
//     …) are kept OUT of `searchFields`/list columns — `get` returns them via `*`.
//   • Image columns are never writable. Art lands in a storage bucket under a
//     path convention (`srd/` for canonical, `{userId}/` for private) via a
//     signed upload, and a bare URL write would let a caller point an entity at
//     any object it likes. `get_image` reads art; writing it stays in the UI.

/**
 * Writable-field value kinds the `create`/`update` tools validate + coerce.
 *
 * Note there is no rich-text kind. Several writable columns are Tiptap-backed
 * (npc `backstory`, item `description`, trap `description`, rule `content`, …)
 * and take plain text here: every reader — `RichTextEditor.parseContent`,
 * `renderTiptapHtml`, `tiptapToPlainText` — falls back to treating a
 * non-document value as a paragraph of legacy plain text, which is precisely
 * the shape the DB held before those fields were migrated. That holds for the
 * JSONB ones too: PostgREST stores a JS string in a `jsonb` column as a JSON
 * string scalar, and it reads back as the same string.
 */
export type FieldType =
  | "text"
  | "enum"
  | "number"
  | "boolean"
  | "uuid"
  | "text[]"
  | "uuid[]"
  | "json";

export interface FieldDef {
  type: FieldType;
  /** Required on create (ignored on update — updates are partial). */
  required?: boolean;
  /** Allowed values when `type` is "enum". */
  values?: readonly string[];
  /** Inclusive bounds for `number`, mirroring the column's CHECK constraint. */
  min?: number;
  max?: number;
  /**
   * Compact shape hint for `json`, surfaced in the tool description — the one
   * kind whose payload an agent cannot guess from the field name.
   */
  shape?: string;
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
  /**
   * How the table's `campaign_id` behaves, which decides how a `campaign_id`
   * argument filters `list`/`search`:
   *
   *   "owned"  — the column names the campaign the row belongs to; filter with
   *              an equality match (npcs, quests, party members, …).
   *   "shared" — the column is an optional narrowing of a global library, where
   *              NULL means "available in every campaign" (items, monsters,
   *              spells, traps, rules). Filtering must therefore keep the NULL
   *              rows, or a campaign-scoped search hides the DM's whole
   *              general catalogue.
   *
   * All five "shared" tables were declared unscoped here until write support
   * landed: they predate their own `campaign_id` columns (added between May and
   * Aug 2026), so a `campaign_id` argument was silently ignored for them and
   * "list the items in this campaign" quietly answered with every campaign's.
   * See #596 for the separate question of what the *default* scope should be.
   */
  campaignScope: "owned" | "shared";
  /** Writable fields for `create`/`update`. Omit to keep the entity read-only. */
  create?: CreateDef;
  /**
   * Image columns exposable as MCP image blocks via `get_image`, keyed by a
   * short `which` selector (e.g. "portrait", "map"). Insertion order matters:
   * the first entry is the default when the caller omits `which`. Omit for
   * entities that carry no art.
   */
  imageFields?: Record<string, string>;
}

// Enum value-lists. `QUEST_STATUS` and `LOCATION_TYPE` mirror real DB enums
// (quest_status_enum, location_type_enum); the rest mirror the `as const`
// vocabularies in src/types/*.types.ts, which are the app's source of truth for
// columns the DB stores as bare TEXT.
//
// They are copied rather than imported because the dependency only runs one way
// — the app resolves `@edge-shared/*`, but a Deno-hosted function cannot resolve
// `@/*` (see _shared/cdn-buckets.ts for the same constraint). Divergence is not
// left to a "keep in sync" comment: registry.test.ts imports both sides and
// fails on any mismatch.
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

// src/types/item.types.ts
const ITEM_TYPE = [
  "weapon",
  "armor",
  "shield",
  "potion",
  "wondrous_item",
  "ring",
  "rod",
  "staff",
  "wand",
  "scroll",
  "ammunition",
  "gear",
  "tool",
  "vehicle",
  "trade_good",
  "crafting_material",
  "provision",
  "art_object",
  "service",
  "pack",
] as const;
const ITEM_RARITY = [
  "mundane",
  "common",
  "uncommon",
  "rare",
  "very_rare",
  "legendary",
  "artifact",
] as const;
const WEAPON_MASTERY = [
  "cleave",
  "graze",
  "nick",
  "push",
  "sap",
  "slow",
  "topple",
  "vex",
] as const;

// src/types/monster.types.ts
const MONSTER_TYPE = [
  "aberration",
  "beast",
  "celestial",
  "construct",
  "dragon",
  "elemental",
  "fey",
  "fiend",
  "giant",
  "humanoid",
  "monstrosity",
  "ooze",
  "plant",
  "undead",
] as const;
const MONSTER_SIZE = [
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan",
] as const;

// src/types/spell.types.ts
const SPELL_SCHOOL = [
  "abjuration",
  "conjuration",
  "divination",
  "enchantment",
  "evocation",
  "illusion",
  "necromancy",
  "transmutation",
] as const;
const SPELL_ATTACK_TYPE = [
  "ranged_spell",
  "melee_spell",
  "save",
  "automatic",
  "none",
] as const;
const SAVE_ATTRIBUTE = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
const SAVE_EFFECT = ["half", "negates", "special"] as const;
const AOE_SHAPE = [
  "sphere",
  "cone",
  "line",
  "cylinder",
  "cube",
  "emanation",
] as const;

// src/types/trap.types.ts
const TRAP_TYPE = ["Mechanical", "Magical", "Hybrid", "Environmental"] as const;
const TRAP_TRIGGER = [
  "Tripwire",
  "Pressure Plate",
  "Proximity",
  "Visual",
  "Sound",
  "Magic Sensor",
  "Manual",
  "Other",
] as const;
const TRAP_RESET_TYPE = ["None", "Automatic", "Manual"] as const;

// src/types/rule.types.ts
const RULE_CATEGORY = [
  "Combat",
  "Exploration",
  "Social",
  "Crafting",
  "Magic",
  "Environment",
  "Economy",
  "Other",
] as const;

/**
 * `[{dice, type}]` damage lists — the same shape on item `damage_rolls`, trap
 * `damage_entries` and spell `damage_rolls`. Declared once so the three tool
 * descriptions cannot drift apart.
 */
const DAMAGE_LIST: FieldDef = {
  type: "json",
  shape: '[{dice,type}]',
  description: 'e.g. [{"dice":"1d8","type":"slashing"}]; "type" may be "" for untyped.',
};

/**
 * A campaign_id on one of the "shared" library tables. NULL files the row in the
 * DM's general catalogue, visible from every campaign — which is what an
 * agentic ingest of a rulebook or a source image usually wants.
 */
const SHARED_CAMPAIGN_ID: FieldDef = {
  type: "uuid",
  description: "Omit for the general catalogue (visible in every campaign); set to confine it to one.",
};

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
    campaignScope: "owned",
    imageFields: {
      portrait: "portrait_url",
      disguise: "disguise_portrait_url",
    },
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
    campaignScope: "shared",
    imageFields: { image: "image_url" },
    create: {
      fields: {
        name: { type: "text", required: true },
        campaign_id: SHARED_CAMPAIGN_ID,
        monster_type: {
          type: "enum",
          values: MONSTER_TYPE,
          description: "Defaults to humanoid.",
        },
        size: {
          type: "enum",
          values: MONSTER_SIZE,
          description: "Defaults to medium.",
        },
        alignment: {
          type: "text",
          description: 'e.g. "chaotic evil". Defaults to unaligned.',
        },
        habitat: { type: "text" },
        lair_location_id: { type: "uuid" },
        // The column is NOT NULL DEFAULT '{}', so a monster can legitimately be
        // created as a name-only stub and statted later — but a stub renders as
        // an empty stat block, so the shape is spelled out rather than left to
        // a round trip through `get`.
        stat_block: {
          type: "json",
          shape:
            "{armor_class#,hit_points,speed,str#,dex#,con#,int#,wis#,cha#,challenge_rating}",
          description:
            'hit_points is a dice expression ("8d8+16"), challenge_rating a string ("5", "1/2"). Optional: saving_throws, skills, senses, languages, damage_resistances/immunities/vulnerabilities, condition_immunities, special_abilities/actions/bonus_actions/reactions/legendary_actions/lair_actions (each [{name,description}]). Omitted = an empty stat block.',
        },
        description: { type: "text" },
        notes: { type: "text", description: "DM-facing tactics and lair notes." },
        source: { type: "text", description: "Free text when hand-entered." },
        tags: { type: "text[]" },
      },
    },
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
    campaignScope: "shared",
    imageFields: { image: "image_url" },
    create: {
      fields: {
        name: { type: "text", required: true },
        campaign_id: SHARED_CAMPAIGN_ID,
        level: {
          type: "number",
          min: 0,
          max: 9,
          description: "0 for a cantrip. Defaults to 1.",
        },
        school: {
          type: "enum",
          values: SPELL_SCHOOL,
          description: "Defaults to evocation.",
        },
        casting_time: {
          type: "text",
          description: 'e.g. "Action", "Bonus Action", "1 Minute". Defaults to Action.',
        },
        range: { type: "text", description: 'e.g. "60 ft.", "Self", "Touch".' },
        duration: {
          type: "text",
          description: 'e.g. "Instantaneous", "1 hour".',
        },
        components: {
          type: "text[]",
          description: 'Any of "V", "S", "M".',
        },
        material: { type: "text", description: "The M component's material." },
        concentration: { type: "boolean" },
        ritual: { type: "boolean" },
        description: { type: "text" },
        higher_levels: { type: "text", description: "The At Higher Levels rider." },
        classes: {
          type: "text[]",
          description: 'Class names, e.g. ["Wizard", "Sorcerer"].',
        },
        attack_type: { type: "enum", values: SPELL_ATTACK_TYPE },
        save_attribute: { type: "enum", values: SAVE_ATTRIBUTE },
        save_effect: { type: "enum", values: SAVE_EFFECT },
        damage_rolls: DAMAGE_LIST,
        healing_dice: { type: "text", description: 'e.g. "2d4+2".' },
        aoe_shape: { type: "enum", values: AOE_SHAPE },
        aoe_size: { type: "text", description: 'e.g. "20 ft.".' },
        condition_inflicted: { type: "text" },
        target_description: { type: "text" },
        source: { type: "text", description: "Free text when hand-entered." },
        tags: { type: "text[]" },
      },
    },
  },
  item: {
    type: "item",
    label: "Item",
    table: "items",
    nameField: "name",
    summaryField: "item_type",
    searchFields: ["name", "description", "item_type", "rarity"],
    extraListColumns: ["item_type", "rarity"],
    campaignScope: "shared",
    imageFields: { image: "image_url", mundane: "mundane_image_url" },
    create: {
      fields: {
        name: { type: "text", required: true },
        campaign_id: SHARED_CAMPAIGN_ID,
        item_type: {
          type: "enum",
          values: ITEM_TYPE,
          description: "Defaults to gear.",
        },
        subtype: {
          type: "text",
          description: 'The concrete kind, e.g. "longsword", "chain mail".',
        },
        rarity: {
          type: "enum",
          values: ITEM_RARITY,
          description: "Defaults to mundane.",
        },
        requires_attunement: { type: "boolean" },
        attunement_requirements: {
          type: "text",
          description: 'e.g. "by a spellcaster".',
        },
        weight: { type: "number", description: "In pounds." },
        cost: { type: "text", description: 'e.g. "50 gp".' },
        damage_rolls: DAMAGE_LIST,
        versatile_damage: {
          type: "text",
          description: 'Two-handed damage dice for a versatile weapon, e.g. "1d10".',
        },
        weapon_range: { type: "text", description: 'e.g. "80/320 ft.".' },
        properties: {
          type: "text[]",
          description: 'Weapon properties, e.g. ["finesse", "light"].',
        },
        mastery: {
          type: "enum",
          values: WEAPON_MASTERY,
          description: "2024 weapon mastery property (weapons only).",
        },
        armor_class: {
          type: "text",
          description: 'Formula text, e.g. "13 + DEX modifier (max 2)".',
        },
        charges: {
          type: "number",
          description: "Max charges, or quantity for ammunition.",
        },
        recharge: {
          type: "text",
          description: 'e.g. "Regains 1d6+4 charges daily at dawn".',
        },
        spell_ids: {
          type: "uuid[]",
          description: "Spells this item casts — ids from `search`/`list` of type spell.",
        },
        is_arcane_focus: { type: "boolean" },
        description: { type: "text" },
        mundane_description: {
          type: "text",
          description: "What players see before the item is identified.",
        },
        curse_description: { type: "text" },
        dm_notes: { type: "text", description: "Never shown to players." },
        source: { type: "text", description: "Free text when hand-entered." },
        tags: { type: "text[]" },
      },
    },
  },
  location: {
    type: "location",
    label: "Location",
    table: "locations",
    nameField: "name",
    summaryField: "location_type",
    searchFields: ["name", "description", "notes", "player_summary"],
    extraListColumns: ["location_type", "parent_id"],
    campaignScope: "owned",
    imageFields: { image: "image_url", map: "map_url" },
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
    campaignScope: "owned",
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
    campaignScope: "owned",
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
    campaignScope: "owned",
    imageFields: { emblem: "emblem_url" },
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
    campaignScope: "owned",
    imageFields: { portrait: "portrait_url" },
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
    campaignScope: "owned",
    imageFields: { emblem: "emblem_url" },
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
    campaignScope: "shared",
    imageFields: { image: "image_url" },
    create: {
      fields: {
        name: { type: "text", required: true },
        campaign_id: SHARED_CAMPAIGN_ID,
        trap_type: {
          type: "enum",
          values: TRAP_TYPE,
          description: "Defaults to Mechanical.",
        },
        cr: {
          type: "text",
          description: 'Challenge rating as a string, e.g. "5", "1/4".',
        },
        trigger_type: { type: "enum", values: TRAP_TRIGGER },
        detection_dc: { type: "number" },
        disarm_dc: { type: "number" },
        effect_description: {
          type: "text",
          description: "What the trap does when it fires — the short mechanical summary.",
        },
        save_type: { type: "enum", values: SAVE_ATTRIBUTE },
        save_dc: { type: "number" },
        attack_bonus: { type: "number" },
        damage_entries: DAMAGE_LIST,
        damage_immunities: {
          type: "text[]",
          description: "Defaults to poison + psychic (a trap is an object).",
        },
        reset_type: {
          type: "enum",
          values: TRAP_RESET_TYPE,
          description: "Defaults to None.",
        },
        trap_hp: { type: "number" },
        trap_ac: { type: "number" },
        description: { type: "text", description: "Flavour text, lore, appearance." },
        notes: { type: "text", description: "DM-facing notes." },
        tags: { type: "text[]" },
      },
    },
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
    campaignScope: "owned",
    imageFields: { image: "image_url" },
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
    campaignScope: "owned",
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
    campaignScope: "shared",
    create: {
      fields: {
        title: { type: "text", required: true },
        campaign_id: SHARED_CAMPAIGN_ID,
        content: { type: "text", description: "The rule text itself." },
        category: { type: "enum", values: RULE_CATEGORY },
        is_player_visible: {
          type: "boolean",
          description: "Publishes the rule to the player portal. Defaults to false.",
        },
        tags: { type: "text[]" },
        // `tracker` (the per-character exhaustion/sanity/hunger meter a custom
        // rule can carry) is deliberately not writable: it is a nested config of
        // levels, thresholds, triggers and DM buttons that drives live player
        // state, and it has a purpose-built editor. Nothing about it is
        // transcribable from a source the way the rule text is.
      },
    },
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
    campaignScope: "owned",
    imageFields: { portrait: "portrait_url" },
    create: {
      fields: {
        name: { type: "text", required: true },
        campaign_id: { type: "uuid" },
        player_name: { type: "text", description: "The human at the table." },
        class: { type: "text" },
        subclass: { type: "text" },
        level: { type: "number", min: 1, max: 20, description: "Defaults to 1." },
        subrace: { type: "text" },
        alignment: { type: "text" },
        deity: { type: "text" },
        experience_points: { type: "number" },
        max_hp: { type: "number", description: "Defaults to 10." },
        current_hp: { type: "number", description: "Defaults to 10." },
        temp_hp: { type: "number" },
        ac: { type: "number", description: "Defaults to 10." },
        speed: { type: "number", description: "In feet. Defaults to 30." },
        initiative_bonus: { type: "number" },
        proficiency_bonus: { type: "number", description: "Defaults to 2." },
        str: { type: "number", description: "Ability score, not modifier. Defaults to 10." },
        dex: { type: "number" },
        con: { type: "number" },
        int: { type: "number" },
        wis: { type: "number" },
        cha: { type: "number" },
        saving_throw_proficiencies: {
          type: "text[]",
          description: 'Lowercase ability keys, e.g. ["str", "con"].',
        },
        tool_proficiencies: { type: "text[]" },
        languages: { type: "text[]" },
        age: { type: "text" },
        gender: { type: "text" },
        pronouns: { type: "text" },
        physical_description: { type: "text" },
        personality_traits: { type: "text" },
        ideals: { type: "text" },
        bonds: { type: "text" },
        flaws: { type: "text" },
        notes: { type: "text" },
        // Not writable: `skill_proficiencies`, `spell_slots`, `class_resources`,
        // `class_choices`, `level_choices`, `custom_attacks`, `wildshape_state`.
        // These are live sheet state the runner and the level-up flow own, and a
        // blind overwrite of one desynchronises a character mid-session.
        // `owner_user_id`/`is_dm_managed` are likewise UI-only — they decide who
        // controls the sheet, which is a sharing decision, not a data one.
      },
    },
  },
};

/** All exposed type keys — used to build tool input enums. */
export const ENTITY_TYPES = Object.keys(ENTITY_REGISTRY);

/** Type keys that support `create`/`update` (i.e. declare a `create` block). */
export const CREATABLE_TYPES = ENTITY_TYPES.filter(
  (t) => ENTITY_REGISTRY[t].create,
);

/** Type keys that expose at least one image via `get_image`. */
export const IMAGEABLE_TYPES = ENTITY_TYPES.filter(
  (t) => ENTITY_REGISTRY[t].imageFields,
);

/** Union of every `which` image selector across imageable types (for the tool enum). */
export const IMAGE_WHICH_VALUES = [
  ...new Set(
    IMAGEABLE_TYPES.flatMap((t) => Object.keys(ENTITY_REGISTRY[t].imageFields!)),
  ),
];

/**
 * Compact per-type image reference for the `get_image` tool description,
 * generated from the registry so it never drifts. The first `which` listed for
 * a type is its default.
 */
export function describeImageFields(): string {
  return IMAGEABLE_TYPES.map(
    (t) => `${t}: ${Object.keys(ENTITY_REGISTRY[t].imageFields!).join(", ")}`,
  ).join("\n");
}

/** The type marker a field carries in `describeCreatableFields` output. */
function fieldMarker(f: FieldDef): string {
  switch (f.type) {
    case "enum":
      return f.values ? `(${f.values.join("|")})` : "";
    case "text[]":
      return "[]";
    case "uuid[]":
      return "[uuid]";
    case "uuid":
      return "";
    case "number":
      return f.min !== undefined && f.max !== undefined ? `#${f.min}-${f.max}` : "#";
    case "boolean":
      return "?";
    case "json":
      return f.shape ?? "{}";
    case "text":
      return "";
  }
}

/**
 * Per-type writable-field reference for the `create`/`update` tool
 * descriptions, generated from the registry so it never drifts. Each type gets
 * a signature line, followed by an indented note for every field that declares
 * one. Markers: `*` required · `[]` string array · `[uuid]` id array ·
 * `#` number (`#0-9` when bounded) · `?` boolean · `(a|b)` enum values ·
 * `{…}` JSON shape.
 *
 * The notes are not decoration — they carry the defaults and the units
 * (ability score vs. modifier, pounds, dice expression) that decide whether a
 * transcribed row is right or subtly wrong, and until they were rendered here
 * they were written into the registry and shown to nobody.
 */
export function describeCreatableFields(): string {
  return CREATABLE_TYPES.map((t) => {
    const fields = Object.entries(ENTITY_REGISTRY[t].create!.fields);
    const signature = fields
      .map(([name, f]) => `${name}${fieldMarker(f)}${f.required ? "*" : ""}`)
      .join(", ");
    const notes = fields
      .filter(([, f]) => f.description)
      .map(([name, f]) => `  ${name} — ${f.description}`);
    return [`${t}: ${signature}`, ...notes].join("\n");
  }).join("\n");
}

/** Lightweight column list for list/search rows (keeps heavy JSONB out). */
export function listColumns(def: EntityDef): string {
  const cols = new Set<string>(["id", def.nameField]);
  if (def.summaryField) cols.add(def.summaryField);
  for (const c of def.extraListColumns ?? []) cols.add(c);
  // Every exposed table carries campaign_id — on a "shared" one a null value is
  // itself the answer to "which campaign is this in?", so it is always listed.
  cols.add("campaign_id");
  cols.add("updated_at");
  return [...cols].join(",");
}
