import type { AiProvenance } from "@/ai/provenance";

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
