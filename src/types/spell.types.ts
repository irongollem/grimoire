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

// Human-readable labels for open5e document slugs.
// Anything not in this map falls back to the raw slug.
export const OPEN5E_SOURCE_LABELS: Record<string, string> = {
  "wotc-srd": "D&D SRD 5.1",
  "phb": "Player's Handbook",
  "xge": "Xanathar's Guide to Everything",
  "tce": "Tasha's Cauldron of Everything",
  "ai": "Acquisitions Incorporated",
  "a5e": "Level Up: A5E",
  "blackflag": "Black Flag Roleplaying",
  "cc": "Creature Codex",
  "tob": "Tome of Beasts",
  "tob2": "Tome of Beasts 2",
  "tob3": "Tome of Beasts 3",
  "dmag": "Deep Magic",
  "vom": "Vault of Magic",
  "menagerie": "Tome of Beasts: Lairs",
  "srd": "SRD (legacy)",
};

// Prefer the stored title from the DB; fall back to our hardcoded map, then the raw slug.
export function spellSourceLabel(slug: string | null, title?: string | null): string {
  if (!slug) return "Custom";
  if (title) return title;
  return OPEN5E_SOURCE_LABELS[slug] ?? slug;
}

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
  damage_rolls: import("@/lib/dice").DamageRoll[] | null; // e.g. [{dice:"8d6",type:"fire"}]
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
  image_url: string | null; // optional art for card printing
  image_focal_point?: { x: number; y: number } | null;
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

const PREPARED_CLASSES = ["Cleric", "Druid", "Paladin", "Artificer"] as const;
const KNOWN_CLASSES    = ["Sorcerer", "Warlock", "Bard", "Ranger"] as const;
const SPELLBOOK_CLASSES = ["Wizard"] as const;

export function getCasterType(cls: string | null | undefined): CasterType {
  if (!cls) return "none";
  if ((PREPARED_CLASSES as readonly string[]).includes(cls)) return "prepared";
  if ((KNOWN_CLASSES as readonly string[]).includes(cls))    return "known";
  if ((SPELLBOOK_CLASSES as readonly string[]).includes(cls)) return "spellbook";
  return "none";
}

export type InnateSourceType = 'class' | 'racial' | 'feat' | 'item' | 'other';
export type InnateResetsOn = 'long_rest' | 'short_rest';

