import type { SpellSlotEntry, SaveKey } from "@/types/party.types";

export type AbilityKey = SaveKey;

export interface ClassLevelData {
  level: number;
  features: string[];
  asi: boolean;
  subclass_feature?: boolean;
  spell_slots?: SpellSlotEntry[];
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
