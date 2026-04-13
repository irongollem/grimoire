export type SkillProfLevel = "none" | "proficient" | "expertise";
export type SaveKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export interface SkillProficiencies {
  acrobatics?: SkillProfLevel;
  animal_handling?: SkillProfLevel;
  arcana?: SkillProfLevel;
  athletics?: SkillProfLevel;
  deception?: SkillProfLevel;
  history?: SkillProfLevel;
  insight?: SkillProfLevel;
  intimidation?: SkillProfLevel;
  investigation?: SkillProfLevel;
  medicine?: SkillProfLevel;
  nature?: SkillProfLevel;
  perception?: SkillProfLevel;
  performance?: SkillProfLevel;
  persuasion?: SkillProfLevel;
  religion?: SkillProfLevel;
  sleight_of_hand?: SkillProfLevel;
  stealth?: SkillProfLevel;
  survival?: SkillProfLevel;
}

export const SKILLS: Array<{ key: keyof SkillProficiencies; label: string; ability: SaveKey }> = [
  { key: "acrobatics", label: "Acrobatics", ability: "dex" },
  { key: "animal_handling", label: "Animal Handling", ability: "wis" },
  { key: "arcana", label: "Arcana", ability: "int" },
  { key: "athletics", label: "Athletics", ability: "str" },
  { key: "deception", label: "Deception", ability: "cha" },
  { key: "history", label: "History", ability: "int" },
  { key: "insight", label: "Insight", ability: "wis" },
  { key: "intimidation", label: "Intimidation", ability: "cha" },
  { key: "investigation", label: "Investigation", ability: "int" },
  { key: "medicine", label: "Medicine", ability: "wis" },
  { key: "nature", label: "Nature", ability: "int" },
  { key: "perception", label: "Perception", ability: "wis" },
  { key: "performance", label: "Performance", ability: "cha" },
  { key: "persuasion", label: "Persuasion", ability: "cha" },
  { key: "religion", label: "Religion", ability: "int" },
  { key: "sleight_of_hand", label: "Sleight of Hand", ability: "dex" },
  { key: "stealth", label: "Stealth", ability: "dex" },
  { key: "survival", label: "Survival", ability: "wis" },
];

export interface SpellSlotEntry {
  level: number; // 1–9
  max: number;
  used: number;
}

export interface PartyMember {
  id: string;
  user_id: string;
  campaign_id: string | null;
  name: string;
  player_name: string | null;
  class: string | null;
  subclass: string | null;
  level: number;
  race: string | null;
  subrace: string | null;
  species_id: string | null;
  background: string | null;
  background_id: string | null;
  max_hp: number;
  current_hp: number;
  temp_hp: number;
  ac: number;
  speed: number;
  initiative_bonus: number;
  current_initiative: number | null;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  proficiency_bonus: number;
  skill_proficiencies: SkillProficiencies;
  saving_throw_proficiencies: SaveKey[];
  conditions: string[];
  curses: string[];       // curse names, e.g. ["Mummy Rot", "Bestow Curse"]
  inspiration: boolean;
  death_save_successes: number;
  death_save_failures: number;
  portrait_url: string | null;  // tall profile image
  portrait_focal_point?: { x: number; y: number } | null;
  card_art_url: string | null;  // landscape art for MTG Card Forge
  notes: string | null;
  sort_order: number;
  // Currency
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
  // Proficiencies & languages
  tool_proficiencies: string[];
  languages: string[];
  spell_slots: SpellSlotEntry[];
  current_location_id: string | null;
  carry_capacity_override: string | null; // expression: "*2", "+30", "-10", or bare number for absolute
  hit_dice_remaining?: number | null;
  class_resources: Record<string, { current: number; max: number; rest: "short" | "long" }>;
  class_choices: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type PartyMemberInsert = Omit<PartyMember, "id" | "user_id" | "created_at" | "updated_at">;
export type PartyMemberUpdate = Partial<PartyMemberInsert>;

// Conditions + helpers now live in `@/lib/conditions`. Re-exported here so
// existing imports from `@/types/party.types` keep working.
export { CONDITIONS, ATTACK_DIS_CONDITIONS, CHECK_DIS_CONDITIONS } from "@/lib/conditions";
