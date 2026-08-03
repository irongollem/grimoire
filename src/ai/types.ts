import type { NpcStatus, NpcRelationship } from "@/types/npc.types";
import type { MonsterType, MonsterSize, MonsterStatBlock } from "@/types/monster.types";
import type { ItemType, ItemRarity } from "@/types/item.types";
import type { SpellSchool } from "@/types/spell.types";
import type { DamageRoll } from "@/lib/dice/dice";
import type { TrapType, TrapTrigger, TrapResetType, TrapSaveType, DamageEntry } from "@/types/trap.types";

export interface NpcAiResult {
  name: string;
  race: string;
  alignment: string;
  age: string;
  occupation: string;
  /** Plain text — convert to Tiptap JSON before writing to form */
  appearance: string;
  personality: string;
  backstory: string;
  notes: string;
  status: NpcStatus;
  relationship: NpcRelationship;
  tags: string[];
  /** Single-subject portrait description for image generation */
  true_portrait_prompt: string;
  /** Populated when alter ego was requested — edit instructions for the disguise portrait */
  disguise_image_prompt?: string;
  /** AI-suggested name for the NPC's disguise */
  disguise_name?: string;
}

export interface NpcAiGenerated extends NpcAiResult {
  portrait_url: string | null;
  /** Populated when alter ego generation was requested */
  disguise_portrait_url?: string | null;
}

export interface MonsterAiResult {
  name: string;
  monster_type: MonsterType;
  size: MonsterSize;
  alignment: string;
  habitat: string | null;
  tags: string[];
  /** Plain text — convert to Tiptap JSON before writing to form */
  description: string;
  /** Plain text — convert to Tiptap JSON before writing to form */
  notes: string;
  stat_block: MonsterStatBlock;
  /** Subject description for image generation */
  image_prompt: string;
}

export interface MonsterAiGenerated extends MonsterAiResult {
  image_url: string | null;
}

export interface ItemAiResult {
  name: string;
  item_type: ItemType;
  subtype: string | null;
  rarity: ItemRarity;
  requires_attunement: boolean;
  attunement_requirements: string | null;
  weight: string | null;
  cost: string | null;
  damage_rolls: DamageRoll[] | null;
  armor_class: string | null;
  properties: string[];
  /** 2024 PHB Weapon Mastery property (weapons only) — normalized via normalizeAiItemMastery before use */
  mastery?: string | null;
  weapon_range: string | null;
  versatile_damage: string | null;
  charges: number | null;
  recharge: string | null;
  /** Plain text — convert to Tiptap JSON before writing to form */
  description: string;
  /** Physical appearance before magical identification — null for mundane items */
  mundane_description: string | null;
  /** Precise D&D 5e mechanical benefits — concatenated into description before use */
  game_benefits: string;
  /** DM-facing curse text — null for non-cursed items */
  curse_description: string | null;
  tags: string[];
  /** Subject description for image generation */
  image_prompt: string;
}

export interface ItemAiGenerated extends ItemAiResult {
  image_url: string | null;
}

export interface PuzzleAiResult {
  name: string;
  puzzle_type: string;
  difficulty: string;
  /** Plain text — convert to Tiptap JSON before writing to form */
  description: string;
  hints: Array<{ order: number; text: string }>;
  /** Plain text — convert to Tiptap JSON before writing to form */
  solution: string;
  skill_checks: Array<{ skill: string; dc: number }>;
  success_outcome: string;
  failure_consequence: string;
  tags: string[];
  /** Plain text — convert to Tiptap JSON before writing to form */
  notes: string;
  /** Room illustration description for image generation */
  image_prompt: string;
}

export interface PuzzleAiGenerated extends PuzzleAiResult {
  image_url: string | null;
}

export interface SpellAiResult {
  name: string;
  level: number;
  school: SpellSchool;
  /** From CASTING_TIME_OPTIONS or "Special" */
  casting_time: string;
  /** Trigger text for Reaction, or full text if Special. Null otherwise. */
  casting_time_custom: string | null;
  /** From RANGE_OPTIONS or "Special" */
  range: string;
  range_custom: string | null;
  /** Subset of ["V","S","M"] */
  components: string[];
  /** Material component description (no parens). Null when "M" not present. */
  material: string | null;
  /** From DURATION_OPTIONS or "Special" */
  duration: string;
  duration_custom: string | null;
  concentration: boolean;
  ritual: boolean;
  /** ranged_spell | melee_spell | save | automatic | none */
  attack_type: string | null;
  /** STR | DEX | CON | INT | WIS | CHA — only when attack_type === "save" */
  save_attribute: string | null;
  /** half | negates | special — only when attack_type === "save" */
  save_effect: string | null;
  /** Per-instance damage rolls; null when the spell deals no damage */
  damage_rolls: DamageRoll[] | null;
  healing_dice: string | null;
  target_description: string | null;
  /** sphere | cone | line | cylinder | cube | emanation */
  aoe_shape: string | null;
  aoe_size: string | null;
  /** Lowercase 5e condition name (e.g. "blinded") */
  condition_inflicted: string | null;
  /** Plain text — populated directly into the description field */
  description: string;
  /** Plain text "At Higher Levels" paragraph; null for cantrips/non-scaling */
  higher_levels: string | null;
  classes: string[];
  tags: string[];
  /** Effect-in-flight description for image generation */
  image_prompt: string;
}

