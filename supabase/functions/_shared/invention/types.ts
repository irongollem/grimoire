// Mirrors of the client types the validator needs. Edge functions cannot import
// from src/, so these are copied (see supabase/functions/generate-loot/index.ts).
// Source: src/types/item.types.ts, src/types/crafting.types.ts, src/lib/dice/dice.ts.

export const ITEM_RARITIES = [
  "mundane",
  "common",
  "uncommon",
  "rare",
  "very_rare",
  "legendary",
  "artifact",
] as const;
export type ItemRarity = (typeof ITEM_RARITIES)[number];

export const ITEM_TYPES = [
  "weapon",
  "armor",
  "shield",
  "potion",
  "wondrous_item",
  "ring",
  "rod",
  "staff",
  "wand",
  "scroll",
  "ammunition",
  "gear",
  "tool",
  "vehicle",
  "trade_good",
  "crafting_material",
  "provision",
  "art_object",
  "service",
  "pack",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const CRAFTING_DISCIPLINES = [
  "alchemy",
  "smithing",
  "leathercraft",
  "woodcraft",
  "jewelcrafting",
  "herbalism",
  "poisoncraft",
  "tinkering",
  "cooking",
  "scribing",
  "forgery",
  "brewing",
  "weaving",
  "masonry",
  "painting",
] as const;
export type CraftingDiscipline = (typeof CRAFTING_DISCIPLINES)[number];

export interface DamageRoll {
  dice: string;
  type: string;
}

export type InventionMode = "materials" | "idea";
export type InventionStatus = "draft" | "pending" | "approved";

export type InventionMechanic =
  | { kind: "minor"; text: string }
  | { kind: "attack_bonus"; value: number }
  | { kind: "ac_bonus"; value: number }
  | { kind: "save_bonus"; value: number }
  | { kind: "extra_damage"; dice: string; damage_type: string }
  | { kind: "healing"; dice: string }
  | { kind: "spell"; name: string; level: number }
  | { kind: "charges"; max: number; recharge: string | null }
  | { kind: "resistance"; damage_type: string }
  | { kind: "advantage"; on: string };

export type InventionItemRef = { item_id: string } | { library_item_id: string };

export interface InventionNewItem {
  name: string;
  item_type: ItemType;
  subtype: string | null;
  rarity: ItemRarity;
  cost: string;
  value_cp: number;
  weight: number | null;
  flavor: string;
  rules_text: string;
  description: string;
  requires_attunement: boolean;
  attunement_requirements: string | null;
  charges: number | null;
  recharge: string | null;
  damage_rolls: DamageRoll[] | null;
  armor_class: string | null;
  properties: string[];
  tags: string[];
}

export interface InventionOutput {
  ref: InventionItemRef | null;
  new: InventionNewItem | null;
  name: string;
  rarity: ItemRarity;
  item_type: ItemType;
  value_cp: number;
}

export interface InventionNewMaterial {
  name: string;
  item_type: "crafting_material";
  rarity: ItemRarity;
  cost: string;
  value_cp: number;
  description: string;
  tags: string[];
}

export interface InventionIngredient {
  ref: InventionItemRef | null;
  new: InventionNewMaterial | null;
  name: string;
  rarity: ItemRarity;
  value_cp: number;
  quantity: number;
}

export interface InventionRecipe {
  name: string;
  description: string;
  dc: number;
  requires_proficiency: boolean;
  requires_tools: boolean;
  special_requirement: string | null;
  crafting_time: number;
  crafting_time_unit: "minutes" | "hours" | "days";
}

export interface InventionDraft {
  item: InventionOutput;
  mechanics: InventionMechanic[];
  quantity: number;
  recipe: InventionRecipe;
  ingredients: InventionIngredient[];
  materials_value_cp: number;
  value_multiple: number;
  value_limit_cp: number;
  rarity_ceiling: ItemRarity;
  adjustments: string[];
  warnings: string[];
}

export interface InventionBenchEntry {
  row_id: string;
  dishes: number;
  item_id: string | null;
  library_item_id: string | null;
  name: string;
  rarity: ItemRarity;
  item_type: ItemType;
  cost: string | null;
  tags: string[];
}
