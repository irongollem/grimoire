// The shape of `crafting_inventions.draft`, written by the invent-recipe validator and read by
// materialise_crafting_invention. This file is its ONE definition: the client re-exports the
// Invention* types from here (src/types/crafting.types.ts, through @edge-shared).
//
// The enums and DamageRoll above them are the other way round: edge code cannot import from
// src/, so they are copies of src/types/item.types.ts, src/types/crafting.types.ts and
// src/lib/dice/dice.ts, held equal by src/types/inventionEnumMirror.test.ts.

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
  | { kind: "spell"; name: string; level: number } // level 0 = cantrip
  | { kind: "charges"; max: number; recharge: string | null }
  | { kind: "resistance"; damage_type: string }
  | { kind: "advantage"; on: string };

export type InventionItemRef = { item_id: string } | { library_item_id: string };

export interface InventionNewItem {
  name: string;
  item_type: ItemType;
  subtype: string | null;
  rarity: ItemRarity;
  /** Formatted from value_cp, e.g. "40 gp". */
  cost: string;
  /** Per unit. */
  value_cp: number;
  weight: number | null;
  /** Description only, no game effects. */
  flavor: string;
  /** The game-ready rules in prose. */
  rules_text: string;
  /** What the item row gets: flavor + rules_text. */
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
  /** Exactly one of `ref` and `new` is non-null. */
  ref: InventionItemRef | null;
  new: InventionNewItem | null;
  /** Summary, always present (per unit). */
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
  /** Exactly one of `ref` and `new` is non-null. */
  ref: InventionItemRef | null;
  new: InventionNewMaterial | null;
  name: string;
  rarity: ItemRarity;
  /** Per unit. */
  value_cp: number;
  quantity: number;
}

export interface InventionRecipe {
  name: string;
  description: string;
  dc: number;
  /** True for a magic result: the crafter must be proficient, and the DC is stiffer. */
  requires_proficiency: boolean;
  /** Always true: the discipline's ordinary toolkit. */
  requires_tools: boolean;
  /** Something beyond tools and proficiency, e.g. "Taught by a runesmith". Judged by the DM, never enforced. */
  special_requirement: string | null;
  crafting_time: number;
  crafting_time_unit: "minutes" | "hours" | "days";
}

export interface InventionDraft {
  item: InventionOutput;
  /** Empty for an existing output. */
  mechanics: InventionMechanic[];
  /** Output count, at least 1. */
  quantity: number;
  recipe: InventionRecipe;
  /** 1 to 8. */
  ingredients: InventionIngredient[];
  materials_value_cp: number;
  value_multiple: number;
  value_limit_cp: number;
  rarity_ceiling: ItemRarity;
  /** Plain sentences: what the validator changed. */
  adjustments: string[];
  /** Plain sentences for the DM: undeclared mechanics found in the prose. */
  warnings: string[];
}

/** One entry of `crafting_inventions.bench`, from craft_invention_context. */
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
