import type { RulesetKey } from "@/types/ruleset.types";
import type { AiProvenance } from "@/ai/provenance";
import { ordinal } from "@/lib/ordinal";

export const SPELL_SCHOOLS = [
  "abjuration",
  "conjuration",
  "divination",
  "enchantment",
  "evocation",
  "illusion",
  "necromancy",
  "transmutation",
] as const;

export type SpellSchool = (typeof SPELL_SCHOOLS)[number];

export const SPELL_CLASSES = [
  "Artificer",
  "Bard",
  "Cleric",
  "Druid",
  "Paladin",
  "Ranger",
  "Sorcerer",
  "Warlock",
  "Wizard",
  "Fighter (Eldritch Knight)",
  "Rogue (Arcane Trickster)",
] as const;

export type SpellClass = (typeof SPELL_CLASSES)[number];

export const SPELL_COMPONENTS = ["V", "S", "M"] as const;

// Re-exported from shared foundation so existing imports keep working
export { DAMAGE_TYPES, type DamageType } from "./damage.types";

export const AOE_SHAPES = ["sphere", "cone", "line", "cylinder", "cube", "emanation"] as const;
export type AoeShape = (typeof AOE_SHAPES)[number];

export const ATTACK_TYPES = [
  { value: "ranged_spell", label: "Ranged Spell Attack" },
  { value: "melee_spell", label: "Melee Spell Attack" },
  { value: "save", label: "Saving Throw" },
  { value: "automatic", label: "Automatic (no roll)" },
  { value: "none", label: "None / Utility" },
] as const;

export const SAVE_ATTRIBUTES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;

export const SAVE_EFFECTS = [
  { value: "half", label: "Half damage on save" },
  { value: "negates", label: "No effect on save" },
  { value: "special", label: "Special" },
] as const;
export type SpellComponent = (typeof SPELL_COMPONENTS)[number];

// Casting time options (stored as plain text in DB for flexibility)
export const CASTING_TIME_OPTIONS = [
  { value: "Action", label: "Action" },
  { value: "Bonus Action", label: "Bonus Action" },
  { value: "Reaction", label: "Reaction" },
  { value: "1 Minute", label: "1 Minute" },
  { value: "10 Minutes", label: "10 Minutes" },
  { value: "1 Hour", label: "1 Hour" },
  { value: "8 Hours", label: "8 Hours" },
  { value: "24 Hours", label: "24 Hours" },
  { value: "Special", label: "Special" },
];

// Duration options
export const DURATION_OPTIONS = [
  { value: "Instantaneous", label: "Instantaneous" },
  { value: "Until Dispelled", label: "Until Dispelled" },
  { value: "1 Round", label: "1 Round" },
  {
    value: "Concentration, up to 1 minute",
    label: "Concentration, up to 1 minute",
  },
  {
    value: "Concentration, up to 10 minutes",
    label: "Concentration, up to 10 minutes",
  },
  {
    value: "Concentration, up to 1 hour",
    label: "Concentration, up to 1 hour",
  },
  {
    value: "Concentration, up to 8 hours",
    label: "Concentration, up to 8 hours",
  },
  { value: "1 Minute", label: "1 Minute" },
  { value: "10 Minutes", label: "10 Minutes" },
  { value: "1 Hour", label: "1 Hour" },
  { value: "8 Hours", label: "8 Hours" },
  { value: "24 Hours", label: "24 Hours" },
  { value: "7 Days", label: "7 Days" },
  { value: "30 Days", label: "30 Days" },
  { value: "Special", label: "Special" },
];

// Range options
export const RANGE_OPTIONS = [
  { value: "Self", label: "Self" },
  { value: "Touch", label: "Touch" },
  { value: "5 ft.", label: "5 ft." },
  { value: "10 ft.", label: "10 ft." },
  { value: "30 ft.", label: "30 ft." },
  { value: "60 ft.", label: "60 ft." },
  { value: "90 ft.", label: "90 ft." },
  { value: "120 ft.", label: "120 ft." },
  { value: "150 ft.", label: "150 ft." },
  { value: "300 ft.", label: "300 ft." },
  { value: "500 ft.", label: "500 ft." },
  { value: "1 mile", label: "1 mile" },
  { value: "Sight", label: "Sight" },
  { value: "Unlimited", label: "Unlimited" },
  { value: "Special", label: "Special" },
];

