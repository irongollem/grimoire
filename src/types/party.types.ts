import type { LevelChoiceRecord } from "@/rules/features/levelUpChoices";
import type { RulesetKey } from "@/types/ruleset.types";
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
  /** Legacy rows omit this and are treated as ordinary long-rest Spellcasting slots. */
  pool?: "spellcasting" | "pact" | "temporary" | "feature";
  /** Explicit recovery cadence for nonstandard pools. */
  recovery?: "short" | "long" | "none";
}

/** What one skill's proficiency was before a level changed it; `null` when the skill had no entry. */
export interface LevelSkillChange {
  from: SkillProfLevel | null;
  to: SkillProfLevel;
}

/**
 * Everything one level-up chose, held so a de-level can take it back exactly
 * (#976). `record` carries the class_choices, feats, swaps and ability increases
 * (the increases are already capped, so reverting subtracts exactly them).
 */
export interface LevelChoiceEntry {
  class_name: string;
  /** The class definition the level was taken in; a de-level finds the class row by it. */
  class_definition_id: string;
  is_new_class: boolean;
  hp_gained: number;
  /** Name of the subclass taken at this level, so a de-level clears it. */
  subclass?: string;
  spells_learned?: string[];
  cantrips_learned?: string[];
  /** Tool proficiencies a new class gave, taken back with the class. */
  new_class_profs?: string[];
  /** Tools and languages the level's features gave outright (#994); a de-level removes exactly these. */
  granted_profs?: { tools: string[]; languages: string[] };
  /** Spells the level's feature picks added to the sheet (#994), taken back with the level. */
  feature_spells?: string[];
  /**
   * What the level chose, exactly enough to take it back. Every level has one:
   * history written before #976 was converted by migration 20261005181020.
   */
  record: LevelChoiceRecord;
  skills: Record<string, LevelSkillChange>;
  /** Item ids added to and removed from `weapon_masteries`. */
  masteries: { added: string[]; removed: string[] };
}

export type LevelChoices = Record<number, LevelChoiceEntry>;

/**
 * A player-defined attack button (#568) — for attacks not derived from
 * equipment: companion attacks, class features, improvised setups.
 * `damage` is a dice expression parseable by `parseExpression` ("2d6+3").
 * `attack_bonus: null` means no to-hit roll (auto-hit / save-based) — only
 * the damage button renders.
 */
export interface CustomAttack {
  id: string;
  name: string;
  attack_bonus: number | null;
  damage: string;
  damage_type: string | null;
}

export interface PartyMember {
  id: string;
  user_id: string;
  owner_user_id: string | null;
  is_dm_managed: boolean;
  /** The DM-offered character this one was copied from by "Play this character"; null otherwise. */
  assumed_from_id?: string | null;
  campaign_id: string | null;
  /** This character's own edition; changes only through `convert_party_member_ruleset`. */
  ruleset: RulesetKey;
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
  /**
   * The AC this character had before Armour Class became calculated. Read only
   * by the one-time "your AC is now worked out from your gear" notice, which
   * clears it; null for every new or edited character. Never display it: the
   * AC is `useArmorClass().acFor(member)`.
   */
  ac: number | null;
  /** An extra AC calculation the character has; see the grammar below. */
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
  /** 2024-only: item ids (matching `Item.id`) of weapons this character has mastery with. Empty/unused under 2014. */
  weapon_masteries: string[];
  spell_slots: SpellSlotEntry[];
  current_location_id: string | null;
  carry_capacity_override: string | null; // expression: "*2", "+30", "-10", or bare number for absolute
  hit_dice_remaining?: number | null;
  /** Keyed by `FeatureUses.key`. `short_rest_regain` is what a short rest returns to a long-rest pool. */
  class_resources: Record<string, { current: number; max: number; rest: "short" | "long" | "none"; short_rest_regain?: number }>;
  class_choices: Record<string, unknown>;
  active_infusions: { name: string; inv_item_id: string | null }[];
  /** Player-defined attack buttons not derived from equipment (companion attacks, etc. — #568). */
  custom_attacks: CustomAttack[];
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

/**
 * `class` and `subclass` are a database-maintained mirror of the character's
 * primary `character_classes` row, so a client write is silently overwritten and
 * neither is accepted here. They stay on `PartyMember` for reading.
 */
export type PartyMemberInsert = Omit<PartyMember, "id" | "user_id" | "owner_user_id" | "is_dm_managed" | "assumed_from_id" | "ac" | "created_at" | "updated_at" | "level_choices" | "ruleset" | "class" | "subclass"> & {
  owner_user_id?: string | null;
  level_choices?: LevelChoices;
  ruleset: RulesetKey;
};
/** `ruleset` is not client-writable: it changes only through `convert_party_member_ruleset`. */
export type PartyMemberUpdate = Partial<Omit<PartyMemberInsert, "ruleset">> & {
  /** The retired stored AC can only be cleared (the one-time notice's "Got it"), never set. */
  ac?: null;
};

// Conditions + helpers now live in `@/rules/conditions`. Re-exported here so
// existing imports from `@/types/party.types` keep working.
export { CONDITIONS, ATTACK_DIS_CONDITIONS, CHECK_DIS_CONDITIONS } from "@/rules/conditions";

// ── AC formula ───────────────────────────────────────────────────────────────
// Armour Class is calculated from the character and their gear (`@/rules/armorClass`),
// never stored. `party_members.ac_formula` names an extra calculation the character
// has on top of what their class gives automatically (Barbarian and Monk Unarmored
// Defense, Draconic Resilience); the highest calculation they qualify for wins.
// null                → none beyond the class's own.
// "unarmored:dex+con" → Barbarian Unarmored Defense: 10 + DEX mod + CON mod (multiclass)
// "unarmored:dex+wis" → Monk Unarmored Defense:      10 + DEX mod + WIS mod (multiclass, no shield)
// "mage_armor"        → Mage Armor spell:             13 + DEX mod
// "natural:<N>"       → Natural Armor:                fixed base AC N (e.g. "natural:15")
// "natural:<N>+dex"   → Natural Armor + Dex:           base N + DEX mod (e.g. Lizardfolk
//                       "natural:13+dex")
// "natural:<N>+con"   → Natural Armor + Con:           base N + CON mod (e.g. Loxodon
//                       "natural:12+con")
// Worn armour, a shield in the off hand and magic items are read from the inventory.

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
