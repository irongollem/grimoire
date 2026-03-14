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

export interface Spell {
  id: string;
  user_id: string;
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
  classes: string[];
  tags: string[];
  source: string | null;
  image_url: string | null; // optional art for card printing
  created_at: string;
  updated_at: string;
}

export type SpellInsert = Omit<Spell, "id" | "user_id" | "created_at" | "updated_at">;
export type SpellUpdate = Partial<SpellInsert>;

// Convenience helpers
export function spellLevelLabel(level: number): string {
  if (level === 0) return "Cantrip";
  const suffixes = ["", "st", "nd", "rd"];
  const suffix = level <= 3 ? suffixes[level] : "th";
  return `${level}${suffix}-Level`;
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