export interface HigherLevelDamage {
  /** Dice added per slot level above the spell's base level, e.g. "1d6". */
  dice_per_level: string;
  /** Damage type, or null to inherit from the base damage roll. */
  type: string | null;
}

export type SpellOutcome = "automatic" | "hit" | "critical_hit" | "miss" | "failed_save" | "successful_save" | "careful_save";

export interface StructuredSpellEffect {
  id: string;
  phase: "cast" | "impact" | "turn_start" | "turn_end" | "repeat";
  outcome: SpellOutcome;
  target: { type: string | null; count: number | null };
  kind: "damage" | "healing" | "condition" | "text";
  dice: string | null;
  multiplier: number;
  damageType: string | null;
  condition: string | null;
  description: string | null;
  scaling: { mode: "slot" | "character_level"; interval?: number; dice: string } | null;
  /** An explicit numeric bonus or the caster's spellcasting ability modifier. */
  modifier?: number | "spellcasting_ability" | null;
  /**
   * Several rays, darts or beams from one cast (Scorching Ray, Magic Missile,
   * Eldritch Blast), each aimed on its own. Stored with its scaling;
   * `effectsForCast` resolves it to the count for this cast and drops the scaling.
   * An attack instance (outcome "hit") rolls its own damage; automatic instances
   * strike together and share one roll (PHB "Damage Rolls").
   */
  instances?: SpellEffectInstances | null;
  /** The caster picks the damage type at cast (Chromatic Orb, Spirit Guardians); `damageType` is null then. */
  damageTypeChoices?: string[] | null;
}

export interface SpellEffectInstances {
  /** What one instance is called in the text: "ray", "dart", "beam". */
  noun: string;
  /** Instances at the spell's own level and the caster's first character level. */
  count: number;
  /** Extra instances per slot level above the spell's level (Magic Missile: 1). */
  perSlotAbove?: number;
  /** From this character level on, this many instances (Eldritch Blast: 5 → 2, 11 → 3, 17 → 4). */
  byCharacterLevel?: Array<{ level: number; count: number }>;
}

/** One row of `browse_spells`: just what a spell card paints. `is_shared` is a
 *  library row, or a custom row copied from the library (`source_record_key`). */
export interface SpellBrowseRow {
  id: string;
  name: string;
  level: number;
  school: SpellSchool;
  ritual: boolean;
  casting_time: string;
  range: string;
  components: string[];
  concentration: boolean;
  classes: string[];
  tags: string[];
  source: string | null;
  source_title: string | null;
  source_url: string | null;
  /** The card's art, resolved like the detail page's: the caller's override,
   *  then canonical library art, then the row's own. */
  image_url: string | null;
  image_focal_point: { x: number; y: number } | null;
  is_shared: boolean;
  /** The caller owns the row. Library rows and other members' custom spells
   *  (a player reads their DM's) are not own, so cannot be edited or re-scoped. */
  is_own: boolean;
}

export interface Spell {
  id: string;
  user_id: string;
  campaign_id: string | null; // null = universal/library; set = exclusive to that campaign
  name: string;
  level: number; // 0 = cantrip, 1-9
  school: SpellSchool;
  casting_time: string; // from CASTING_TIME_OPTIONS or custom
  casting_time_custom: string | null;
  range: string; // from RANGE_OPTIONS or custom
  range_custom: string | null;
  components: string[]; // ['V', 'S', 'M'] subset
  material: string | null; // material component description
  duration: string; // from DURATION_OPTIONS or custom
  duration_custom: string | null;
  concentration: boolean;
  ritual: boolean;
  // Mechanics (stored for display, filtering, and advisor pre-fill)
  attack_type: string | null; // ranged_spell | melee_spell | save | automatic | none
  save_attribute: string | null; // STR | DEX | CON | INT | WIS | CHA
  save_effect: string | null; // half | negates | special
  damage_rolls: import("@/lib/dice/dice").DamageRoll[] | null; // e.g. [{dice:"8d6",type:"fire"}]
  healing_dice: string | null; // e.g. "1d8"
  target_description: string | null; // e.g. "one creature you can see within range", "up to three creatures"
  aoe_shape: string | null; // sphere | cone | line | cylinder | cube | emanation
  aoe_size: string | null; // e.g. "20 ft. radius"
  condition_inflicted: string | null; // e.g. "blinded", "stunned"
  description: string;
  higher_levels: string | null;
  /** Machine-readable damage scaling: dice added per slot level above base. */
  higher_level_damage: HigherLevelDamage | null;
  /** Healing dice added per slot level above base, e.g. "1d8". */
  higher_level_healing: string | null;
  classes: string[];
  tags: string[];
  source: string | null;       // open5e document slug, used for filtering
  source_title: string | null; // human-readable document title ("Deep Magic 5e")
  source_url: string | null;   // link to the product/document page
  open5e_import: boolean;      // internal flag — not shown in UI
  /** Edition-independent identity for matching equivalent content across rulesets. */
  conceptual_key?: string | null;
  ruleset?: "2014" | "2024" | null;
  source_document_key?: string | null;
  source_record_key?: string | null;
  source_revision?: string | null;
  source_license?: string | null;
  provenance?: Record<string, unknown>;
  casting_options?: Array<Record<string, unknown>> | null;
  effect_schema_version?: number;
  effects?: StructuredSpellEffect[] | null;
  /** Structured mechanics stay advisory until this flag is explicitly reviewed. */
  mechanics_reviewed?: boolean;
  image_url: string | null; // optional art for card printing
  image_focal_point?: { x: number; y: number } | null;
  ai_provenance?: AiProvenance | null;
  created_at: string;
  updated_at: string;
}

