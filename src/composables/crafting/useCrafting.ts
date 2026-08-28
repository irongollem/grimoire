import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type {
  CraftingRecipe,
  CraftingRecipeInsert,
  CraftingRecipeUpdate,
  CraftingIngredient,
  CraftingIngredientInsert,
  CraftingModifier,
  CraftingModifierInsert,
  CraftingOutput,
  CraftingOutputInsert,
  CraftingAttemptResult,
} from "@/types/crafting.types";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import type { StarterRecipeDef } from "@/data/starterRecipes";

const RECIPES_KEY    = "crafting-recipes";
const INGREDIENTS_KEY = "crafting-ingredients";
const MODIFIERS_KEY  = "crafting-modifiers";
const OUTPUTS_KEY    = "crafting-outputs";

// ── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchRecipes(campaignId: string): Promise<CraftingRecipe[]> {
  const { data, error } = await supabase
    .from("crafting_recipes")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as CraftingRecipe[];
}

async function fetchRecipe(id: string): Promise<CraftingRecipe> {
  const { data, error } = await supabase
    .from("crafting_recipes")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as CraftingRecipe;
}

async function fetchIngredients(recipeId: string): Promise<CraftingIngredient[]> {
  const { data, error } = await supabase
    .from("crafting_recipe_ingredients")
    .select("*")
    .eq("recipe_id", recipeId);
  if (error) throw error;
  return data as CraftingIngredient[];
}

async function fetchModifiers(recipeId: string): Promise<CraftingModifier[]> {
  const { data, error } = await supabase
    .from("crafting_recipe_modifiers")
    .select("*")
    .eq("recipe_id", recipeId);
  if (error) throw error;
  return data as CraftingModifier[];
}

async function fetchOutputs(recipeId: string): Promise<CraftingOutput[]> {
  const { data, error } = await supabase
    .from("crafting_recipe_outputs")
    .select("*")
    .eq("recipe_id", recipeId);
  if (error) throw error;
  return data as CraftingOutput[];
}

// Names of items a recipe produces, for recipes the caller can access. A player
// shared a recipe can't read its output item under RLS, so the recipe card fell
// back to "Unknown item" and a craft inserted an empty-name row — this projection
// exposes just id+name (not secret; the shared recipe advertises its output).
async function fetchCraftableOutputItems(campaignId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.rpc("get_craftable_output_items", { p_campaign_id: campaignId });
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}

// ── Mutation helpers ─────────────────────────────────────────────────────────

async function createRecipe(recipe: CraftingRecipeInsert): Promise<CraftingRecipe> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("crafting_recipes")
    .insert({ ...recipe, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as CraftingRecipe;
}

async function updateRecipe(id: string, update: CraftingRecipeUpdate): Promise<CraftingRecipe> {
  const { data, error } = await supabase
    .from("crafting_recipes")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as CraftingRecipe;
}

async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from("crafting_recipes").delete().eq("id", id);
  if (error) throw error;
}

// Replace all ingredients for a recipe
async function replaceIngredients(
  recipeId: string,
  ingredients: Omit<CraftingIngredientInsert, "recipe_id">[],
): Promise<void> {
  const { error: delErr } = await supabase
    .from("crafting_recipe_ingredients")
    .delete()
    .eq("recipe_id", recipeId);
  if (delErr) throw delErr;
  if (ingredients.length === 0) return;
  const { error } = await supabase
    .from("crafting_recipe_ingredients")
    .insert(ingredients.map((i) => ({ ...i, recipe_id: recipeId })));
  if (error) throw error;
}

// Replace all outputs for a recipe
async function replaceOutputs(
  recipeId: string,
  outputs: Omit<CraftingOutputInsert, "recipe_id">[],
): Promise<void> {
  const { error: delErr } = await supabase
    .from("crafting_recipe_outputs")
    .delete()
    .eq("recipe_id", recipeId);
  if (delErr) throw delErr;
  if (outputs.length === 0) return;
  const { error } = await supabase
    .from("crafting_recipe_outputs")
    .insert(outputs.map((o) => ({ ...o, recipe_id: recipeId })));
  if (error) throw error;
}

