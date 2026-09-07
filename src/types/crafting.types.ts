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
  player_visible_to: string[];
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
}

export type CraftingOutputInsert = Omit<CraftingOutput, "id">;

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
}

export type CraftingIngredientInsert = Omit<CraftingIngredient, "id">;

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