export type SpellInsert = Omit<Spell, "id" | "user_id" | "created_at" | "updated_at" | "campaign_id"> & { campaign_id?: string | null };
export type SpellUpdate = Partial<SpellInsert>;

// ── Max prepared spells ───────────────────────────────────────────────────────
/**
 * DB-driven max prepared calculation using class data from system_classes / custom_classes.
 * Falls back to the static getMaxPrepared() when classData is unavailable.
 */
export function computeMaxPrepared(
  member: { level: number; int: number; wis: number; cha: number } | null,
  classData: { caster_type: string; prepared_ability: string | null; prepared_divisor: number | null } | null,
  fallbackCls: string,
): number | null {
  if (!member) return null;
  if (classData && (classData.caster_type === "prepared" || classData.caster_type === "spellbook") && classData.prepared_ability && classData.prepared_divisor) {
    const score = member[classData.prepared_ability as "int" | "wis" | "cha"];
    return Math.max(1, Math.floor((score - 10) / 2) + Math.floor(member.level / classData.prepared_divisor));
  }
  return getMaxPrepared(member, fallbackCls);
}

/** Returns the maximum number of spells a character can have prepared, or null for known casters. */
export function getMaxPrepared(
  member: { level: number; int: number; wis: number; cha: number } | null,
  cls: string,
): number | null {
  if (!member) return null;
  const mod = (score: number) => Math.floor((score - 10) / 2);
  switch (cls) {
    case "Cleric":    return Math.max(1, mod(member.wis) + member.level);
    case "Druid":     return Math.max(1, mod(member.wis) + member.level);
    case "Paladin":   return Math.max(1, mod(member.cha) + Math.floor(member.level / 2));
    case "Artificer": return Math.max(1, mod(member.int) + Math.floor(member.level / 2));
    case "Wizard":    return Math.max(1, mod(member.int) + member.level);
    default:          return null;
  }
}

// ── Caster types ──────────────────────────────────────────────────────────────
// prepared: Cleric, Druid, Paladin, Artificer — access full class list, no learning required
// known:    Sorcerer, Warlock, Bard, Ranger — learn a fixed number, always prepared once known
// spellbook:Wizard — copy spells to spellbook, then prepare a subset each day
// none:     non-caster or subclass caster (Fighter EK, Rogue AT, Monk, etc.)
export type CasterType = "prepared" | "known" | "spellbook" | "none";

/**
 * Cantrip damage multiplier per 5e rules: +1 die at character levels 5, 11, 17.
 * Uses total character level (sum of all class levels for multiclass characters).
 */
export function cantripDiceMultiplier(totalLevel: number): 1 | 2 | 3 | 4 {
  if (totalLevel >= 17) return 4;
  if (totalLevel >= 11) return 3;
  if (totalLevel >= 5) return 2;
  return 1;
}

export type InnateSourceType = 'class' | 'racial' | 'feat' | 'item' | 'other';
export type InnateResetsOn = 'long_rest' | 'short_rest';