// Replace all modifiers for a recipe
async function replaceModifiers(
  recipeId: string,
  modifiers: Omit<CraftingModifierInsert, "recipe_id">[],
): Promise<void> {
  const { error: delErr } = await supabase
    .from("crafting_recipe_modifiers")
    .delete()
    .eq("recipe_id", recipeId);
  if (delErr) throw delErr;
  if (modifiers.length === 0) return;
  const { error } = await supabase
    .from("crafting_recipe_modifiers")
    .insert(modifiers.map((m) => ({ ...m, recipe_id: recipeId })));
  if (error) throw error;
}


// ── Query composables ────────────────────────────────────────────────────────

export function useCraftingRecipes() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [RECIPES_KEY, campaignId.value]),
    queryFn: () => fetchRecipes(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

/** Player-facing: only recipes the player can see (RLS handles the filter) */
export function usePlayerCraftingRecipes() {
  return useCraftingRecipes();
}

/**
 * Map of output item_id → name for every recipe the caller can access in the
 * active campaign. Lets a player resolve a craftable output's name even though
 * they can't read the output vault item under RLS (recipe cards + crafted rows).
 */
export function useCraftableOutputItems() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const query = useQuery({
    queryKey: computed(() => ["craftable-output-items", campaignId.value]),
    queryFn: () => fetchCraftableOutputItems(campaignId.value!),
    enabled: () => !!campaignId.value,
    staleTime: Infinity,
  });
  const map = computed(() => {
    const m = new Map<string, string>();
    for (const row of query.data.value ?? []) m.set(row.id, row.name);
    return m;
  });
  return { map, isLoading: query.isLoading };
}

export function useCraftingRecipe(id: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => [RECIPES_KEY, toValue(id)]),
    queryFn: () => fetchRecipe(toValue(id)),
    enabled: () => !!toValue(id),
  });
}

export function useRecipeIngredients(recipeId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => [INGREDIENTS_KEY, toValue(recipeId)]),
    queryFn: () => fetchIngredients(toValue(recipeId)),
    enabled: () => !!toValue(recipeId),
  });
}

export function useRecipeOutputs(recipeId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => [OUTPUTS_KEY, toValue(recipeId)]),
    queryFn: () => fetchOutputs(toValue(recipeId)),
    enabled: () => !!toValue(recipeId),
  });
}

export function useRecipeModifiers(recipeId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => [MODIFIERS_KEY, toValue(recipeId)]),
    queryFn: () => fetchModifiers(toValue(recipeId)),
    enabled: () => !!toValue(recipeId),
  });
}

/** Batch variants — single query per table using .in(), returns ComputedRef<Map<recipeId, data[]>> */
export function useAllRecipeIngredients(recipeIds: MaybeRefOrGetter<string[]>) {
  const result = useQuery({
    queryKey: computed(() => [INGREDIENTS_KEY, "batch", [...toValue(recipeIds)].sort().join(",")]),
    queryFn: async () => {
      const ids = toValue(recipeIds);
      if (ids.length === 0) return [] as CraftingIngredient[];
      const { data, error } = await supabase
        .from("crafting_recipe_ingredients")
        .select("*")
        .in("recipe_id", ids);
      if (error) throw error;
      return data as CraftingIngredient[];
    },
    enabled: () => toValue(recipeIds).length > 0,
  });
  return computed(() => {
    const map = new Map<string, CraftingIngredient[]>();
    for (const ing of result.data.value ?? []) {
      const list = map.get(ing.recipe_id) ?? [];
      list.push(ing);
      map.set(ing.recipe_id, list);
    }
    return map;
  });
}

