import type { AbilityKey } from "@/rules/characterCreation";
import type { SkillKey } from "@/data/classSkillChoices";

/**
 * What a feature does, as data (#976). One shape serves an official feature,
 * whose mechanics the admin import writes from the SRD catalogues, and a
 * homebrew one, which a DM edits through the same fields. Text never lives
 * here: the rules wording is the row's `description`, and this says only what
 * the sheet, the roller and level-up need in order to act on it.
 *
 * Every level in this file is a level **in the class that grants the feature**,
 * not the character's total level, because that is how every class table in
 * both editions is written. A feat has no granting class, so its levels are
 * the character's total level.
 *
 * Anything absent means "this feature does not do that": no activation is a
 * passive feature, no `uses` is unlimited, no `choices` asks nothing.
 */

/** How using the feature is spent. Absent on `FeatureMechanics` means passive. */
export const ACTIVATIONS = ["action", "bonus_action", "reaction", "special"] as const;
export type Activation = (typeof ACTIVATIONS)[number];

export const RECHARGES = ["short", "long", "turn", "dawn"] as const;
/** When spent uses come back. A long rest also restores everything that recharges on a short one. */
export type Recharge = (typeof RECHARGES)[number];

/**
 * A value that changes with level, as the class table prints it. Only the
 * levels where the value changes are listed; a level reads the nearest listed
 * level at or below it, and a level below the first listed one has no value.
 */
export type ByLevel<T> = Record<string, T>;

/** How many uses (or points, for a pool) the feature has at a level. */
export type UsesAmount =
  | { kind: "fixed"; value: number }
  | { kind: "by_level"; values: ByLevel<number> }
  | { kind: "proficiency" }
  /**
   * The ability's modifier plus `bonus`, never below `min` (Bardic Inspiration:
   * Charisma, minimum 1; 2014 Divine Sense: 1 + Charisma, bonus 1).
   */
  | { kind: "ability_mod"; ability: AbilityKey; min: number; bonus?: number }
  /** Level in the granting class times `multiplier` (Lay on Hands 5, 2014 Ki 1). */
  | { kind: "class_level"; multiplier: number }
  /** Unlimited from this level on (2014 Barbarian Rage at 20). Combined with another amount below it. */
  | { kind: "unlimited_from"; level: number; below: Exclude<UsesAmount, { kind: "unlimited_from" }> };

export interface FeatureUses {
  /**
   * The key the character's `class_resources` entry is stored under. Stable
   * across editions for the same idea (`rage`, `channel_divinity`, `ki`), so a
   * converted character keeps its spent count. Unique within one character.
   */
  key: string;
  /** What the pips are called on the sheet ("Rage", "Focus Points", "Lay on Hands"). */
  label: string;
  amount: UsesAmount;
  recharge: Recharge;
  /** A later level changes the recharge (2014 Bard, Font of Inspiration at 5: long becomes short). */
  recharge_from?: { level: number; recharge: Recharge };
  /**
   * How many spent uses a short rest gives back when `recharge` is `long`
   * (2024 Rage and Channel Divinity regain one). Absent means none.
   */
  short_rest_regain?: number;
  /** Spent in chosen amounts rather than one at a time (Lay on Hands, Ki/Focus, Sorcery Points). */
  pool: boolean;
}

/**
 * Uses spent from a pool, named by its `FeatureUses.key`. The pool may be this
 * feature's own or another's: Cutting Words spends Bardic Inspiration, Stunning
 * Strike spends Ki, Preserve Life spends Channel Divinity. A key the character
 * has no pool for makes the thing unusable, never free.
 */
export interface UsesCost {
  key: string;
  amount: number;
}

/** A labelled value from the class table (Sneak Attack "3d6", Rage Damage "+2", Martial Arts "d8"). */
export interface FeatureScaling {
  label: string;
  values: ByLevel<string>;
}

/** What a damage rider may be added to. */
export const RIDER_TARGETS = [
  "weapon",
  "melee_weapon",
  /** A melee weapon attack using Strength (Rage damage). */
  "melee_strength",
  /** A finesse or ranged weapon attack (Sneak Attack). */
  "finesse_or_ranged",
  "unarmed",
  "spell",
] as const;
export type RiderTarget = (typeof RIDER_TARGETS)[number];

export type RiderDice =
  /** The feature's own `scaling` value at the current level. */
  | { kind: "scaling" }
  | { kind: "fixed"; expression: string }
  /**
   * Grows with the spell slot spent: `base` at the slot level `base_level`,
   * plus `per_level` for each level above, up to `max` dice in total
   * (2014 Divine Smite: 2d8 at 1st, +1d8 per level, at most 5d8).
   */
  | { kind: "slot"; base: string; base_level: number; per_level: string; max_dice: number };

/**
 * Extra damage the player may add to a damage roll. Every rider is a checkbox
 * the player ticks, never applied by itself, so a rider whose condition the app
 * cannot see (Colossus Slayer's wounded target, Divine Smite's extra die against
 * a fiend) is still a rider: the player knows the target, the app does not.
 * A flat value from `scaling` ("+2") is added as a modifier, not rolled.
 */
export interface DamageRider {
  /** Shown on the damage roll's checkbox ("Sneak Attack", "Rage"). */
  label: string;
  dice: RiderDice;
  /** Absent means the weapon's own damage type. */
  damage_type?: string;
  applies_to: RiderTarget;
  once_per_turn: boolean;
  /** Only offered while this toggle is on (Rage damage needs Rage). The key of a `FeatureToggle`. */
  requires_toggle?: string;
  /** What adding it spends. Absent means free. */
  cost?: ({ kind: "uses" } & UsesCost) | { kind: "spell_slot" };
}

