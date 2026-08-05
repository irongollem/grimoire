import type { NpcStatus, NpcRelationship } from "@/types/npc.types";
import type { MonsterType, MonsterSize, MonsterStatBlock } from "@/types/monster.types";
import type { ItemType, ItemRarity } from "@/types/item.types";
import type { SpellSchool } from "@/types/spell.types";
import type { DamageRoll } from "@/lib/dice/dice";
import type { TrapType, TrapTrigger, TrapResetType, TrapSaveType, DamageEntry } from "@/types/trap.types";
import type { AiProvenance } from "@/ai/provenance";

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
  /** Present when the server (or the local BYOK path) attached provenance to the draft. */
  ai_provenance?: AiProvenance;
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
  /** Attached by buildAiProvenance() — monster generation is client-direct BYOK, no server draft. */
  ai_provenance?: AiProvenance;
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
  /** Attached by buildAiProvenance() — item generation is client-direct BYOK, no server draft. */
  ai_provenance?: AiProvenance;
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
  /** Attached by buildAiProvenance() — puzzle generation is client-direct BYOK, no server draft. */
  ai_provenance?: AiProvenance;
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
  /** Attached by buildAiProvenance() — spell generation is client-direct BYOK, no server draft. */
  ai_provenance?: AiProvenance;
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
  /** Present when the server (or the local BYOK path) attached provenance to the draft. */
  ai_provenance?: AiProvenance;
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
  /** Attached by buildAiProvenance() — faction generation is client-direct BYOK, no server draft. */
  ai_provenance?: AiProvenance;
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
  /** Present when the server (or the local BYOK path) attached provenance to the draft. */
  ai_provenance?: AiProvenance;
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
  /** One provenance record for the whole batch — every hook in `hooks` came from the same call. */
  ai_provenance?: AiProvenance;
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
  /** Present when the server (or the local BYOK path) attached provenance to the draft. */
  ai_provenance?: AiProvenance;
}

/**
 * One AI-generated loot-table entry (#602). Deliberately the AI-facing shape,
 * not `LootEntry`: the model returns an item NAME, which the client resolves
 * to a real `items` row before anything is persisted (see
 * resolveGeneratedLoot). Fields are optional per `type` — an item entry has no
 * coin amounts, a currency entry has no item_name — and the model is not
 * trusted to get that right, so every consumer validates rather than assumes.
 */
export interface LootEntryAiResult {
  type: "item" | "currency" | "random";
  /** type "item": the exact name of a vault item. Resolved by name, never an id. */
  item_name?: string;
  /** type "random": required rarity filter for the roll-time pick. */
  rarity?: string;
  /** type "random": optional item-type narrowing. */
  item_type_filter?: string | null;
  /** type "currency": optional label shown in chat (e.g. "Belt pouch"). */
  currency_label?: string | null;
  /** 1–100. Each entry is checked independently — this is not a d100 range. */
  drop_chance: number;
  /** Quantity dice ("2d4"); mutually exclusive with fixed_qty. */
  dice?: string | null;
  /** Fixed quantity; used when `dice` is absent. */
  fixed_qty?: number | null;
  notes?: string | null;
  pp?: number; gp?: number; ep?: number; sp?: number; cp?: number;
}

export interface LootTableAiResult {
  name: string;
  /** One-sentence description of whose hoard this is — plain text. */
  description: string;
  tags: string[];
  entries: LootEntryAiResult[];
  /** Echoed back by the server so the created table carries the tier the DM asked for. */
  cr_tier?: string;
  /**
   * False when retrieval was unavailable (no embedding vendor, backfill not
   * run, provider outage) and the model generated without the vault block.
   * The panel uses it to explain unresolved names as "not grounded" rather
   * than letting them read as a resolution bug.
   */
  grounded?: boolean;
  ai_provenance?: AiProvenance;
}

/**
 * A PROPOSED mid-fight complication (#604) — never an applied one. Everything
 * here is resolved and clamped by resolveGeneratedComplication before the DM
 * sees it, and nothing reaches the encounter until they approve the preview.
 *
 * `reinforcements` and `environment` are both optional and both routinely
 * absent: a complication can be pure narration. Consumers must tolerate
 * either being missing rather than treating the shape as guaranteed.
 */
export interface ComplicationAiResult {
  /** Event name for the runner's EVENTS list. */
  name: string;
  /** Read-aloud text. The one field the server insists on. */
  narration: string;
  reinforcements?: { name: string; count?: number; side?: string; role?: string | null }[];
  environment?: { label: string; description: string } | null;
  /** Echoed by the server so the panel knows which button produced this. */
  mode?: "complication" | "reinforcements";
  /**
   * False when bestiary retrieval was unavailable, so creature names are the
   * model guessing rather than a real roster. Lets the panel distinguish "your
   * campaign doesn't have that creature" from "the index isn't built yet".
   */
  grounded?: boolean;
  ai_provenance?: AiProvenance;
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
  /** Present when the server (or the local BYOK path) attached provenance to the draft. */
  ai_provenance?: AiProvenance;
}