export function useAllRecipeOutputs(recipeIds: MaybeRefOrGetter<string[]>) {
  const result = useQuery({
    queryKey: computed(() => [OUTPUTS_KEY, "batch", [...toValue(recipeIds)].sort().join(",")]),
    queryFn: async () => {
      const ids = toValue(recipeIds);
      if (ids.length === 0) return [] as CraftingOutput[];
      const { data, error } = await supabase
        .from("crafting_recipe_outputs")
        .select("*")
        .in("recipe_id", ids);
      if (error) throw error;
      return data as CraftingOutput[];
    },
    enabled: () => toValue(recipeIds).length > 0,
  });
  return computed(() => {
    const map = new Map<string, CraftingOutput[]>();
    for (const out of result.data.value ?? []) {
      const list = map.get(out.recipe_id) ?? [];
      list.push(out);
      map.set(out.recipe_id, list);
    }
    return map;
  });
}

export function useAllRecipeModifiers(recipeIds: MaybeRefOrGetter<string[]>) {
  const result = useQuery({
    queryKey: computed(() => [MODIFIERS_KEY, "batch", [...toValue(recipeIds)].sort().join(",")]),
    queryFn: async () => {
      const ids = toValue(recipeIds);
      if (ids.length === 0) return [] as CraftingModifier[];
      const { data, error } = await supabase
        .from("crafting_recipe_modifiers")
        .select("*")
        .in("recipe_id", ids);
      if (error) throw error;
      return data as CraftingModifier[];
    },
    enabled: () => toValue(recipeIds).length > 0,
  });
  return computed(() => {
    const map = new Map<string, CraftingModifier[]>();
    for (const mod of result.data.value ?? []) {
      const list = map.get(mod.recipe_id) ?? [];
      list.push(mod);
      map.set(mod.recipe_id, list);
    }
    return map;
  });
}

// ── Mutation composables ─────────────────────────────────────────────────────

export function useCreateRecipe() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (recipe: Omit<CraftingRecipeInsert, "campaign_id">) =>
      createRecipe({ ...recipe, campaign_id: campaign.activeCampaignId! }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [RECIPES_KEY] }),
  });
}

export function useRevealAllRecipes() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (partyMemberIds: string[]) => {
      const { error } = await supabase
        .from("crafting_recipes")
        .update({ player_visible_to: partyMemberIds })
        .eq("campaign_id", campaign.activeCampaignId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [RECIPES_KEY] }),
  });
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: CraftingRecipeUpdate }) =>
      updateRecipe(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [RECIPES_KEY] });
      queryClient.invalidateQueries({ queryKey: [RECIPES_KEY, id] });
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRecipe,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [RECIPES_KEY] }),
  });
}

export function useReplaceIngredients() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      recipeId,
      ingredients,
    }: {
      recipeId: string;
      ingredients: Omit<CraftingIngredientInsert, "recipe_id">[];
    }) => replaceIngredients(recipeId, ingredients),
    onSuccess: (_data, { recipeId }) =>
      queryClient.invalidateQueries({ queryKey: [INGREDIENTS_KEY, recipeId] }),
  });
}

export function useReplaceOutputs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      recipeId,
      outputs,
    }: {
      recipeId: string;
      outputs: Omit<CraftingOutputInsert, "recipe_id">[];
    }) => replaceOutputs(recipeId, outputs),
    onSuccess: (_data, { recipeId }) =>
      queryClient.invalidateQueries({ queryKey: [OUTPUTS_KEY, recipeId] }),
  });
}

export function useReplaceModifiers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      recipeId,
      modifiers,
    }: {
      recipeId: string;
      modifiers: Omit<CraftingModifierInsert, "recipe_id">[];
    }) => replaceModifiers(recipeId, modifiers),
    onSuccess: (_data, { recipeId }) =>
      queryClient.invalidateQueries({ queryKey: [MODIFIERS_KEY, recipeId] }),
  });
}


