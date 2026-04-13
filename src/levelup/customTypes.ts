// Types for DM-defined custom subclasses and class variants.
// These live alongside the SRD class types in src/levelup/ to keep the domain self-contained.

export type CasterType = "prepared" | "known" | "spellbook" | "none";
/** Ability scores that can feed max-prepared calculations. */
export type PreparedAbility = "wis" | "int" | "cha";

export type ResourceScaling = "fixed" | "per_level" | "table";

export interface CustomResource {
  key: string;
  label: string;
  rest: "short" | "long";
  scaling: ResourceScaling;
  /** Used when scaling === "fixed" */
  fixed_value?: number;
  /** Used when scaling === "table"; length 20, index = level - 1 */
  table_values?: number[];
}

export type StepType = "feature_pick" | "spell_pick" | "text_pick";

export interface CustomStep {
  level: number;
  type: "select" | "append";
  /** Determines what the options represent and how they're presented in the editor */
  step_type: StepType;
  key: string;
  label: string;
  description?: string;
  /** UUIDs for feature_pick, spell UUIDs for spell_pick, plain strings for text_pick */
  options: string[];
  count?: number;
}

/** Feature UUIDs grouped by level: { "3": ["<uuid>", "<uuid>"], "7": ["<uuid>"] } */
export type CustomFeatures = Record<string, string[]>;

export interface CustomSubclass {
  id: string;
  user_id: string;
  campaign_id: string | null;
  class_name: string;
  subclass_name: string;
  features: CustomFeatures;
  steps: CustomStep[];
  resources: CustomResource[];
  created_at: string;
  updated_at: string;
}

export type CustomSubclassInsert = Omit<CustomSubclass, "id" | "user_id" | "created_at" | "updated_at">;
export type CustomSubclassUpdate = Partial<CustomSubclassInsert>;

export type HitDie = 6 | 8 | 10 | 12;

export interface CustomClass {
  id: string;
  user_id: string;
  campaign_id: string | null;
  class_name: string;

  hit_die: HitDie;
  primary_ability: string | null;
  saving_throws: string[];
  armor_proficiencies: string[];
  weapon_proficiencies: string[];
  subclass_level: number;

  /** Feature UUIDs grouped by level: { "1": ["<uuid>"], "3": ["<uuid>"] } */
  features: CustomFeatures;

  /** Levels that grant an ASI, default [4,8,12,16,19] */
  asi_levels: number[];

  /**
   * Spell slot table: 20-element outer array (index = class level - 1).
   * Each inner array has exactly 9 numbers: slot counts for spell levels 1–9.
   * null = non-spellcaster.
   */
  spell_slots: number[][] | null;

  /**
   * Total spells known at each class level (20-element array).
   * null = prepared caster (no known limit) or non-spellcaster.
   */
  spells_known: number[] | null;

  /** Whether spell slots recharge on short or long rest. */
  slot_recovery: "short" | "long";

  /** Caster type — drives prepared spell logic and slot display. */
  caster_type: CasterType;
  /** Ability score for max-prepared calculation. null for known/none casters. */
  prepared_ability: PreparedAbility | null;
  /** Divisor for level in max-prepared formula: 1 = full caster, 2 = half-caster. null for known/none. */
  prepared_divisor: number | null;

  steps: CustomStep[];
  resources: CustomResource[];

  created_at: string;
  updated_at: string;
}

export type CustomClassInsert = Omit<CustomClass, "id" | "user_id" | "created_at" | "updated_at">;
export type CustomClassUpdate = Partial<CustomClassInsert>;

/** Read-only SRD class template — stored in system_classes, visible to all users. */
export interface SystemClass {
  id: string;
  class_name: string;
  hit_die: HitDie;
  primary_ability: string | null;
  saving_throws: string[];
  armor_proficiencies: string[];
  weapon_proficiencies: string[];
  subclass_level: number;
  features: CustomFeatures;
  asi_levels: number[];
  spell_slots: number[][] | null;
  spells_known: number[] | null;
  slot_recovery: "short" | "long";
  caster_type: CasterType;
  prepared_ability: PreparedAbility | null;
  prepared_divisor: number | null;
  steps: CustomStep[];
  resources: CustomResource[];
  created_at: string;
  updated_at: string;
}
