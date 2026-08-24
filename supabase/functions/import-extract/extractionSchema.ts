/**
 * The JSON Schema the extraction model is constrained to (#353).
 *
 * Split out of `index.ts` because it is a different kind of thing: this is the
 * *contract sent to the provider*, mirroring `src/types/documentImport.types.ts`,
 * while the handler next door is auth, credits, storage and persistence. Keeping
 * them apart means a change to the extraction shape is reviewable as a change to
 * the shape, without reading past a hundred lines of request plumbing — and it
 * keeps both files inside the 600-line soft cap.
 *
 * The mirroring is manual and has to stay that way: `documentImport.types.ts` is
 * a Vite/browser module and this is Deno, so it cannot be imported. Adding a
 * field to an `Extracted*` interface means adding it here too.
 */

// ── Extraction JSON Schema ───────────────────────────────────────────────────
//
// Built from the contract in src/types/documentImport.types.ts (read, not
// imported — that file is a Vite/browser module). `obj()`/`nullableObj()`
// mechanically attach `required: Object.keys(properties)` and
// `additionalProperties: false` to every object schema, which is what
// structured outputs require on *every* object, not just the top level — a
// hand-written `required` array drifts the moment a property is added and
// the array isn't; deriving it from the same `properties` object cannot.
//
// One deliberate divergence from the TS contract: `MonsterStatBlock.skills`
// is `Record<string, string>` (a free-form key map), which additionalProperties:
// false cannot express — a JSON Schema object with a closed property list has
// no way to accept an arbitrary skill name as a key. The wire schema below
// asks the model for an array of `{ skill, modifier }` pairs instead, and
// `normalizeStatBlockSkills()` below folds that array back into a
// `Record<string, string>` before anything is persisted — so the *shape this
// function stores* still matches `Partial<MonsterStatBlock>` exactly; only the
// shape asked of the model differs, and only where the contract forced it to.
//
// `spellcasting` is left out of the stat_block schema entirely on purpose:
// `SpellcastingBlock.entries[].spell_ids` is an array of foreign keys into
// `spells` rows that don't exist yet at extraction time (spells import in a
// later wizard step). Asking the model to fill it would only produce
// fabricated ids — the exact failure mode the type file's header comment
// warns against for every other FK-shaped field.

