// Types for DM-defined custom subclasses and class variants.
// These live alongside the SRD class types in src/levelup/ to keep the domain self-contained.

import type { VersionedContentMetadata } from "@/types/content.types";
import type { AiProvenance } from "@/ai/provenance";
import type { CasterType } from "@/types/spell.types";

/** Ability scores that can feed max-prepared calculations. */
export type PreparedAbility = "wis" | "int" | "cha";

/** Feature UUIDs grouped by level: { "3": ["<uuid>", "<uuid>"], "7": ["<uuid>"] } */
export type CustomFeatures = Record<string, string[]>;

export interface CustomSubclass extends VersionedContentMetadata {
  id: string;
  user_id: string;
  campaign_id: string | null;
  class_name: string;
  subclass_name: string;
  source: string | null;
  description: string | null;
  features: CustomFeatures;
  /**
   * Spells the subclass grants always prepared (Cleric domain, Paladin oath,
   * Druid circle, 2024 Warlock patron), keyed by the CLASS level they arrive at.
   * Ids reference library_spells.id or spells.id (custom uuid). The server keeps
   * a character's rows in step (`private.sync_subclass_spells`): they arrive as
   * the class levels, leave on a de-level or a subclass change, and never count
   * toward a prepared or known limit.
   */
  granted_spells: CustomFeatures;
  /**
   * Granted spells that depend on a choice the character makes: Circle of the
   * Land's terrain (2014) or land type (2024), an affinity column. Keyed by the
   * option, then by class level like `granted_spells`; the character's pick is
   * `character_classes.subclass_variant`. Empty when the subclass has no choice.
   */
  spell_variants: Record<string, CustomFeatures>;
  /** What the choice is called on the sheet ("Land type"), when `spell_variants` or `expanded_spell_variants` has options. */
  spell_variant_label: string | null;
  /**
   * Spells the subclass adds to the list its class PICKS from, keyed by SPELL
   * level: a 2014 Warlock patron's expanded list. Not granted and not always
   * prepared: the character still chooses them, and they count as known spells.
   */
  expanded_spells: CustomFeatures;
  /**
   * The expanded list's choice-dependent part: per option of the same choice as
   * `spell_variants`, the spells added to the pick-from list, keyed by SPELL
   * level. A ToH Animal Lords Warlock's Air, Earth or Water affinity.
   */
  expanded_spell_variants: Record<string, CustomFeatures>;
  /** Extra HP gained per level in this class, on top of the hit die roll (e.g. Draconic Resilience = 1). */
  hp_per_level: number | null;
  /** Set when the row came from the AI generator; flipped by `markEdited` on a content edit. */
  ai_provenance?: AiProvenance | null;
  created_at: string;
  updated_at: string;
}

export type CustomSubclassInsert = Omit<CustomSubclass, "id" | "user_id" | "created_at" | "updated_at">;
export type CustomSubclassUpdate = Partial<CustomSubclassInsert>;

export type HitDie = 6 | 8 | 10 | 12;

export interface CustomClass extends VersionedContentMetadata {
  id: string;
  user_id: string;
  campaign_id: string | null;
  class_name: string;
  source: string | null;

  hit_die: HitDie;
  primary_ability: string | null;
  saving_throws: string[];
  armor_proficiencies: string[];
  weapon_proficiencies: string[];
  subclass_level: number;

  /** Feature UUIDs grouped by level: { "1": ["<uuid>"], "3": ["<uuid>"] } */
  features: CustomFeatures;

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

  /**
   * Total cantrips known at each class level (20-element array).
   * null = no cantrip progression defined.
   */
  cantrips_known: number[] | null;

  /** Whether spell slots recharge on short or long rest. */
  slot_recovery: "short" | "long";

  /** Caster type — drives prepared spell logic and slot display. */
  caster_type: CasterType;
  /** Ability score for max-prepared calculation. null for known/none casters. */
  prepared_ability: PreparedAbility | null;
  /** Divisor for level in max-prepared formula: 1 = full caster, 2 = half-caster. null for known/none. */
  prepared_divisor: number | null;


  /** Set when the row came from the AI generator; flipped by `markEdited` on a content edit. */
  ai_provenance?: AiProvenance | null;

  created_at: string;
  updated_at: string;
}

export type CustomClassInsert = Omit<CustomClass, "id" | "user_id" | "created_at" | "updated_at">;
export type CustomClassUpdate = Partial<CustomClassInsert>;

/** Read-only SRD class template — stored in system_classes, visible to all users. */
export interface SystemClass extends VersionedContentMetadata {
  id: string;
  class_name: string;
  hit_die: HitDie;
  primary_ability: string | null;
  saving_throws: string[];
  armor_proficiencies: string[];
  weapon_proficiencies: string[];
  subclass_level: number;
  features: CustomFeatures;
  spell_slots: number[][] | null;
  spells_known: number[] | null;
  cantrips_known: number[] | null;
  slot_recovery: "short" | "long";
  caster_type: CasterType;
  prepared_ability: PreparedAbility | null;
  prepared_divisor: number | null;
  created_at: string;
  updated_at: string;
}