export interface CharacterSpell {
  id: string;
  party_member_id: string;
  spell_id: string;
  is_known: boolean;
  is_prepared: boolean;
  source_type: InnateSourceType;
  uses_per_day: number | null;
  uses_remaining: number | null;
  resets_on: InnateResetsOn | null;
  source_label: string | null;
  source_class_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CharacterSpellEntry extends CharacterSpell {
  spell: Spell;
}

// Convenience helpers
export function spellLevelLabel(level: number): string {
  if (level === 0) return "Cantrip";
  const suffixes = ["", "st", "nd", "rd"];
  const suffix = level <= 3 ? suffixes[level] : "th";
  return `${level}${suffix}-Level`;
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

// Artificer: half-caster that rounds UP (unlocks next slot level every 2 levels starting at 3).
// Differs from Paladin/Ranger (round down) — gets 2nd-level slots at level 3, not 5.
const ARTIFICER_SLOTS: number[][] = [
  [2,0,0,0,0], // 1
  [2,0,0,0,0], // 2
  [3,2,0,0,0], // 3  ← 2nd-level slots unlock here (rounds up)
  [3,2,0,0,0], // 4
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

// Third-casters (Eldritch Knight, Arcane Trickster). Slots start at level 3.
const THIRD_CASTER_SLOTS: number[][] = [
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
    .map((max, i) => ({ level: i + 1, max, used: 0 }))
    .filter((s) => s.max > 0);
}

/** Returns the default spell slots for a given class and level per 5e rules. */
export function getDefaultSpellSlots(
  cls: string | null | undefined,
  level: number,
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
      return slotsFromRow(HALF_CASTER_SLOTS[idx]);
    case "Artificer":
      return slotsFromRow(ARTIFICER_SLOTS[idx]);
    case "Fighter (Eldritch Knight)":
    case "Rogue (Arcane Trickster)":
      return slotsFromRow(THIRD_CASTER_SLOTS[idx]);
    case "Warlock": {
      const [slotLevel, count] = WARLOCK_PACT_SLOTS[idx];
      return count > 0 ? [{ level: slotLevel, max: count, used: 0 }] : [];
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
 * - `third`      — third caster: Eldritch Knight, Arcane Trickster
 * - `pact`       — warlock pact magic — tracked separately, not part of the sum
 * - `none`       — non-caster
 */
export type CasterCategory = "full" | "half_down" | "half_up" | "third" | "pact" | "none";

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
    case "Fighter (Eldritch Knight)":
    case "Rogue (Arcane Trickster)":
      return "third";
    case "Warlock":
      return "pact";
    default:
      return "none";
  }
}

/** The ability score a class uses for spell attack / save DC, or null if non-caster. */
export function getCastingAbility(cls: string | null | undefined): "int" | "wis" | "cha" | null {
  switch (cls) {
    case "Cleric":
    case "Druid":
    case "Ranger":
      return "wis";
    case "Wizard":
    case "Artificer":
    case "Fighter (Eldritch Knight)":
    case "Rogue (Arcane Trickster)":
      return "int";
    case "Bard":
    case "Paladin":
    case "Sorcerer":
    case "Warlock":
      return "cha";
    default:
      return null;
  }
}

/**
 * Multiclass caster level per PHB: full = 1x, half_down = floor(L/2),
 * half_up = ceil(L/2), third = floor(L/3). Pact and non-casters don't count.
 */
export function multiclassCasterLevel(
  classes: { class_name: string; levels: number }[],
): number {
  let sum = 0;
  for (const c of classes) {
    const cat = getCasterCategory(c.class_name);
    if (cat === "full") sum += c.levels;
    else if (cat === "half_down") sum += Math.floor(c.levels / 2);
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
  classes: { class_name: string; levels: number }[],
): import("@/types/party.types").SpellSlotEntry[] {
  if (classes.length === 0) return [];
  if (classes.length === 1) {
    return getDefaultSpellSlots(classes[0].class_name, classes[0].levels);
  }

  const out: import("@/types/party.types").SpellSlotEntry[] = [];

  const casterLevel = multiclassCasterLevel(classes);
  if (casterLevel > 0) {
    out.push(...slotsFromRow(FULL_CASTER_SLOTS[casterLevel - 1]));
  }

  const warlock = classes.find((c) => c.class_name === "Warlock");
  if (warlock) {
    const [slotLevel, count] = WARLOCK_PACT_SLOTS[Math.min(20, warlock.levels) - 1];
    if (count > 0) {
      // Keep pact slots as their own entry. If a leveled slot of the same
      // level already exists from the multiclass sum, pact slots stack as a
      // separate resource per RAW — but the UI currently renders a single
      // entry per slot level, so we store them combined to avoid a regression.
      // A follow-up PR will split them visually.
      const existing = out.find((s) => s.level === slotLevel);
      if (existing) existing.max += count;
      else out.push({ level: slotLevel, max: count, used: 0 });
    }
  }

  return out;
}

export function getHitDie(cls: string | null | undefined): number {
  const c = cls?.toLowerCase() ?? "";
  if (c === "barbarian") return 12;
  if (c === "fighter" || c === "paladin" || c === "ranger") return 10;
  if (c === "wizard" || c === "sorcerer") return 6;
  // bard, cleric, druid, monk, rogue, warlock → d8; artificer → d8
  return 8;
}

export const SCHOOL_COLORS: Record<SpellSchool, string> = {
  abjuration: "#2563eb",
  conjuration: "#7c3aed",
  divination: "#0891b2",
  enchantment: "#db2777",
  evocation: "#dc2626",
  illusion: "#9333ea",
  necromancy: "#4d7c0f",
  transmutation: "#d97706",
};
