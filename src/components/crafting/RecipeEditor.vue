<template>
  <div class="flex flex-col gap-6 max-w-2xl">
    <!-- Header row -->
    <EntityEditorActionBar
      :title="form.name"
      title-placeholder="Recipe name…"
      :exists="!isNew"
      :can-save="!!form.name.trim() && outputs.length > 0"
      :saving="saving"
      :visible-to="form.player_visible_to"
      @update:title="form.name = $event"
      @update:visible-to="form.player_visible_to = $event"
      @save="save"
    >
      <template #controls>
        <AppButton
          variant="subtle"
          size="icon-sm"
          tone="danger"
          :active="form.requires_proficiency"
          :icon="IconLock"
          :tooltip="
            form.requires_proficiency
              ? 'Requires proficiency — click to allow unskilled attempts'
              : 'Unskilled attempts allowed — click to require proficiency'
          "
          @click="form.requires_proficiency = !form.requires_proficiency"
        />

        <AppButton
          variant="subtle"
          size="icon-sm"
          tone="danger"
          :active="form.requires_tools"
          :icon="IconTool"
          :tooltip="
            form.requires_tools
              ? 'Requires physical tools — click to allow without tools'
              : 'Attemptable without tools (disadvantage) — click to require them'
          "
          @click="form.requires_tools = !form.requires_tools"
        />
      </template>
    </EntityEditorActionBar>

    <!-- Core fields -->
    <div class="grid grid-cols-2 gap-4">
      <!-- Discipline -->
      <div>
        <label
          class="block text-label-lg font-semibold text-muted-foreground mb-1"
          >DISCIPLINE</label
        >
        <div class="relative">
          <component
            :is="activeDiscipline.icon"
            class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
          />
          <select
            v-model="form.discipline"
            class="w-full bg-muted border border-border rounded-md pl-9 pr-3 py-2 font-fell text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option v-for="d in CRAFTING_DISCIPLINES" :key="d.id" :value="d.id">
              {{ d.label }}
            </option>
          </select>
        </div>
      </div>

      <!-- DC -->
      <div>
        <label
          class="block text-label-lg font-semibold text-muted-foreground mb-1"
          >CRAFTING DC</label
        >
        <AppInput
          v-model.number="form.dc"
          type="number"
          min="1"
          max="30"
          tone="filled"
          size="body"
        />
      </div>

      <!-- Time -->
      <div>
        <label
          class="block text-label-lg font-semibold text-muted-foreground mb-1"
          >CRAFTING TIME</label
        >
        <div class="flex gap-2">
          <AppInput
            v-model.number="form.crafting_time"
            type="number"
            min="1"
            tone="filled"
            size="body"
            :block="false"
            class="flex-1 min-w-0"
          />
          <AppSelect
            v-model="form.crafting_time_unit"
            tone="filled"
            size="body"
            weight="normal"
          >
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </AppSelect>
        </div>
      </div>
    </div>

    <!-- Description -->
    <div>
      <label
        class="block text-label-lg font-semibold text-muted-foreground mb-1"
        >DESCRIPTION</label
      >
      <RichTextEditor
        v-model="form.description"
        placeholder="How is this item crafted? Any special requirements or lore…"
        size="md"
      />
    </div>

    <!-- Outputs -->
    <RecipeOutputsPanel
      :outputs="outputs"
      :filtered-items="filteredOutputItems"
      :search="outputSearch"
      :item-by-id="itemById"
      @add="addOutput"
      @remove="outputs.splice($event, 1)"
      @update:search="outputSearch = $event"
    />

    <!-- Ingredients -->
    <RecipeIngredientsPanel
      :ingredients="ingredients"
      :filtered-items="filteredIngredientItems"
      :item-search="ingredientSearch"
      :tag-input="tagIngredientInput"
      :item-by-id="itemById"
      @add-item="addIngredient"
      @add-tag="addTagIngredient"
      @remove="removeIngredient($event)"
      @update:item-search="ingredientSearch = $event"
      @update:tag-input="tagIngredientInput = $event"
    />

    <!-- Conditional modifiers -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div
        class="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between"
      >
        <span
          class="text-label-lg font-semibold text-muted-foreground"
          >CONDITIONAL MODIFIERS</span
        >
        <span class="text-caption text-muted-foreground italic">
          Workshop and ruined ingredients are already provided</span
        >
      </div>
      <div class="p-4 flex flex-col gap-2">
        <div
          v-for="(mod, idx) in modifiers"
          :key="idx"
          class="flex items-center gap-2"
        >
          <AppInput
            v-model="mod.description"
            placeholder="e.g. Full forge available"
            tone="filled"
            size="body"
            :block="false"
            class="flex-1"
          />
          <span class="font-cinzel text-xs text-muted-foreground">+</span>
          <AppInput
            v-model.number="mod.bonus"
            type="number"
            min="1"
            max="20"
            tone="filled"
            size="body-xs"
            align="center"
            :block="false"
            class="w-14"
          />
          <AppButton
            variant="ghost"
            tone="danger"
            size="icon-xs"
            :icon="IconDelete"
            @click="modifiers.splice(idx, 1)"
          />
        </div>

        <AppButton
          variant="ghost"
          size="inline"
          label="Add modifier"
          :icon="IconAdd"
          class="mt-1"
          @click="modifiers.push({ description: '', bonus: 2 })"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { IconAdd, IconDelete, IconLock, IconTool } from '@/lib/icons';
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import EntityEditorActionBar from "@/components/common/EntityEditorActionBar.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import RecipeOutputsPanel from "@/components/crafting/RecipeOutputsPanel.vue";
import RecipeIngredientsPanel from "@/components/crafting/RecipeIngredientsPanel.vue";
import {
  CRAFTING_DISCIPLINES,
  getDiscipline,
} from "@/lib/crafting-disciplines";
import { useUiStore } from "@/stores/ui";
import { useItems, useEnsureOwnedItem } from "@/composables/useItems";
import {
  useCreateRecipe,
  useUpdateRecipe,
  useReplaceIngredients,
  useReplaceModifiers,
  useReplaceOutputs,
  useRecipeIngredients,
  useRecipeModifiers,
  useRecipeOutputs,
} from "@/composables/useCrafting";
import type {
  CraftingRecipe,
  CraftingDiscipline,
} from "@/types/crafting.types";

