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
import type { PartyInventoryInsert } from "@/types/inventory.types";
import { usePromptedRoll } from "@/composables/usePromptedRoll";

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

export function useCraftingRecipe(id: string) {
  return useQuery({
    queryKey: [RECIPES_KEY, id],
    queryFn: () => fetchRecipe(id),
    enabled: !!id,
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
      /** party_inventory item IDs the player is slotting in (in ingredient order) */
      ingredientInventoryIds: string[];
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
        ingredientInventoryIds,
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

      const outcome =
        diff >= 0 ? "success" : diff <= -5 ? "ruin" : "fail";

      // 2. Consume all ingredients
      for (const invId of ingredientInventoryIds) {
        const { error } = await supabase
          .from("party_inventory")
          .delete()
          .eq("id", invId);
        if (error) throw error;
      }

      const uid = getCurrentUser()!.id;

      if (outcome === "success") {
        // 3a. Add all crafted outputs to inventory
        for (const output of outputs) {
          const insert: PartyInventoryInsert = {
            campaign_id: recipe.campaign_id,
            item_id: output.item_id,
            name: output.item_id ? (outputItemNames[output.item_id] ?? "") : "",
            quantity: output.quantity,
            carried_by: partyMemberId,
            location: "backpack",
            slot: null,
            is_container: false,
            container_id: null,
            is_attuned: false,
            is_equipped: false,
            notes: null,
            is_ruined: false,
          };
          const { error } = await supabase.from("party_inventory").insert({ ...insert, user_id: uid });
          if (error) throw error;
        }
      } else if (outcome === "ruin") {
        // 3b. Re-add primary ingredient as ruined
        const { error } = await supabase.from("party_inventory").insert({
          campaign_id: primaryInventoryItem.campaign_id,
          user_id: uid,
          item_id: primaryInventoryItem.item_id,
          name: `Ruined: ${primaryInventoryItem.name}`,
          quantity: 1,
          carried_by: primaryInventoryItem.carried_by,
          location: "backpack",
          slot: null,
          is_container: false,
          container_id: null,
          is_attuned: false,
          is_equipped: false,
          notes: "Ruined during a failed crafting attempt.",
          is_ruined: true,
        });
        if (error) throw error;
      }

      return { roll, roll2, total, diff, outcome, hasDisadvantage: !hasTools };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["party-inventory"] });
    },
  });
}


// ── Starter recipe import ────────────────────────────────────────────────────

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

      // 3. Insert each recipe + its ingredients + outputs + modifiers
      for (const def of toImport) {
        const { data: recipe, error: rErr } = await supabase
          .from("crafting_recipes")
          .insert({
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
          })
          .select("id")
          .single();
        if (rErr) throw rErr;

        const recipeId: string = recipe.id;

        if (def.ingredients.length > 0) {
          const { error } = await supabase
            .from("crafting_recipe_ingredients")
            .insert(def.ingredients.map((i) => ({ recipe_id: recipeId, item_id: null, tags: i.tags, quantity: i.quantity })));
          if (error) throw error;
        }

        const outputRows = def.outputs
          .map((o) => ({ recipe_id: recipeId, item_id: existingByName.get(o.name) ?? null, quantity: o.quantity }))
          .filter((o) => o.item_id !== null);
        if (outputRows.length > 0) {
          const { error } = await supabase.from("crafting_recipe_outputs").insert(outputRows);
          if (error) throw error;
        }

        if (def.modifiers && def.modifiers.length > 0) {
          const { error } = await supabase
            .from("crafting_recipe_modifiers")
            .insert(def.modifiers.map((m) => ({ recipe_id: recipeId, description: m.description, bonus: m.bonus })));
          if (error) throw error;
        }
      }

      return toImport.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [RECIPES_KEY] });
    },
  });
}