export interface SpellAiGenerated extends SpellAiResult {
  image_url: string | null;
}

export interface TrapAiResult {
  name: string;
  trap_type: TrapType;
  trigger_type: TrapTrigger;
  /** Plain text — convert to Tiptap JSON before writing to form */
  description: string;
  effect_description: string;
  detection_dc: number | null;
  disarm_dc: number | null;
  attack_bonus: number | null;
  save_type: TrapSaveType | null;
  save_dc: number | null;
  damage_entries: DamageEntry[];
  reset_type: TrapResetType;
  cr: string | null;
  trap_hp: number | null;
  trap_ac: number | null;
  tags: string[];
  /** Plain text — convert to Tiptap JSON before writing to form */
  notes: string;
  /** Subject description for image generation */
  image_prompt: string;
}

export interface TrapAiGenerated extends TrapAiResult {
  image_url: string | null;
}

export interface FactionAiResult {
  name: string;
  faction_type: string;
  alignment: string;
  /** Plain text — convert to Tiptap JSON before writing to form */
  description: string;
  tags: string[];
  /** Square emblem description for image generation */
  image_prompt: string;
}

export interface FactionAiGenerated extends FactionAiResult {
  image_url: string | null;
}

export interface LocationAiResult {
  name: string;
  /** Plain text — convert to Tiptap JSON before writing to form */
  description: string;
  /** Short player-facing summary — plain text */
  player_summary: string;
  tags: string[];
  /** Plain text DM notes */
  notes: string;
  /** Atmospheric illustration description for image generation */
  image_prompt: string;
  /** Top-down spatial description for map generation */
  map_prompt: string;
}

export interface LocationAiGenerated extends LocationAiResult {
  image_url: string | null;
  map_url: string | null;
}

export interface QuestHookResult {
  title: string;
  summary: string;
  /** Plain text — convert to Tiptap JSON via toTiptapJson() before storing */
  hook_description: string;
  /** 2–4 actionable objective strings */
  objectives: string[];
  tags: string[];
  /**
   * Names of campaign NPCs/locations/factions the hook references, resolved
   * client-side (see resolveGeneratedEntities) against the DM's own campaign
   * data. Only the server (generate-quest) retrieval path populates these —
   * the local BYOK path and older responses lack them entirely, so all three
   * are optional and every consumer must tolerate absence.
   */
  npcs?: string[];
  locations?: string[];
  factions?: string[];
}

export interface QuestHooksAiResult {
  hooks: QuestHookResult[];
}

/** One AI-generated roll-table entry — ranges are inclusive, no client `id` yet. */
export interface RollTableEntryAiResult {
  /** Inclusive range start (1..die max). */
  min: number;
  /** Inclusive range end (>= min, <= die max). */
  max: number;
  /** Short evocative result the DM reads at the table. */
  label: string;
  /** Optional DM-facing guidance (creatures, DCs, escalation). */
  notes?: string | null;
}

export interface RollTableAiResult {
  name: string;
  /** One-sentence description of when to roll on this table — plain text. */
  description: string;
  tags: string[];
  entries: RollTableEntryAiResult[];
  /**
   * Names of campaign NPCs/locations/factions the table references, resolved
   * client-side (see resolveGeneratedEntities) against the DM's own campaign
   * data. Only the server (generate-roll-table) retrieval path populates
   * these — the local BYOK path and older responses lack them entirely, so
   * all three are optional and every consumer must tolerate absence.
   */
  npcs?: string[];
  locations?: string[];
  factions?: string[];
}

export interface NpcVoiceAiResult {
  /** 2–3 short, immediately speakable in-character replies. */
  lines: string[];
}

export interface EncounterCombatantAiResult {
  /** Monster name as the AI wrote it — resolved against the Bestiary by name. */
  name: string;
  count: number;
  /** Tactical role label, e.g. "Leader", "Archer". */
  role: string;
}

export interface EncounterAiResult {
  name: string;
  /** easy | medium | hard | deadly — the tier the AI actually built. */
  difficulty: string;
  environment: string;
  tactics: string;
  twist: string;
  combatants: EncounterCombatantAiResult[];
}
