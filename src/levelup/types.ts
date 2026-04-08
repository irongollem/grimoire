import type { SpellSlotEntry, SaveKey } from "@/types/party.types";

export type AbilityKey = SaveKey;

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

export interface ClassStep {
  type: ClassStepType;
  key: string;       // key in class_choices where the value is stored
  label: string;     // section heading shown in the wizard
  description?: string;
  options: string[];
}