export interface CharacterSpell {
  id: string;
  party_member_id: string;
  spell_id: string;
  is_known: boolean;
  is_prepared: boolean;
  /**
   * Granted by a subclass/oath/domain (always prepared). These do NOT count
   * against the prepared-spell limit and cannot be unprepared or removed.
   */
  always_prepared: boolean;
  source_type: InnateSourceType;
  uses_per_day: number | null;
  uses_remaining: number | null;
  resets_on: InnateResetsOn | null;
  source_label: string | null;
  source_class_id?: string | null;
  casting_ability?: "int" | "wis" | "cha" | null;
  created_at: string;
  updated_at: string;
}

export interface CharacterSpellEntry extends CharacterSpell {
  spell: Spell;
}

// Convenience helpers
/** "Cantrip", "1st", "3rd", "9th": a slot already labelled "Level", and a card's badge. */
export function spellLevelOrdinal(level: number): string {
  return level === 0 ? "Cantrip" : ordinal(level);
}

/** "Cantrip", "1st-Level", "3rd-Level": the level in running text. */
export function spellLevelLabel(level: number): string {
  return level === 0 ? "Cantrip" : `${spellLevelOrdinal(level)}-Level`;
}

// ── Default spell slots ───────────────────────────────────────────────────────
// Per-level slot counts indexed by character level (index 0 = level 1).
// Each row: [1st, 2nd, 3rd, 4th, 5th, 6th, 7th, 8th, 9th]

const FULL_CASTER_SLOTS: number[][] = [
  [2,0,0,0,0,0,0,0,0], // 1
  [3,0,0,0,0,0,0,0,0], // 2
  [4,2,0,0,0,0,0,0,0], // 3
  [4,3,0,0,0,0,0,0,0], // 4
  [4,3,2,0,0,0,0,0,0], // 5
  [4,3,3,0,0,0,0,0,0], // 6
  [4,3,3,1,0,0,0,0,0], // 7
  [4,3,3,2,0,0,0,0,0], // 8
  [4,3,3,3,1,0,0,0,0], // 9
  [4,3,3,3,2,0,0,0,0], // 10
  [4,3,3,3,2,1,0,0,0], // 11
  [4,3,3,3,2,1,0,0,0], // 12
  [4,3,3,3,2,1,1,0,0], // 13
  [4,3,3,3,2,1,1,0,0], // 14
  [4,3,3,3,2,1,1,1,0], // 15
  [4,3,3,3,2,1,1,1,0], // 16
  [4,3,3,3,2,1,1,1,1], // 17
  [4,3,3,3,3,1,1,1,1], // 18
  [4,3,3,3,3,2,1,1,1], // 19
  [4,3,3,3,3,2,2,1,1], // 20
];

// Half-casters (Paladin, Ranger). Level 1 = no slots.
const HALF_CASTER_SLOTS: number[][] = [
  [0,0,0,0,0], // 1
  [2,0,0,0,0], // 2
  [3,0,0,0,0], // 3
  [3,0,0,0,0], // 4
  [4,2,0,0,0], // 5
  [4,2,0,0,0], // 6
  [4,3,0,0,0], // 7
  [4,3,0,0,0], // 8
  [4,3,2,0,0], // 9
  [4,3,2,0,0], // 10
  [4,3,3,0,0], // 11
  [4,3,3,0,0], // 12
  [4,3,3,1,0], // 13
  [4,3,3,1,0], // 14
  [4,3,3,2,0], // 15
  [4,3,3,2,0], // 16
  [4,3,3,3,1], // 17
  [4,3,3,3,1], // 18
  [4,3,3,3,2], // 19
  [4,3,3,3,2], // 20
];

// Artificer single-class progression. Its round-up rule affects its contribution
// to multiclass caster level, not the levels at which its own slot tiers unlock.
const ARTIFICER_SLOTS: number[][] = [
  [2,0,0,0,0], // 1
  [2,0,0,0,0], // 2
  [3,0,0,0,0], // 3
  [3,0,0,0,0], // 4
  [4,2,0,0,0], // 5
  [4,2,0,0,0], // 6
  [4,3,0,0,0], // 7
  [4,3,0,0,0], // 8
  [4,3,2,0,0], // 9
  [4,3,2,0,0], // 10
  [4,3,3,0,0], // 11
  [4,3,3,0,0], // 12
  [4,3,3,1,0], // 13
  [4,3,3,1,0], // 14
  [4,3,3,2,0], // 15
  [4,3,3,2,0], // 16
  [4,3,3,3,1], // 17
  [4,3,3,3,1], // 18
  [4,3,3,3,2], // 19
  [4,3,3,3,2], // 20
];

