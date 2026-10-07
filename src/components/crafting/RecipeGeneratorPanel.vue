<template>
  <GeneratorPanelShell
    v-model:open="ui.recipeGeneratorOpen"
    v-model:concept="concept"
    title="Recipe Generator"
    concept-placeholder="A smoky draught brewed from ember-moss and wyrm scale that lets the drinker breathe fire once, found only in the fire-scarred Ashen Reach…"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :error="genError"
    :can-generate="!pending && !creating"
    blank-to="/crafting/new"
    blank-label="New Blank Recipe"
    @generate="generateRecipe"
  >
    <template #constraints>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">Discipline</label>
        <AppSelect v-model="discipline" tone="filled" size="body" weight="normal" block>
          <option value="">Any</option>
          <option v-for="d in CRAFTING_DISCIPLINES" :key="d.id" :value="d.id">{{ d.label }}</option>
        </AppSelect>
      </div>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">Output item</label>
        <EntityCombobox
          v-model="outputItemId"
          :options="itemOptions"
          placeholder="Let the AI invent one"
        />
      </div>
    </template>

    <template #extra>
      <div
        v-if="pending"
        class="rounded-md border border-primary/30 bg-muted/40 px-3 py-3 space-y-3"
        data-testid="recipe-confirm"
      >
        <p class="text-label-lg font-semibold text-muted-foreground">THIS WILL CREATE</p>
        <ul class="space-y-2 text-body text-foreground">
          <li>
            <span class="font-semibold">Recipe: {{ pending.recipe.name }}</span>
            <span class="block text-caption text-muted-foreground">
              {{ disciplineLabel(pending.recipe.discipline) }}, DC {{ pending.recipe.dc }},
              {{ pending.recipe.crafting_time }} {{ pending.recipe.crafting_time_unit }}
            </span>
            <span class="block text-caption text-muted-foreground">
              {{ pending.recipe.ingredients.length }}
              {{ pending.recipe.ingredients.length === 1 ? "ingredient" : "ingredients" }}
              ({{ ingredientSummary }})<template v-if="pending.recipe.modifiers.length">,
                {{ pending.recipe.modifiers.length }}
                {{ pending.recipe.modifiers.length === 1 ? "modifier" : "modifiers" }}</template>
            </span>
          </li>
          <li>
            <span class="font-semibold">{{ describeOutputResolution(pending.resolution) }}</span>
            <span class="block text-caption text-muted-foreground">
              Output quantity: {{ pending.recipe.output.quantity }}
            </span>
          </li>
        </ul>
        <div class="flex gap-2">
          <AppButton
            variant="primary"
            size="md"
            class="flex-1"
            label="Create"
            :loading="creating"
            :disabled="creating"
            @click="createAll"
          />
          <AppButton
            variant="outline"
            size="md"
            class="flex-1"
            label="Back"
            :disabled="creating"
            @click="pending = null"
          />
        </div>
      </div>
    </template>
  </GeneratorPanelShell>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import AppButton from "@/components/common/AppButton.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useToast } from "@/composables/useToast";
import { useCreateItem } from "@/composables/items/useItems";
import { useItemIndex } from "@/composables/items/useItemIndex";
import {
  useCreateRecipe,
  useReplaceIngredients,
  useReplaceModifiers,
  useReplaceOutputs,
} from "@/composables/crafting/useCrafting";
import { useRecipeGeneration } from "@/ai/useRecipeGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { CRAFTING_DISCIPLINES } from "@/lib/crafting/disciplines";
import { isUuid } from "@/lib/library/contentIdentity";
import {
  describeOutputResolution,
  disciplineLabel,
  resolveRecipeOutput,
  type RecipeAiResult,
  type RecipeOutputResolution,
} from "@/lib/crafting/recipeAi";
import type { CraftingDiscipline } from "@/types/crafting.types";
import { wholeCredits } from "@edge-shared/credit-math.ts";

const ui = useUiStore();
const router = useRouter();
const campaign = useCampaignStore();
const toast = useToast();

const { mutateAsync: createItem } = useCreateItem();
const { mutateAsync: createRecipe } = useCreateRecipe();
const { mutateAsync: replaceIngredients } = useReplaceIngredients();
const { mutateAsync: replaceModifiers } = useReplaceModifiers();
const { mutateAsync: replaceOutputs } = useReplaceOutputs();
const {
  isGenerating,
  error: genError,
  completedEntityId,
  concept: genConcept,
  clearCompleted,
  generate,
} = useRecipeGeneration();

// Mounted on every DM page: only fetch the item catalogue once the panel opens.
const { data: items } = useItemIndex(() => ({ enabled: ui.recipeGeneratorOpen }));

