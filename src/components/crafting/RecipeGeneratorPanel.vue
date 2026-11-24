<template>
  <GeneratorPanelShell
    v-model:open="generatorsUi.recipeGeneratorOpen"
    v-model:concept="concept"
    title="Recipe Generator"
    concept-placeholder="A smoky draught brewed from ember-moss and wyrm scale that lets the drinker breathe fire once, found only in the fire-scarred Ashen Reach…"
    :credits="textCreditCost"
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
              {{ craftingTimeText(pending.recipe.crafting_time, pending.recipe.crafting_time_unit) }}
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
import { useGeneratorUiStore } from "@/stores/ui/generators";
import GeneratorPanelShell from "@/components/common/ai/GeneratorPanelShell.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useRecipeQuote } from "@/composables/ai/quotes/recipeQuote";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useToast } from "@/composables/useToast";
import { useItemIndex } from "@/composables/items/useItemIndex";
import {
  resolveRecipeOutputFor,
  useGenerateRecipe,
  type RecipeDraft,
} from "@/composables/crafting/useGenerateRecipe";
import { CRAFTING_DISCIPLINES } from "@/lib/crafting/disciplines";
import { describeOutputResolution, disciplineLabel } from "@/lib/crafting/recipeAi";
import { craftingTimeText } from "@/lib/crafting/craftingTime";
import type { CraftingDiscipline } from "@/types/crafting.types";

const generatorsUi = useGeneratorUiStore();
const router = useRouter();
const toast = useToast();

const { generation, saveRecipe } = useGenerateRecipe();
const {
  isGenerating,
  error: genError,
  completedEntityId,
  concept: genConcept,
  clearCompleted,
  generate,
} = generation;

// Mounted on every DM page: only fetch the item catalogue once the panel opens.
const { data: items } = useItemIndex(() => ({ enabled: generatorsUi.recipeGeneratorOpen }));

const { canSpend } = useGenerationGate();
// The price comes from the quote Ask Grimoire reads too, so the page and the panel cannot disagree.
const quote = useRecipeQuote();
const textCreditCost = computed(() => quote().total);

const concept = ref("");
const discipline = ref<CraftingDiscipline | "">("");
const outputItemId = ref("");

const pending = ref<RecipeDraft | null>(null);
const creating = ref(false);

const itemOptions = computed(() => (items.value ?? []).map((i) => ({ id: i.id, name: i.name })));
const pickedItem = computed(() => items.value?.find((i) => i.id === outputItemId.value) ?? null);

const ingredientSummary = computed(() =>
  (pending.value?.recipe.ingredients ?? [])
    .map((i) => `${i.quantity} x ${i.tags.join(" + ")}`)
    .join(", "),
);

async function generateRecipe() {
  if (!canSpend(textCreditCost.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();
  pending.value = null;

  const result = await generate(concept.value.trim(), {
    discipline: discipline.value || undefined,
    outputName: pickedItem.value?.name,
  });
  if (!result) return;

  // Nothing is written yet: the DM sees what will be created first.
  pending.value = { recipe: result, resolution: resolveRecipeOutputFor(result, items.value ?? [], pickedItem.value) };
}

async function createAll() {
  const current = pending.value;
  if (!current || creating.value) return;
  creating.value = true;

  let saved: Awaited<ReturnType<typeof saveRecipe>>;
  try {
    saved = await saveRecipe(current);
  } catch (e) {
    creating.value = false;
    toast.error(toast.fromError(e));
    return;
  }

  // The recipe exists from here on. A failed child write must not strand the DM
  // on a silent half-recipe, so report it and still open the recipe to fix.
  if (saved.partsFailure) {
    toast.error(`The recipe was created but part of it could not be saved: ${toast.fromError(saved.partsFailure)}. Check its outputs, ingredients and modifiers.`);
  }

  creating.value = false;
  pending.value = null;
  completedEntityId.value = saved.id;
  generatorsUi.recipeGeneratorOpen = false;
  router.push(`/crafting/${saved.id}`);
}
</script>
