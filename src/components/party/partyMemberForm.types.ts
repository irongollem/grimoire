import type { SkillProficiencies, SaveKey, SpellSlotEntry } from "@/types/party.types";

/** Fields owned by the Identity tab */
export interface IdentityFormSlice {
  name: string;
  player_name: string | null;
  class: string;
  subclass: string;
  level: number;
  subrace: string;
  species_id: string | null;
  disguise_species_id: string | null;
  disguise_race: string | null;
  disguise_subrace: string | null;
  background_id: string | null;
  height: string | null;
  notes: string;
}

/** Fields owned by the Abilities tab */
export interface AbilitiesFormSlice {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  max_hp: number;
  current_hp: number;
  temp_hp: number;
  ac: number;
  speed: number;
  initiative_bonus: number;
  carry_capacity_override: string | null;
  class: string;
  level: number;
}

/** Fields owned by the Proficiencies tab */
export interface ProficienciesFormSlice {
  skill_proficiencies: SkillProficiencies;
  saving_throw_proficiencies: SaveKey[];
  tool_proficiencies: string[];
  languages: string[];
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export type { SpellSlotEntry };
