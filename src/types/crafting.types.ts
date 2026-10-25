import type { AiProvenance } from "@/ai/provenance";
import type { DamageRoll } from "@/lib/dice/dice";
import type { ItemRarity, ItemType } from "@/types/item.types";

export type CraftingDiscipline =
  | "alchemy"
  | "smithing"
  | "leathercraft"
  | "woodcraft"
  | "jewelcrafting"
  | "herbalism"
  | "poisoncraft"
  | "tinkering"
  | "cooking"
  | "scribing"
  | "forgery"
  | "brewing"
  | "weaving"
  | "masonry"
  | "painting";

export interface CraftingRecipe {
  id: string;
  user_id: string;
  campaign_id: string;
  name: string;
  description: string;
  discipline: CraftingDiscipline;
  dc: number;
  crafting_time: number;
  crafting_time_unit: "minutes" | "hours" | "days";
  requires_proficiency: boolean;
  requires_tools: boolean;
  /** A player can find this recipe by experimenting (craft_experiment, #1103). Off keeps it secret. */
  discoverable: boolean;
  player_visible_to: string[];
  /** The DM's own picture. Null shows the primary output's art instead
   *  (`resolveRecipeArt`, src/lib/crafting/recipeArt.ts). */
  image_url: string | null;
  image_focal_point: { x: number; y: number } | null;
  /** Set when the recipe came from the generator; flipped by markEdited on a material edit. */
  ai_provenance?: AiProvenance | null;
  created_at: string;
  updated_at: string;
}

export type CraftingRecipeInsert = Omit<
  CraftingRecipe,
  "id" | "user_id" | "created_at" | "updated_at"
>;
export type CraftingRecipeUpdate = Partial<CraftingRecipeInsert>;

export interface CraftingOutput {
  id: string;
  recipe_id: string;
  // At most one of these is set — a DB check constraint enforces it. Resolve
  // through `src/lib/itemRef.ts`, never by reading a column directly.
  item_id: string | null; // the owner's own items row (uuid)
  library_item_id: string | null; // shared library content (text id) — #819
  quantity: number;
  /** List order; 0 is the primary result, whose art a recipe shows by default.
   *  Written by the replace helpers from the list index, never by a caller. */
  position: number;
}

export type CraftingOutputInsert = Omit<CraftingOutput, "id" | "position">;

export interface CraftingIngredient {
  id: string;
  recipe_id: string;
  /** Specific item required. Exactly one of item_id / library_item_id / tags
   *  must be set — resolve via `src/lib/itemRef.ts`. */
  item_id: string | null;
  /** Shared library content required (text id) — #819. */
  library_item_id: string | null;
  /** Tag-based ingredient: any item whose tags include ALL values in this array. */
  tags: string[] | null;
  quantity: number;
  /** List order; 0 is the PRIMARY ingredient, ruined on a critical fail.
   *  Written by the replace helpers from the list index, never by a caller. */
  position: number;
}

export type CraftingIngredientInsert = Omit<CraftingIngredient, "id" | "position">;

export interface CraftingModifier {
  id: string;
  recipe_id: string;
  description: string;
  bonus: number;
}

export type CraftingModifierInsert = Omit<CraftingModifier, "id">;

export type CraftingOutcome = "success" | "fail" | "ruin";

export interface CraftingAttemptResult {
  roll: number;
  total: number;
  diff: number;
  outcome: CraftingOutcome;
  hasDisadvantage: boolean;
  roll2?: number; // second roll when disadvantage applies
}

// ── AI invention (#1103) ──────────────────────────────────────────────────────
// The shape of `crafting_inventions.draft`, written by the invent-recipe edge function's
// validator (supabase/functions/_shared/invention/) and read by materialise_crafting_invention.

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
  crafting_time: number;
  crafting_time_unit: "minutes" | "hours" | "days";
  /** True for a magic result: the crafter must be proficient, and the DC is stiffer. */
  requires_proficiency: boolean;
  /** Always true: the discipline's ordinary toolkit. */
  requires_tools: boolean;
  /** Something beyond tools and proficiency, e.g. "Taught by a runesmith". Judged by the DM, never enforced. */
  special_requirement: string | null;
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

/** A `crafting_inventions` row. */
export interface CraftingInvention {
  id: string;
  campaign_id: string;
  party_member_id: string;
  user_id: string;
  discipline: CraftingDiscipline;
  mode: InventionMode;
  wish: string | null;
  bench: InventionBenchEntry[];
  draft: InventionDraft;
  revision: number;
  status: InventionStatus;
  dm_note: string | null;
  recipe_id: string | null;
  ai_provenance: AiProvenance;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}
