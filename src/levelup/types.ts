import type { SpellSlotEntry, SaveKey } from "@/types/party.types";

export type AbilityKey = SaveKey;

/** Standard ASI levels shared by most classes (4, 8, 12, 16, 19). */
export const STANDARD_ASI: readonly number[] = [4, 8, 12, 16, 19];

/** All 18 standard skills — used as Expertise and similar picker sources. */
export const SKILL_NAMES = [
  "Acrobatics",
  "Animal Handling",
  "Arcana",
  "Athletics",
  "Deception",
  "History",
  "Insight",
  "Intimidation",
  "Investigation",
  "Medicine",
  "Nature",
  "Perception",
  "Performance",
  "Persuasion",
  "Religion",
  "Sleight of Hand",
  "Stealth",
  "Survival",
] as const;

export interface ClassLevelData {
  level: number;
  features: string[];
  asi: boolean;
  subclass_feature?: boolean;
  spell_slots?: SpellSlotEntry[];
  spells_known?: number;    // total spells known at this level (for "known" casters)
  infusions_known?: number; // Artificer only — total infusions known at this level
}

export type ClassFeatureTable = Record<string, ClassLevelData[]>;

// Persistent class resource pools (rage uses, ki points, sorcery points, etc.)
// Each key is the resource name; value tracks current/max and which rest restores it.
export interface ClassResource {
  current: number;
  max: number;
  rest: "short" | "long";
}
export type ClassResources = Record<string, ClassResource>;

// Persistent class picks (subclass, fighting style, metamagic, invocations, maneuvers, etc.)
// Kept generic so each class sub-ticket can extend without a schema change.
export interface ClassChoices {
  subclass?: string;
  fighting_style?: string;
  [key: string]: unknown;
}

export type AsiMode = "plus2" | "plus1plus1";

export interface AsiChoice {
  mode: AsiMode;
  primary: AbilityKey;
  secondary?: AbilityKey; // required when mode === "plus1plus1"
}

// ── Class-specific wizard steps ───────────────────────────────────────────────
// "select"  — stores a single string at class_choices[key]
// "append"  — appends one selection to the existing string[] at class_choices[key]
//             (used for accumulating choices like Favored Enemy, Natural Explorer)
export type ClassStepType = "select" | "append";

// Declares a class resource that should be initialised/updated on level-up.
// The wizard will upsert this into class_resources on confirm.
export interface ClassResourceDef {
  key: string;       // e.g. "sorcery_points"
  label: string;     // e.g. "Sorcery Points"
  rest: "short" | "long";
  maxAtLevel: (level: number) => number;
}

export interface ClassStep {
  type: ClassStepType;
  key: string;         // key in class_choices where the value is stored
  label: string;       // section heading shown in the wizard
  description?: string;
  options: string[];
  count?: number;      // how many picks to make (default 1); renders count selects for "append" steps
}
