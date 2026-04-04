import { computed, type Ref } from "vue";
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
  CraftingRecipeGrant,
  CraftingAttemptResult,
} from "@/types/crafting.types";
import type { PartyInventoryInsert } from "@/types/inventory.types";

const RECIPES_KEY    = "crafting-recipes";
const INGREDIENTS_KEY = "crafting-ingredients";
const MODIFIERS_KEY  = "crafting-modifiers";
const OUTPUTS_KEY    = "crafting-outputs";
const GRANTS_KEY     = "crafting-grants";

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

async function fetchGrants(recipeId: string): Promise<CraftingRecipeGrant[]> {
  const { data, error } = await supabase
    .from("crafting_recipe_grants")
    .select("*")
    .eq("recipe_id", recipeId);
  if (error) throw error;
  return data as CraftingRecipeGrant[];
}

/** Returns recipe IDs granted to a specific party member */
async function fetchPlayerGrantedRecipeIds(partyMemberId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("crafting_recipe_grants")
    .select("recipe_id")
    .eq("party_member_id", partyMemberId);
  if (error) throw error;
  return (data ?? []).map((g: { recipe_id: string }) => g.recipe_id);
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

async function grantRecipe(recipeId: string, partyMemberId: string): Promise<void> {
  const { error } = await supabase
    .from("crafting_recipe_grants")
    .insert({ recipe_id: recipeId, party_member_id: partyMemberId });
  if (error && error.code !== "23505") throw error; // ignore duplicate
}

async function revokeGrant(recipeId: string, partyMemberId: string): Promise<void> {
  const { error } = await supabase
    .from("crafting_recipe_grants")
    .delete()
    .eq("recipe_id", recipeId)
    .eq("party_member_id", partyMemberId);
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

export function useRecipeIngredients(recipeId: string) {
  return useQuery({
    queryKey: computed(() => [INGREDIENTS_KEY, recipeId]),
    queryFn: () => fetchIngredients(recipeId),
    enabled: !!recipeId,
  });
}

export function useRecipeOutputs(recipeId: string) {
  return useQuery({
    queryKey: computed(() => [OUTPUTS_KEY, recipeId]),
    queryFn: () => fetchOutputs(recipeId),
    enabled: !!recipeId,
  });
}

export function useRecipeModifiers(recipeId: string) {
  return useQuery({
    queryKey: computed(() => [MODIFIERS_KEY, recipeId]),
    queryFn: () => fetchModifiers(recipeId),
    enabled: !!recipeId,
  });
}

export function useRecipeGrants(recipeId: string) {
  return useQuery({
    queryKey: computed(() => [GRANTS_KEY, recipeId]),
    queryFn: () => fetchGrants(recipeId),
    enabled: !!recipeId,
  });
}

const PLAYER_GRANTS_KEY = "crafting-player-grants";

export function usePlayerRecipeGrants(partyMemberId: Ref<string | null>) {
  return useQuery({
    queryKey: computed(() => [PLAYER_GRANTS_KEY, partyMemberId.value]),
    queryFn: () => fetchPlayerGrantedRecipeIds(partyMemberId.value!),
    enabled: () => !!partyMemberId.value,
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

export function useGrantRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, partyMemberId }: { recipeId: string; partyMemberId: string }) =>
      grantRecipe(recipeId, partyMemberId),
    onSuccess: (_data, { recipeId }) =>
      queryClient.invalidateQueries({ queryKey: [GRANTS_KEY, recipeId] }),
  });
}

export function useRevokeGrant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, partyMemberId }: { recipeId: string; partyMemberId: string }) =>
      revokeGrant(recipeId, partyMemberId),
    onSuccess: (_data, { recipeId }) =>
      queryClient.invalidateQueries({ queryKey: [GRANTS_KEY, recipeId] }),
  });
}

// ── Crafting attempt ─────────────────────────────────────────────────────────

export function useAttemptCraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      recipe: CraftingRecipe;
      /** Output items to add to inventory on success */
      outputs: CraftingOutput[];
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
        ingredientInventoryIds,
        primaryInventoryItem,
        modifierBonuses,
        abilityMod,
        profBonus,
        hasTools,
        partyMemberId,
      } = params;

      // 1. Roll — disadvantage if no physical tool
      const roll1 = Math.ceil(Math.random() * 20);
      const roll2 = hasTools ? undefined : Math.ceil(Math.random() * 20);
      const roll = hasTools ? roll1 : Math.min(roll1, roll2!);

      const modSum = modifierBonuses.reduce((a, b) => a + b, 0);
      const total = roll + abilityMod + profBonus + modSum;
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

      if (outcome === "success") {
        // 3a. Add all crafted outputs to inventory
        for (const output of outputs) {
          const insert: PartyInventoryInsert = {
            campaign_id: recipe.campaign_id,
            item_id: output.item_id,
            name: "",
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
          const { error } = await supabase.from("party_inventory").insert(insert);
          if (error) throw error;
        }
      } else if (outcome === "ruin") {
        // 3b. Re-add primary ingredient as ruined
        const { error } = await supabase.from("party_inventory").insert({
          campaign_id: primaryInventoryItem.campaign_id,
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