// ── Crafting attempt ─────────────────────────────────────────────────────────

export function useAttemptCraft() {
  const queryClient = useQueryClient();
  const { promptRoll } = usePromptedRoll();
  return useMutation({
    mutationFn: async (params: {
      recipe: CraftingRecipe;
      /** Output items to add to inventory on success */
      outputs: CraftingOutput[];
      /** Resolved names for each output item (item_id → display name) */
      outputItemNames: Record<string, string>;
      /** party_inventory rows to consume, each with the quantity the recipe uses */
      ingredientConsumption: { id: string; qty: number }[];
      /** primary ingredient's inventory id — ruined on critical fail */
      primaryIngredientInventoryId: string;
      /** primary ingredient's carried_by (for re-adding as ruined) */
      primaryInventoryItem: { item_id: string; name: string; carried_by: string | null; campaign_id: string };
      modifierBonuses: number[];
      abilityMod: number;
      profBonus: number;
      /** player has the physical tool in inventory */
      hasTools: boolean;
      partyMemberId: string;
    }): Promise<CraftingAttemptResult> => {
      const {
        recipe,
        outputs,
        outputItemNames,
        ingredientConsumption,
        primaryInventoryItem,
        modifierBonuses,
        abilityMod,
        profBonus,
        hasTools,
        partyMemberId,
      } = params;

      // 1. Roll — disadvantage if no physical tool
      const mode: "normal" | "disadvantage" = hasTools ? "normal" : "disadvantage";
      const modSum = modifierBonuses.reduce((a, b) => a + b, 0);
      const totalMod = abilityMod + profBonus + modSum;
      const rollResult = await promptRoll({
        counts: { 20: 1 },
        modifier: totalMod,
        label: `Crafting Check (DC ${recipe.dc})`,
        mode,
        silent: true,
      });
      if (!rollResult) throw new Error("Roll cancelled");
      const kept = rollResult.breakdown.find((d) => !d.dropped)!;
      const dropped = rollResult.breakdown.find((d) => d.dropped);
      const roll = kept.val;
      const roll2 = dropped?.val;

      const total = rollResult.total;
      const diff = total - recipe.dc;

      // Ruin on a natural 1 (auto-fail regardless of modifiers — matches the
      // "Critical Failure" label) OR when the total misses the DC by 5+. `roll`
      // is the kept d20 (post advantage/disadvantage), so nat-1 is the natural roll.
      const outcome =
        roll === 1 ? "ruin"
          : diff >= 0 ? "success"
            : diff <= -5 ? "ruin"
              : "fail";

      // 2 + 3. Consume ingredients AND create the output/ruined item in one
      // atomic RPC (craft_apply) — see migration 20260613000002. Previously
      // these were two separate requests; a failure between them destroyed the
      // ingredients with nothing created.
      const successRows =
        outcome === "success"
          ? outputs.map((output) => ({
              campaign_id: recipe.campaign_id,
              item_id: output.item_id,
              name: output.item_id ? (outputItemNames[output.item_id] ?? "") : "",
              quantity: output.quantity,
              carried_by: partyMemberId,
            }))
          : [];
      const ruinedRow =
        outcome === "ruin"
          ? {
              campaign_id: primaryInventoryItem.campaign_id,
              item_id: primaryInventoryItem.item_id,
              name: `Ruined: ${primaryInventoryItem.name}`,
              carried_by: primaryInventoryItem.carried_by,
            }
          : null;

      const { error } = await supabase.rpc("craft_apply", {
        p_ingredients: ingredientConsumption,
        p_outcome: outcome,
        p_success_rows: successRows,
        p_ruined_row: ruinedRow,
      });
      if (error) throw error;

      return { roll, roll2, total, diff, outcome, hasDisadvantage: !hasTools };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["party-inventory"] });
    },
    // No onError toast here: CraftAttemptDialog already surfaces failures inline
    // via attemptError. A toast would be redundant double-feedback.
  });
}