// The third-caster table (Eldritch Knight, Arcane Trickster). A character gets it from a
// subclass's own `spellcasting`, never from a class name; this is the table the
// archetype editor's preset and the class AI start from. Slots start at level 3.
export const THIRD_CASTER_SLOTS: number[][] = [
  [0,0,0,0], // 1
  [0,0,0,0], // 2
  [2,0,0,0], // 3
  [3,0,0,0], // 4
  [3,0,0,0], // 5
  [3,0,0,0], // 6
  [4,2,0,0], // 7
  [4,2,0,0], // 8
  [4,2,0,0], // 9
  [4,3,0,0], // 10
  [4,3,0,0], // 11
  [4,3,0,0], // 12
  [4,3,2,0], // 13
  [4,3,2,0], // 14
  [4,3,2,0], // 15
  [4,3,3,0], // 16
  [4,3,3,0], // 17
  [4,3,3,0], // 18
  [4,3,3,1], // 19
  [4,3,3,1], // 20
];

// Warlock pact magic: [slot level, slot count] per character level.
// All slots are the same level and regain on short rest.
const WARLOCK_PACT_SLOTS: [number, number][] = [
  [1,1],[1,2],[2,2],[2,2],[3,2],[3,2],[4,2],[4,2],[5,2],[5,2],
  [5,3],[5,3],[5,3],[5,3],[5,3],[5,3],[5,4],[5,4],[5,4],[5,4],
];

function slotsFromRow(row: number[]): import("@/types/party.types").SpellSlotEntry[] {
  return row
    .map((max, i) => ({ level: i + 1, max, used: 0, pool: "spellcasting" as const, recovery: "long" as const }))
    .filter((s) => s.max > 0);
}

/** Returns the default spell slots for a given class and level per 5e rules. */
export function getDefaultSpellSlots(
  cls: string | null | undefined,
  level: number,
  ruleset: RulesetKey,
): import("@/types/party.types").SpellSlotEntry[] {
  const l = Math.max(1, Math.min(20, Math.round(level)));
  const idx = l - 1;
  switch (cls) {
    case "Bard":
    case "Cleric":
    case "Druid":
    case "Sorcerer":
    case "Wizard":
      return slotsFromRow(FULL_CASTER_SLOTS[idx]);
    case "Paladin":
    case "Ranger":
      if (ruleset === "2024" && idx === 0) return slotsFromRow([2,0,0,0,0]);
      return slotsFromRow(HALF_CASTER_SLOTS[idx]);
    case "Artificer":
      return slotsFromRow(ARTIFICER_SLOTS[idx]);
    case "Warlock": {
      const [slotLevel, count] = WARLOCK_PACT_SLOTS[idx];
      return count > 0 ? [{ level: slotLevel, max: count, used: 0, pool: "pact", recovery: "short" }] : [];
    }
    default:
      return [];
  }
}

/**
 * Returns 'short' if the class regains spell slots on a short rest (Warlock pact magic),
 * 'long' otherwise.
 */
export function getSlotRecovery(cls: string | null | undefined): "short" | "long" {
  return cls === "Warlock" ? "short" : "long";
}

/**
 * How a class contributes to the multiclass caster-level sum (PHB page 164).
 *
 * - `full`       — full caster: +1 caster level per class level (Bard, Cleric, Druid, Sorcerer, Wizard)
 * - `half_down`  — half caster (round down): Paladin, Ranger
 * - `half_up`    — half caster (round up): Artificer
 * - `third`      — third caster: a class whose subclass casts (Eldritch Knight, Arcane Trickster)
 * - `pact`       — warlock pact magic — tracked separately, not part of the sum
 * - `none`       — non-caster
 */
export type CasterCategory = "full" | "half_down" | "half_up" | "third" | "pact" | "none";

/** A class entry as the multiclass sum reads it. `category` overrides the class-name lookup: a subclass caster is "third". */
export interface CasterClassEntry {
  class_name: string;
  levels: number;
  category?: CasterCategory;
}

function categoryOf(entry: CasterClassEntry): CasterCategory {
  return entry.category ?? getCasterCategory(entry.class_name);
}

export function getCasterCategory(cls: string | null | undefined): CasterCategory {
  switch (cls) {
    case "Bard":
    case "Cleric":
    case "Druid":
    case "Sorcerer":
    case "Wizard":
      return "full";
    case "Paladin":
    case "Ranger":
      return "half_down";
    case "Artificer":
      return "half_up";
    case "Warlock":
      return "pact";
    default:
      return "none";
  }
}