const { canSpend } = useGenerationGate();
const { costOf } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => wholeCredits(costOf("recipe_generation") * textMultiplierFor(textProvider.value)),
);

const concept = ref("");
const discipline = ref<CraftingDiscipline | "">("");
const outputItemId = ref("");

interface PendingRecipe {
  recipe: RecipeAiResult;
  resolution: RecipeOutputResolution;
}
const pending = ref<PendingRecipe | null>(null);
const creating = ref(false);

const itemOptions = computed(() => (items.value ?? []).map((i) => ({ id: i.id, name: i.name })));
const pickedItem = computed(() => items.value?.find((i) => i.id === outputItemId.value) ?? null);

const ingredientSummary = computed(() =>
  (pending.value?.recipe.ingredients ?? [])
    .map((i) => `${i.quantity} x ${i.tags.join(" + ")}`)
    .join(", "),
);

function resolveOutput(recipe: RecipeAiResult): RecipeOutputResolution {
  const picked = pickedItem.value;
  if (picked) {
    return isUuid(picked.id)
      ? { kind: "campaign", item_id: picked.id, name: picked.name }
      : { kind: "library", library_item_id: picked.id, name: picked.name };
  }
  const all = items.value ?? [];
  return resolveRecipeOutput(
    recipe.output,
    all.filter((i) => isUuid(i.id)),
    all.filter((i) => !isUuid(i.id)),
  );
}

async function generateRecipe() {
  if (!canSpend(textCreditCost.value, textIsByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();
  pending.value = null;

  const result = await generate(concept.value.trim(), {
    discipline: discipline.value || undefined,
    outputName: pickedItem.value?.name,
  });
  if (!result) return;

  // Nothing is written yet: the DM sees what will be created first.
  pending.value = { recipe: result, resolution: resolveOutput(result) };
}

async function createAll() {
  const current = pending.value;
  if (!current || creating.value) return;
  creating.value = true;
  const { recipe, resolution } = current;

  let recipeId: string;
  let outputRef: { item_id: string | null; library_item_id: string | null };
  try {
    if (resolution.kind === "create") {
      const created = await createItem({
        name: resolution.draft.name,
        item_type: resolution.draft.item_type,
        subtype: null,
        rarity: resolution.draft.rarity,
        requires_attunement: false,
        attunement_requirements: null,
        weight: null,
        cost: null,
        damage_rolls: null,
        armor_class: null,
        properties: [],
        charges: null,
        recharge: null,
        spell_ids: [],
        description: resolution.draft.description ? toTiptapJson(resolution.draft.description) : "",
        source: "Grimoire:AI",
        tags: [],
        image_url: null,
        image_focal_point: null,
        curse_description: null,
        is_arcane_focus: false,
        ai_provenance: recipe.ai_provenance ?? null,
        campaign_id: campaign.activeCampaignId ?? null,
      });
      outputRef = { item_id: created.id, library_item_id: null };
    } else if (resolution.kind === "campaign") {
      outputRef = { item_id: resolution.item_id, library_item_id: null };
    } else {
      outputRef = { item_id: null, library_item_id: resolution.library_item_id };
    }

    const created = await createRecipe({
      name: recipe.name,
      description: recipe.description ? toTiptapJson(recipe.description) : "",
      discipline: recipe.discipline,
      dc: recipe.dc,
      crafting_time: recipe.crafting_time,
      crafting_time_unit: recipe.crafting_time_unit,
      requires_proficiency: recipe.requires_proficiency,
      requires_tools: recipe.requires_tools,
      player_visible_to: [],
      ai_provenance: recipe.ai_provenance ?? null,
    });
    recipeId = created.id;
  } catch (e) {
    creating.value = false;
    toast.error(toast.fromError(e));
    return;
  }

  // The recipe exists from here on. A failed child write must not strand the DM
  // on a silent half-recipe, so report it and still open the recipe to fix.
  try {
    await replaceOutputs({
      recipeId,
      outputs: [{ ...outputRef, quantity: recipe.output.quantity }],
    });
    await replaceIngredients({
      recipeId,
      ingredients: recipe.ingredients.map((i) => ({
        item_id: null,
        library_item_id: null,
        tags: i.tags,
        quantity: i.quantity,
      })),
    });
    await replaceModifiers({ recipeId, modifiers: recipe.modifiers });
  } catch (e) {
    toast.error(`The recipe was created but part of it could not be saved: ${toast.fromError(e)}. Check its outputs, ingredients and modifiers.`);
  }

  creating.value = false;
  pending.value = null;
  completedEntityId.value = recipeId;
  ui.recipeGeneratorOpen = false;
  router.push(`/crafting/${recipeId}`);
}
</script>
