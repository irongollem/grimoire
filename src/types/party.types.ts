import type { WildshapeState } from "@/types/encounter.types";

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

export interface LevelChoiceASI {
  mode: 'plus2' | 'plus1plus1' | 'feat';
  primary?: string;
  secondary?: string;
  feat_id?: string;
}

export interface LevelChoiceEntry {
  class_name: string;
  is_new_class: boolean;
  hp_gained: number;
  asi?: LevelChoiceASI;
  subclass?: string;
  spells_learned?: string[];
  cantrips_learned?: string[];
  step_choices?: Record<string, string | string[]>;
  new_class_profs?: string[];
}

export type LevelChoices = Record<number, LevelChoiceEntry>;

export interface PartyMember {
  id: string;
  user_id: string;
  owner_user_id: string | null;
  is_dm_managed: boolean;
  campaign_id: string | null;
  name: string;
  player_name: string | null;
  class: string | null;
  subclass: string | null;
  level: number;
  subrace: string | null;
  species_id: string | null;
  disguise_species_id: string | null;
  disguise_race: string | null;
  disguise_subrace: string | null;
  background_id: string | null;
  max_hp: number;
  current_hp: number;
  temp_hp: number;
  ac: number;
  ac_formula?: string | null;
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
  notes: string | null;
  sort_order: number;
  // Roleplay / identity (all optional — new fields, may be absent on legacy rows)
  alignment?: string | null;
  personality_traits?: string | null;
  ideals?: string | null;
  bonds?: string | null;
  flaws?: string | null;
  deity?: string | null;
  deity_id?: string | null;
  // Identity extras (optional — wizard collects these on the Identity step)
  age?: string | null;
  gender?: string | null;
  pronouns?: string | null;
  height?: string | null;
  physical_description?: string | null;
  // Player-authored description visible to the whole party
  player_description?: string | null;
  // Experience points (optional — campaigns using milestone levelling leave it 0)
  experience_points?: number;
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
  active_infusions: { name: string; inv_item_id: string | null }[];
  rage_active?: boolean;
  level_choices: LevelChoices;
  concentration?: ConcentrationState | null;
  wildshape_state?: WildshapeState | null;
  wildshapes_used?: number;
  wildshape_reset?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConcentrationState {
  spellId: string | null;
  spellName: string;
  castAtLevel: number;
  startedRound: number | null;
  appliedEffectIds: string[];
}

export type PartyMemberInsert = Omit<PartyMember, "id" | "user_id" | "owner_user_id" | "is_dm_managed" | "created_at" | "updated_at" | "level_choices"> & {
  owner_user_id?: string | null;
  level_choices?: LevelChoices;
};
export type PartyMemberUpdate = Partial<PartyMemberInsert>;

// Conditions + helpers now live in `@/lib/conditions`. Re-exported here so
// existing imports from `@/types/party.types` keep working.
export { CONDITIONS, ATTACK_DIS_CONDITIONS, CHECK_DIS_CONDITIONS } from "@/lib/conditions";

// ── AC formula ───────────────────────────────────────────────────────────────
// Encodes where a character's AC comes from. Stored in party_members.ac_formula.
// null → manual (use ac integer as-is).
// "unarmored:dex+con" → Barbarian Unarmored Defense: 10 + DEX mod + CON mod
// "unarmored:dex+wis" → Monk Unarmored Defense:      10 + DEX mod + WIS mod
// "mage_armor"        → Mage Armor spell:             13 + DEX mod
// "natural:<N>"       → Natural Armor:                fixed base AC N (e.g. "natural:15")

export function computeAc(
  formula: string | null | undefined,
  scores: { ac: number; dex: number; con: number; wis: number },
): number {
  if (!formula) return scores.ac;
  const dexMod = Math.floor((scores.dex - 10) / 2);
  if (formula === "unarmored:dex+con") return 10 + dexMod + Math.floor((scores.con - 10) / 2);
  if (formula === "unarmored:dex+wis") return 10 + dexMod + Math.floor((scores.wis - 10) / 2);
  if (formula === "mage_armor") return 13 + dexMod;
  if (formula.startsWith("natural:")) {
    const base = parseInt(formula.slice(8), 10);
    return isNaN(base) ? scores.ac : base;
  }
  return scores.ac;
}

// ── XP-per-level table (D&D 5e PHB) ──────────────────────────────────────────
// Total XP required to reach each level. Index 0 → Lv 1, index 19 → Lv 20.
// At level N, you need LEVEL_XP_THRESHOLDS[N-1] total XP; the next level
// unlocks at LEVEL_XP_THRESHOLDS[N].
export const LEVEL_XP_THRESHOLDS: number[] = [
  0,        // 1
  300,      // 2
  900,      // 3
  2_700,    // 4
  6_500,    // 5
  14_000,   // 6
  23_000,   // 7
  34_000,   // 8
  48_000,   // 9
  64_000,   // 10
  85_000,   // 11
  100_000,  // 12
  120_000,  // 13
  140_000,  // 14
  165_000,  // 15
  195_000,  // 16
  225_000,  // 17
  265_000,  // 18
  305_000,  // 19
  355_000,  // 20
];

/** Highest level whose XP requirement <= the given total. */
export function levelForXp(xp: number): number {
  let lvl = 1;
  for (let i = 0; i < LEVEL_XP_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_XP_THRESHOLDS[i]) lvl = i + 1;
    else break;
  }
  return lvl;
}

/** XP required to reach the next level after the given total level. Null at 20. */
export function xpForNextLevel(currentLevel: number): number | null {
  if (currentLevel >= 20) return null;
  return LEVEL_XP_THRESHOLDS[currentLevel] ?? null;
}

/** Total XP required to reach `level` (the floor of that level's bracket). */
export function xpForLevel(level: number): number {
  const idx = Math.max(1, Math.min(20, level)) - 1;
  return LEVEL_XP_THRESHOLDS[idx];
}
