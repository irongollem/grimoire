import type { NpcStatus, NpcRelationship } from "@/types/npc.types";
import type { MonsterType, MonsterSize, MonsterStatBlock } from "@/types/monster.types";
import type { ItemType, ItemRarity } from "@/types/item.types";
import type { DamageRoll } from "@/lib/dice";

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
  /** NPC-specific subject description for image generation */
  image_prompt: string;
}

export interface NpcAiGenerated extends NpcAiResult {
  portrait_url: string | null;
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