// ── Starter recipe import ────────────────────────────────────────────────────

/**
 * Correlates each starter-recipe definition with its freshly-inserted recipe
 * id by array position (see useImportStarterRecipes: a single bulk
 * `insert(...).select()` preserves input row order) rather than by name —
 * starter recipe names aren't guaranteed unique, and a name→id Map would
 * silently mis-map the moment two ever collided — then flattens the
 * ingredients/outputs/modifiers into the three batched insert payloads.
 * Exported for testing.
 */
export function buildStarterRecipeChildRows(
  defs: StarterRecipeDef[],
  recipeIds: string[],
  outputItemIdByName: Map<string, string>,
): {
  ingredientRows: { recipe_id: string; item_id: null; tags: string[]; quantity: number }[];
  outputRows: { recipe_id: string; item_id: string; quantity: number }[];
  modifierRows: { recipe_id: string; description: string; bonus: number }[];
} {
  const ingredientRows = defs.flatMap((def, i) =>
    def.ingredients.map((ing) => ({
      recipe_id: recipeIds[i], item_id: null, tags: ing.tags, quantity: ing.quantity,
    })),
  );
  const outputRows = defs.flatMap((def, i) =>
    def.outputs
      .map((o) => ({
        recipe_id: recipeIds[i],
        item_id: outputItemIdByName.get(o.name) ?? null,
        quantity: o.quantity,
      }))
      .filter((o): o is { recipe_id: string; item_id: string; quantity: number } => o.item_id !== null),
  );
  const modifierRows = defs.flatMap((def, i) =>
    (def.modifiers ?? []).map((m) => ({ recipe_id: recipeIds[i], description: m.description, bonus: m.bonus })),
  );
  return { ingredientRows, outputRows, modifierRows };
}

/**
 * The three child-table writers + the rollback delete, injected so
 * seedRecipeChildren's rollback logic can be unit-tested without a supabase
 * double — see useImportStarterRecipes for the real (supabase-backed) ones.
 * PromiseLike (not Promise) because supabase-js's query builders are
 * thenables, not full Promise objects.
 */
export interface RecipeChildWriters {
  insertIngredients: (rows: { recipe_id: string; item_id: null; tags: string[]; quantity: number }[]) => PromiseLike<{ error: unknown }>;
  insertOutputs: (rows: { recipe_id: string; item_id: string; quantity: number }[]) => PromiseLike<{ error: unknown }>;
  insertModifiers: (rows: { recipe_id: string; description: string; bonus: number }[]) => PromiseLike<{ error: unknown }>;
  deleteRecipes: (ids: string[]) => PromiseLike<unknown>;
}

/**
 * Seeds the ingredients/outputs/modifiers for a batch of already-bulk-
 * inserted starter recipes. The recipe rows exist but aren't usable until
 * this completes — if any child-row batch fails, this rolls the whole import
 * back (deletes exactly the ids this call was given — never a pre-existing
 * recipe) instead of leaving N empty, un-completable recipe shells behind (a
 * retry would then skip re-importing them via the existingNames filter,
 * without ever seeding them). The three child tables all FK recipe_id ON
 * DELETE CASCADE, so deleting just the recipes also cleans up any child rows
 * an earlier, now-failed batch did manage to write. Exported for testing.
 */
export async function seedRecipeChildren(
  toImport: StarterRecipeDef[],
  recipeIds: string[],
  outputItemIdByName: Map<string, string>,
  writers: RecipeChildWriters,
): Promise<void> {
  try {
    if (recipeIds.length !== toImport.length) {
      throw new Error("Starter recipe import: recipe insert count mismatch");
    }

    const { ingredientRows, outputRows, modifierRows } =
      buildStarterRecipeChildRows(toImport, recipeIds, outputItemIdByName);

    if (ingredientRows.length > 0) {
      const { error } = await writers.insertIngredients(ingredientRows);
      if (error) throw error;
    }
    if (outputRows.length > 0) {
      const { error } = await writers.insertOutputs(outputRows);
      if (error) throw error;
    }
    if (modifierRows.length > 0) {
      const { error } = await writers.insertModifiers(modifierRows);
      if (error) throw error;
    }
  } catch (childErr) {
    if (recipeIds.length > 0) {
      try {
        await writers.deleteRecipes(recipeIds);
      } catch {
        // Best-effort cleanup — its own failure must not replace the real
        // error being (re)thrown below.
      }
    }
    throw childErr;
  }
}

