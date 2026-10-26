import type { AiProvenance } from "@/ai/provenance";
import type { InventionBenchEntry, InventionDraft, InventionMode, InventionStatus } from "@edge-shared/invention/types.ts";

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
// The shape of `crafting_inventions.draft` is defined once, beside the invent-recipe validator
// that writes it; a hand-kept copy here would drift from it silently, and parseInvention throws
// on anything it does not expect.
export type {
  InventionBenchEntry,
  InventionDraft,
  InventionIngredient,
  InventionItemRef,
  InventionMechanic,
  InventionMode,
  InventionNewItem,
  InventionNewMaterial,
  InventionOutput,
  InventionRecipe,
  InventionStatus,
} from "@edge-shared/invention/types.ts";

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