function obj(properties: Record<string, unknown>): Record<string, unknown> {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

function nullableObj(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: ["object", "null"],
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function nullableArrayOf(items: Record<string, unknown>): Record<string, unknown> {
  return { type: ["array", "null"], items };
}

const NULLABLE_STRING = { type: ["string", "null"] };
const NULLABLE_NUMBER = { type: ["number", "null"] };
const NULLABLE_INTEGER = { type: ["integer", "null"] };
const NULLABLE_BOOLEAN = { type: ["boolean", "null"] };
const NULLABLE_STRING_ARRAY = { type: ["array", "null"], items: { type: "string" } };
const CONFIDENCE = { type: "string", enum: ["complete", "partial"] };

const NAMED_DESC_ITEM = obj({ name: { type: "string" }, description: { type: "string" } });
const SKILL_ENTRY = obj({ skill: { type: "string" }, modifier: { type: "string" } });

const STAT_BLOCK_SCHEMA = nullableObj({
  armor_class: NULLABLE_INTEGER,
  hit_points: NULLABLE_STRING,
  speed: NULLABLE_STRING,
  str: NULLABLE_INTEGER,
  dex: NULLABLE_INTEGER,
  con: NULLABLE_INTEGER,
  int: NULLABLE_INTEGER,
  wis: NULLABLE_INTEGER,
  cha: NULLABLE_INTEGER,
  challenge_rating: NULLABLE_STRING,
  proficiency_bonus: NULLABLE_INTEGER,
  initiative_bonus: NULLABLE_INTEGER,
  saving_throws: NULLABLE_STRING,
  skills: nullableArrayOf(SKILL_ENTRY),
  damage_vulnerabilities: NULLABLE_STRING,
  damage_resistances: NULLABLE_STRING,
  damage_immunities: NULLABLE_STRING,
  condition_immunities: NULLABLE_STRING,
  senses: NULLABLE_STRING,
  languages: NULLABLE_STRING,
  special_abilities: nullableArrayOf(NAMED_DESC_ITEM),
  actions: nullableArrayOf(NAMED_DESC_ITEM),
  bonus_actions: nullableArrayOf(NAMED_DESC_ITEM),
  reactions: nullableArrayOf(NAMED_DESC_ITEM),
  legendary_resistance: NULLABLE_INTEGER,
  legendary_actions: nullableArrayOf(NAMED_DESC_ITEM),
  lair_actions: nullableArrayOf(NAMED_DESC_ITEM),
});

const MONSTER_DATA = obj({
  name: { type: "string" },
  monster_type: NULLABLE_STRING,
  size: NULLABLE_STRING,
  alignment: NULLABLE_STRING,
  description: NULLABLE_STRING,
  habitat: NULLABLE_STRING,
  stat_block: STAT_BLOCK_SCHEMA,
});

const NPC_DATA = obj({
  name: { type: "string" },
  race: NULLABLE_STRING,
  alignment: NULLABLE_STRING,
  age: NULLABLE_STRING,
  occupation: NULLABLE_STRING,
  appearance: NULLABLE_STRING,
  personality: NULLABLE_STRING,
  backstory: NULLABLE_STRING,
  notes: NULLABLE_STRING,
  faction_name: NULLABLE_STRING,
});

const LOCATION_DATA = obj({
  name: { type: "string" },
  location_type: NULLABLE_STRING,
  description: NULLABLE_STRING,
  notes: NULLABLE_STRING,
  parent_name: NULLABLE_STRING,
});

const ITEM_DATA = obj({
  name: { type: "string" },
  item_type: NULLABLE_STRING,
  subtype: NULLABLE_STRING,
  rarity: NULLABLE_STRING,
  requires_attunement: NULLABLE_BOOLEAN,
  attunement_requirements: NULLABLE_STRING,
  weight: NULLABLE_NUMBER,
  cost: NULLABLE_STRING,
  description: NULLABLE_STRING,
  armor_class: NULLABLE_STRING,
  properties: NULLABLE_STRING_ARRAY,
  charges: NULLABLE_INTEGER,
  weapon_range: NULLABLE_STRING,
  versatile_damage: NULLABLE_STRING,
});

const SPELL_DATA = obj({
  name: { type: "string" },
  level: NULLABLE_INTEGER,
  school: NULLABLE_STRING,
  casting_time: NULLABLE_STRING,
  range: NULLABLE_STRING,
  duration: NULLABLE_STRING,
  components: NULLABLE_STRING_ARRAY,
  material: NULLABLE_STRING,
  concentration: NULLABLE_BOOLEAN,
  ritual: NULLABLE_BOOLEAN,
  description: NULLABLE_STRING,
  higher_levels: NULLABLE_STRING,
  classes: NULLABLE_STRING_ARRAY,
});

const QUEST_DATA = obj({
  title: { type: "string" },
  summary: NULLABLE_STRING,
  description: NULLABLE_STRING,
  rewards: NULLABLE_STRING,
  notes: NULLABLE_STRING,
  giver_npc_name: NULLABLE_STRING,
  location_name: NULLABLE_STRING,
});

const FACTION_DATA = obj({
  name: { type: "string" },
  faction_type: NULLABLE_STRING,
  alignment: NULLABLE_STRING,
  description: NULLABLE_STRING,
});

function entityArray(dataSchema: Record<string, unknown>): Record<string, unknown> {
  return nullableArrayOf(
    obj({ ref: { type: "string" }, page: NULLABLE_INTEGER, confidence: CONFIDENCE, data: dataSchema }),
  );
}

const EXTRACTION_SCHEMA = obj({
  monsters: entityArray(MONSTER_DATA),
  npcs: entityArray(NPC_DATA),
  locations: entityArray(LOCATION_DATA),
  items: entityArray(ITEM_DATA),
  spells: entityArray(SPELL_DATA),
  quests: entityArray(QUEST_DATA),
  factions: entityArray(FACTION_DATA),
});

export { EXTRACTION_SCHEMA };