/** Returns the number of recipes inserted (skips ones that already exist by name). */
export function useImportStarterRecipes() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();

  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { STARTER_RECIPES } = await import("@/data/starterRecipes");
      const { GEAR } = await import("@/data/gear");
      const { PROVISIONS } = await import("@/data/provisions");
      const user = getCurrentUser();
      const campaignId = campaign.activeCampaignId!;

      // 1. Ensure all output items exist in the vault (insert missing ones)
      const outputNames = [...new Set(STARTER_RECIPES.flatMap((r) => r.outputs.map((o) => o.name)))];
      const { data: existingItems } = await supabase
        .from("items")
        .select("id, name")
        .eq("user_id", user!.id)
        .in("name", outputNames);
      const existingByName = new Map((existingItems ?? []).map((i: { id: string; name: string }) => [i.name, i.id]));

      const missing = outputNames.filter((n) => !existingByName.has(n));
      if (missing.length > 0) {
        const toInsert = [...GEAR, ...PROVISIONS]
          .filter((g) => missing.includes(g.name))
          .map((g) => ({ curse_description: null, ...g, user_id: user!.id }));
        if (toInsert.length > 0) {
          const { data: inserted, error } = await supabase
            .from("items")
            .insert(toInsert)
            .select("id, name");
          if (error) throw error;
          (inserted ?? []).forEach((i: { id: string; name: string }) => existingByName.set(i.name, i.id));
        }
      }

      // 2. Skip recipes that already exist (by name + campaign)
      const { data: existingRecipes } = await supabase
        .from("crafting_recipes")
        .select("name")
        .eq("campaign_id", campaignId);
      const existingNames = new Set((existingRecipes ?? []).map((r: { name: string }) => r.name));

      const toImport = STARTER_RECIPES.filter((r) => !existingNames.has(r.name));
      if (toImport.length === 0) return 0;

      // 3. Bulk-insert the recipes, then the ingredients/outputs/modifiers in
      // three more batched inserts (buildStarterRecipeChildRows correlates
      // each child row back to its recipe by position — see that function's
      // doc comment for why not by name).
      const { data: inserted, error: rErr } = await supabase
        .from("crafting_recipes")
        .insert(toImport.map((def) => ({
          user_id: user!.id,
          campaign_id: campaignId,
          name: def.name,
          description: def.description,
          discipline: def.discipline,
          dc: def.dc,
          crafting_time: def.crafting_time,
          crafting_time_unit: def.crafting_time_unit,
          requires_proficiency: def.requires_proficiency,
          requires_tools: def.requires_tools,
          player_visible_to: [],
        })))
        .select("id, name");
      if (rErr) throw rErr;
      const insertedRecipes = (inserted ?? []) as { id: string; name: string }[];
      const recipeIds = insertedRecipes.map((r) => r.id);

      await seedRecipeChildren(toImport, recipeIds, existingByName, {
        insertIngredients: (rows) => supabase.from("crafting_recipe_ingredients").insert(rows),
        insertOutputs: (rows) => supabase.from("crafting_recipe_outputs").insert(rows),
        insertModifiers: (rows) => supabase.from("crafting_recipe_modifiers").insert(rows),
        deleteRecipes: (ids) => supabase.from("crafting_recipes").delete().in("id", ids),
      });

      return toImport.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [RECIPES_KEY] });
    },
  });
}