const props = defineProps<{
  recipe?: CraftingRecipe;
}>();

const emit = defineEmits<{ saved: [id: string] }>();

const isNew = computed(() => !props.recipe);
const recipeId = computed(() => props.recipe?.id);

const ui = useUiStore();

const { data: allItems } = useItems();
const { ensureOwnedItem } = useEnsureOwnedItem();

// Load existing sub-resources when editing — pass the computed so the query
// re-enables reactively once the recipe prop resolves after a hard refresh.
const recipeIdStr = computed(() => recipeId.value ?? "");
const { data: existingIngredients } = useRecipeIngredients(recipeIdStr);
const { data: existingModifiers } = useRecipeModifiers(recipeIdStr);
const { data: existingOutputs } = useRecipeOutputs(recipeIdStr);

const { mutateAsync: createRecipe, isPending: isCreating } = useCreateRecipe();
const { mutateAsync: updateRecipe, isPending: isUpdating } = useUpdateRecipe();
const { mutateAsync: replaceIngredients } = useReplaceIngredients();
const { mutateAsync: replaceModifiers } = useReplaceModifiers();
const { mutateAsync: replaceOutputs } = useReplaceOutputs();

const saving = computed(() => isCreating.value || isUpdating.value);

// Form state
const form = ref({
  name: props.recipe?.name ?? "",
  description: props.recipe?.description ?? "",
  discipline: (props.recipe?.discipline ??
    (ui.workshopActiveTab !== "all"
      ? ui.workshopActiveTab
      : "smithing")) as CraftingDiscipline,
  dc: props.recipe?.dc ?? 10,
  crafting_time: props.recipe?.crafting_time ?? 1,
  crafting_time_unit: (props.recipe?.crafting_time_unit ?? "days") as
    | "minutes"
    | "hours"
    | "days",
  requires_proficiency: props.recipe?.requires_proficiency ?? false,
  requires_tools: props.recipe?.requires_tools ?? false,
  player_visible_to: props.recipe?.player_visible_to ?? [],
});

const ingredients = ref<
  { item_id: string | null; tags: string[] | null; quantity: number }[]
>([]);
const modifiers = ref<{ description: string; bonus: number }[]>([]);
const outputs = ref<{ item_id: string; quantity: number }[]>([]);

