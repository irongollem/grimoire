export type CraftingDiscipline =
  | "alchemy"
  | "smithing"
  | "leatherworking"
  | "woodcarving"
  | "jewelcrafting"
  | "herbalism"
  | "poisoncraft"
  | "tinkering"
  | "cooking"
  | "scribing";

export interface CraftingRecipe {
  id: string;
  user_id: string;
  campaign_id: string;
  name: string;
  description: string;
  discipline: CraftingDiscipline;
  dc: number;
  crafting_time_days: number;
  is_player_visible: boolean;
  created_at: string;
  updated_at: string;
}

export type CraftingRecipeInsert = Omit<CraftingRecipe, "id" | "user_id" | "created_at" | "updated_at">;
export type CraftingRecipeUpdate = Partial<CraftingRecipeInsert>;

export interface CraftingOutput {
  id: string;
  recipe_id: string;
  item_id: string;
  quantity: number;
}

export type CraftingOutputInsert = Omit<CraftingOutput, "id">;

export interface CraftingIngredient {
  id: string;
  recipe_id: string;
  item_id: string;
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

export interface CraftingRecipeGrant {
  recipe_id: string;
  party_member_id: string;
  granted_at: string;
}

export type CraftingOutcome = "success" | "fail" | "ruin";

export interface CraftingAttemptResult {
  roll: number;
  total: number;
  diff: number;
  outcome: CraftingOutcome;
  hasDisadvantage: boolean;
  roll2?: number; // second roll when disadvantage applies
}