/**
 * Multiclass caster level per PHB: full = 1x, half_down = floor(L/2),
 * half_up = ceil(L/2), third = floor(L/3). Pact and non-casters don't count.
 */
export function multiclassCasterLevel(
  classes: CasterClassEntry[],
  ruleset: RulesetKey,
): number {
  let sum = 0;
  for (const c of classes) {
    const cat = categoryOf(c);
    if (cat === "full") sum += c.levels;
    else if (cat === "half_down") {
      // The 2024 multiclass rules changed Paladin/Ranger contributions to round up.
      sum += ruleset === "2024" ? Math.ceil(c.levels / 2) : Math.floor(c.levels / 2);
    }
    else if (cat === "half_up") sum += Math.ceil(c.levels / 2);
    else if (cat === "third") sum += Math.floor(c.levels / 3);
  }
  return Math.min(20, sum);
}

/**
 * Slot layout for a multiclass character. Combines classes into a single set
 * of leveled slots from the full-caster table, plus separate pact slots from
 * the warlock table (if the character has warlock levels).
 *
 * Falls back to `getDefaultSpellSlots(class, level)` for single-class
 * characters so single-class casters keep their class-specific progression
 * (Artificer's round-up half-caster table, etc.).
 */
export function getMulticlassSpellSlots(
  classes: CasterClassEntry[],
  ruleset: RulesetKey,
): import("@/types/party.types").SpellSlotEntry[] {
  if (classes.length === 0) return [];
  if (classes.length === 1) {
    const only = classes[0];
    if (only.category === "third") return slotsFromRow(THIRD_CASTER_SLOTS[Math.max(1, Math.min(20, only.levels)) - 1]);
    return getDefaultSpellSlots(only.class_name, only.levels, ruleset);
  }

  const out: import("@/types/party.types").SpellSlotEntry[] = [];

  const casterLevel = multiclassCasterLevel(classes, ruleset);
  if (casterLevel > 0) {
    out.push(...slotsFromRow(FULL_CASTER_SLOTS[casterLevel - 1]));
  }

  const warlock = classes.find((c) => c.class_name === "Warlock");
  if (warlock) {
    const [slotLevel, count] = WARLOCK_PACT_SLOTS[Math.min(20, warlock.levels) - 1];
    if (count > 0) {
      out.push({ level: slotLevel, max: count, used: 0, pool: "pact", recovery: "short" });
    }
  }

  return out;
}

export const SCHOOL_BG: Record<SpellSchool, string> = {
  abjuration:       "bg-school-abjuration",
  conjuration:      "bg-school-conjuration",
  divination:       "bg-school-divination",
  enchantment:      "bg-school-enchantment",
  evocation:        "bg-school-evocation",
  illusion:         "bg-school-illusion",
  necromancy:       "bg-school-necromancy",
  transmutation:    "bg-school-transmutation",
};

/** Text-colour classes for the same ramp. */
export const SCHOOL_TEXT: Record<SpellSchool, string> = {
  abjuration:       "text-school-abjuration",
  conjuration:      "text-school-conjuration",
  divination:       "text-school-divination",
  enchantment:      "text-school-enchantment",
  evocation:        "text-school-evocation",
  illusion:         "text-school-illusion",
  necromancy:       "text-school-necromancy",
  transmutation:    "text-school-transmutation",
};

/** The same ramp as `var()` values, for borders, gradients and canvas — places
 *  a utility class cannot reach. Tint with `color-mix`, never by appending a
 *  hex alpha: that only ever worked on a hex literal. */
export const SCHOOL_VAR: Record<SpellSchool, string> = {
  abjuration:       "var(--school-abjuration)",
  conjuration:      "var(--school-conjuration)",
  divination:       "var(--school-divination)",
  enchantment:      "var(--school-enchantment)",
  evocation:        "var(--school-evocation)",
  illusion:         "var(--school-illusion)",
  necromancy:       "var(--school-necromancy)",
  transmutation:    "var(--school-transmutation)",
};

/** The slim row a spell picker or lookup needs: enough to list, group and look a
 *  spell up, none of the prose. Library and custom spells share the shape;
 *  `is_shared` says which table it came from (library rows have no campaign). */
export interface SpellIndexEntry {
  id: string;
  name: string;
  level: number;
  school: SpellSchool;
  concentration: boolean;
  source: string | null;
  classes: string[];
  is_shared: boolean;
  campaign_id: string | null;
}