watch(
  () => props.recipe,
  (r) => {
    if (r) {
      form.value = {
        name: r.name,
        description: r.description,
        discipline: r.discipline,
        dc: r.dc,
        crafting_time: r.crafting_time,
        crafting_time_unit: r.crafting_time_unit,
        requires_proficiency: r.requires_proficiency,
        requires_tools: r.requires_tools,
        player_visible_to: r.player_visible_to,
      };
    }
  },
  { immediate: true },
);

// Populate sub-resource refs when fetched data arrives
watch(
  existingIngredients,
  (data) => {
    if (data && ingredients.value.length === 0) {
      ingredients.value = data.map((i) => ({
        item_id: i.item_id,
        tags: i.tags,
        quantity: i.quantity,
      }));
    }
  },
  { immediate: true },
);

watch(
  existingModifiers,
  (data) => {
    if (data && modifiers.value.length === 0) {
      modifiers.value = data.map((m) => ({
        description: m.description,
        bonus: m.bonus,
      }));
    }
  },
  { immediate: true },
);

watch(
  existingOutputs,
  (data) => {
    if (data && outputs.value.length === 0) {
      outputs.value = data.map((o) => ({
        item_id: o.item_id,
        quantity: o.quantity,
      }));
    }
  },
  { immediate: true },
);

const activeDiscipline = computed(() => getDiscipline(form.value.discipline));

// Item search
const outputSearch = ref("");
const ingredientSearch = ref("");
const tagIngredientInput = ref("");

const items = computed(() => allItems.value ?? []);

const filteredOutputItems = computed(() =>
  items.value
    .filter((i) => matchesSearch(i.name, outputSearch.value))
    .slice(0, 20),
);

const filteredIngredientItems = computed(() =>
  items.value
    .filter((i) => matchesSearch(i.name, ingredientSearch.value))
    .slice(0, 20),
);

// Split query on spaces, keeping quoted phrases together. All tokens must match.
function matchesSearch(name: string, query: string): boolean {
  const lower = name.toLowerCase();
  const tokens: string[] = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null)
    tokens.push((m[1] ?? m[2]).toLowerCase());
  return tokens.every((t) => lower.includes(t));
}

function itemById(id: string) {
  return items.value.find((i) => i.id === id);
}

async function addOutput(itemId: string) {
  const picked = itemById(itemId);
  if (!picked) return;
  outputSearch.value = "";
  // Resolve the owned (uuid) id BEFORE it enters the outputs array, so a Save
  // that fires during the clone can never persist an srd slug into the
  // crafting_recipe_outputs.item_id uuid FK.
  const owned = await ensureOwnedItem(picked);
  const existing = outputs.value.find((o) => o.item_id === owned.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    outputs.value.push({ item_id: owned.id, quantity: 1 });
  }
}

async function addIngredient(itemId: string) {
  const picked = itemById(itemId);
  if (!picked) return;
  ingredientSearch.value = "";
  const owned = await ensureOwnedItem(picked);
  const existing = ingredients.value.find((i) => i.item_id === owned.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    ingredients.value.push({ item_id: owned.id, tags: null, quantity: 1 });
  }
}

function addTagIngredient() {
  const raw = tagIngredientInput.value.trim();
  if (!raw) return;
  const tags = raw
    .split(/[,+]/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length === 0) return;
  const key = tags.join(",");
  const existing = ingredients.value.find(
    (i) => i.tags !== null && i.tags.join(",") === key,
  );
  if (existing) {
    existing.quantity += 1;
  } else {
    ingredients.value.push({ item_id: null, tags, quantity: 1 });
  }
  tagIngredientInput.value = "";
}

function removeIngredient(idx: number) {
  ingredients.value.splice(idx, 1);
}

async function save() {
  if (!form.value.name.trim() || outputs.value.length === 0) return;

  let id: string;
  if (isNew.value) {
    const created = await createRecipe(form.value);
    id = created.id;
  } else {
    const updated = await updateRecipe({
      id: recipeId.value!,
      update: form.value,
    });
    id = updated.id;
  }

  await replaceIngredients({ recipeId: id, ingredients: ingredients.value });
  await replaceModifiers({ recipeId: id, modifiers: modifiers.value });
  await replaceOutputs({ recipeId: id, outputs: outputs.value });

  emit("saved", id);
}
</script>