/** A state the player switches on and that ends by itself (Rage). */
export interface FeatureToggle {
  key: string;
  label: string;
  /** What switching it on spends. */
  spends?: UsesCost;
  /** When it ends by itself, besides being switched off. */
  ends_on: "short_rest" | "long_rest";
}

/** A named thing the feature lets you do, listed under its activation (Cunning Action's Dash). */
export interface SubAction {
  name: string;
  activation: Activation;
  /** What doing it spends. Absent means free. */
  spends?: UsesCost;
}

/** The 2024 feat categories. 2014 feats have none. */
export const FEAT_CATEGORIES = ["origin", "general", "fighting_style", "epic_boon"] as const;
export type FeatCategory = (typeof FEAT_CATEGORIES)[number];

/** The fixed option lists a choice can draw from. Each has its data in `src/data` or the database. */
export const OPTION_SETS = [
  "fighting_style",
  "eldritch_invocation",
  "maneuver",
  "metamagic",
  "pact_boon",
  "favored_enemy",
  "favored_terrain",
  "weapon_mastery",
  "wild_shape_form",
  "artificer_infusion",
] as const;
export type OptionSet = (typeof OPTION_SETS)[number];

/** What a choice picks. */
export type ChoicePick =
  /** A feat of these categories (2024), or any feat when `categories` is null (2014). */
  | { kind: "feat"; categories: FeatCategory[] | null }
  /** 2014 Ability Score Improvement: +2 to one ability, +1 to two, or a feat when the table allows feats. */
  | { kind: "asi_or_feat" }
  /** Skills you are already proficient in, which become expertise. Also takes Thieves' Tools where the book says so. */
  | { kind: "expertise"; thieves_tools: boolean }
  /** New skill proficiencies, from a list or (`from` empty) any skill. */
  | { kind: "skill"; from: SkillKey[] }
  | { kind: "option"; set: OptionSet }
  /** A homebrew list of names (a homebrew college's wing). */
  | { kind: "custom"; options: string[] }
  /**
   * Spells of one level learned from a class's spell list (0 = cantrips).
   * `lists` names the spell lists by class name ("Wizard"). With more than one,
   * the list is the one the granting feat's variant names ("Magic Initiate (Wizard)"),
   * and the union of them all when there is no variant to say.
   * A class feature's picks become spells of the granting class, always prepared
   * (Arcane Initiate: wizard cantrips that count as cleric cantrips); a feat's picks
   * are spells of the feat. `free_cast`: a levelled pick may be cast once per long
   * rest without a slot (Magic Initiate).
   */
  | { kind: "spell"; lists: string[]; level: number; free_cast: boolean };

export type ChoiceCount =
  /** Every level that grants this feature asks for `amount` more (ASI at 4, 8, 12; Expertise at 1 and 6). */
  | { kind: "per_grant"; amount: number }
  /** The total known at a level; level-up asks for the difference (Eldritch Invocations, Metamagic, Weapon Mastery). */
  | { kind: "known"; values: ByLevel<number> };

export interface FeatureChoice {
  /**
   * Where the picks are stored on the character, `class_choices[key]`. Stable
   * for the same idea across editions (`eldritch_invocations`, `fighting_style`).
   */
  key: string;
  /** The picker's heading at level-up ("Eldritch Invocations"). */
  label: string;
  pick: ChoicePick;
  count: ChoiceCount;
  /** At a level that grants this choice, one earlier pick may be swapped for another (invocations, maneuvers, 2024 Weapon Mastery). */
  replace_on_level_up: boolean;
}

/** Proficiencies the feature gives outright, with no choice (2014 Arcana Domain's Arcane Initiate: Arcana). */
export interface FeatureGrants {
  skills?: SkillKey[];
  /** Tool names as the sheet stores them in `tool_proficiencies`. */
  tools?: string[];
  /** Language names as the sheet stores them in `languages`. */
  languages?: string[];
}

export interface FeatureMechanics {
  activation?: Activation;
  /** What using the feature itself spends (Cutting Words: one Bardic Inspiration). */
  spends?: UsesCost;
  uses?: FeatureUses;
  scaling?: FeatureScaling;
  riders?: DamageRider[];
  toggle?: FeatureToggle;
  actions?: SubAction[];
  choices?: FeatureChoice[];
  grants?: FeatureGrants;
  /**
   * An optional feature that may be taken instead of another of the same
   * class (Tasha's swaps), named by that feature's `conceptual_key`. Offered
   * only when the table enables `tashas_optional_features`.
   */
  replaces?: string;
}

/** The kinds of row in `class_features`. */
export const FEATURE_KINDS = ["feature", "feat"] as const;
export type FeatureKind = (typeof FEATURE_KINDS)[number];

/** A prerequisite a character must meet to take a feat. Every listed condition must hold. */
export interface FeatPrerequisites {
  /** Character level at least this. */
  level?: number;
  /** At least one of these abilities at or above its score (2014 Grappler: Str 13; 2024 lists "Str or Dex 13"). */
  abilities?: { any_of: Partial<Record<AbilityKey, number>> };
  /** Can cast at least one spell (or, for 2014, has the Spellcasting or Pact Magic feature). */
  spellcasting?: boolean;
  /** Proficiency with this armour category. */
  armor?: "light" | "medium" | "heavy" | "shield";
  /** The character has the Fighting Style feature (2024 Fighting Style feats). */
  fighting_style_feature?: boolean;
}

/** The ability increase a feat grants: `amount` to one of `abilities` (or split as the ASI allows). */
export interface FeatAbilityIncrease {
  abilities: AbilityKey[];
  amount: number;
  /** The ASI: +2 to one, or +1 to two. */
  split: boolean;
  /** Not above this score (20 normally; 30 for an Epic Boon). */
  max: number;
}
