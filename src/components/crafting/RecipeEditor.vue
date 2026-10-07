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
              ? 'Requires proficiency, click to allow unskilled attempts'
              : 'Unskilled attempts allowed, click to require proficiency'
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
              ? 'Requires physical tools, click to allow without tools'
              : 'Attemptable without tools (disadvantage), click to require them'
          "
          @click="form.requires_tools = !form.requires_tools"
        />
      </template>
    </EntityEditorActionBar>

    <DraftConflictNotice :fields="conflictLabels" :on-discard="discardEdits" />

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
          <span class="text-label-lg text-muted-foreground">+</span>
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
import { ref, computed } from "vue";
import { IconAdd, IconDelete, IconLock, IconTool } from '@/lib/icons';
import DraftConflictNotice from "@/components/common/DraftConflictNotice.vue";
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
} from "@/lib/crafting/disciplines";
import { useRecordDraft, cloneDraftValue } from "@/composables/useRecordDraft";
import { useUiStore } from "@/stores/ui";
import { markEdited } from "@/ai/provenance";
import { useItemIndex } from "@/composables/items/useItemIndex";
import { inventoryItemRef, itemRefColumns, sameItemRef } from "@/lib/itemRef";
import { useStoredItemRefs } from "@/composables/items/useStoredItemRefs";
import {
  useCreateRecipe,
  useUpdateRecipe,
  useReplaceIngredients,
  useReplaceModifiers,
  useReplaceOutputs,
  useRecipeIngredients,
  useRecipeModifiers,
  useRecipeOutputs,
} from "@/composables/crafting/useCrafting";
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

const { data: allItems } = useItemIndex();

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

// Form state. One draft for the recipe row and one for each child list (they
// load as separate queries). Each takes fresh server data into what the user
// has not touched, and the save writes only what changed (#946).
interface RecipeDraft {
  name: string;
  description: string;
  discipline: CraftingDiscipline;
  dc: number;
  crafting_time: number;
  crafting_time_unit: "minutes" | "hours" | "days";
  requires_proficiency: boolean;
  requires_tools: boolean;
  player_visible_to: string[];
}

type IngredientRow = { item_id: string | null; library_item_id: string | null; tags: string[] | null; quantity: number };
type OutputRow = { item_id: string | null; library_item_id: string | null; quantity: number };
type ModifierRow = { description: string; bonus: number };

/** A child list as one draft field, so it merges and compares as a unit. */
interface ListDraft<Row> {
  rows: Row[];
}
interface ChildSource<Row> {
  id: string;
  rows: Row[];
}

const {
  draft: form,
  conflicts: recipeConflicts,
  changes: recipeChanges,
  commit: commitRecipe,
  reset: resetRecipe,
} = useRecordDraft<CraftingRecipe, RecipeDraft>({
  source: () => props.recipe,
  identity: (row) => row.id,
  toDraft: (r) =>
    r
      ? {
          name: r.name,
          description: r.description,
          discipline: r.discipline,
          dc: r.dc,
          crafting_time: r.crafting_time,
          crafting_time_unit: r.crafting_time_unit,
          requires_proficiency: r.requires_proficiency,
          requires_tools: r.requires_tools,
          player_visible_to: [...r.player_visible_to],
        }
      : {
          name: "",
          description: "",
          discipline: (ui.workshopActiveTab !== "all" ? ui.workshopActiveTab : "smithing") as CraftingDiscipline,
          dc: 10,
          crafting_time: 1,
          crafting_time_unit: "days",
          requires_proficiency: false,
          requires_tools: false,
          player_visible_to: [],
        },
});

/** The recipe columns. Pure: also run over the server copy. */
function buildRecipe(d: RecipeDraft): RecipeDraft {
  return { ...d, player_visible_to: [...d.player_visible_to] };
}

function useChildList<Row, Server extends Row>(data: () => Server[] | undefined, pick: (server: Server) => Row) {
  const handle = useRecordDraft<ChildSource<Server>, ListDraft<Row>>({
    source: () => {
      const rows = data();
      return rows && recipeId.value ? { id: recipeId.value, rows } : null;
    },
    identity: (row) => row.id,
    toDraft: (row) => ({ rows: (row?.rows ?? []).map(pick) }),
  });
  const rows = computed(() => handle.draft.rows);
  return { ...handle, rows };
}

const ingredientList = useChildList(
  () => existingIngredients.value,
  (i): IngredientRow => ({ item_id: i.item_id, library_item_id: i.library_item_id, tags: i.tags ? [...i.tags] : null, quantity: i.quantity }),
);
const modifierList = useChildList(
  () => existingModifiers.value,
  (m): ModifierRow => ({ description: m.description, bonus: m.bonus }),
);
const outputList = useChildList(
  () => existingOutputs.value,
  (o): OutputRow => ({ item_id: o.item_id, library_item_id: o.library_item_id, quantity: o.quantity }),
);
const ingredients = ingredientList.rows;
const modifiers = modifierList.rows;
const outputs = outputList.rows;

const CONFLICT_LABELS: Record<keyof RecipeDraft, string> = {
  name: "Name",
  description: "Description",
  discipline: "Discipline",
  dc: "Crafting DC",
  crafting_time: "Crafting time",
  crafting_time_unit: "Crafting time",
  requires_proficiency: "Requires proficiency",
  requires_tools: "Requires tools",
  player_visible_to: "Visible to",
};

const conflictLabels = computed(() => [
  ...new Set([
    ...recipeConflicts.value.map((key) => CONFLICT_LABELS[key]),
    ...(outputList.conflicts.value.length > 0 ? ["Outputs"] : []),
    ...(ingredientList.conflicts.value.length > 0 ? ["Ingredients"] : []),
    ...(modifierList.conflicts.value.length > 0 ? ["Conditional modifiers"] : []),
  ]),
]);

function discardEdits() {
  resetRecipe();
  ingredientList.reset();
  modifierList.reset();
  outputList.reset();
}

const activeDiscipline = computed(() => getDiscipline(form.discipline));

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

// The picker above browses `items`; a recipe's saved references resolve whatever
// the table's edition or books are now (#961).
const { find: findStoredItem } = useStoredItemRefs(
  () => [...outputs.value, ...ingredients.value].map(inventoryItemRef),
);

function itemById(id: string | null) {
  return id ? findStoredItem(id) : undefined;
}

function addOutput(itemId: string) {
  outputSearch.value = "";
  // A vault (uuid) id and a library (text) id route to different columns —
  // itemRefColumns is the one place that decides which (#819). Referencing
  // shared content directly beats cloning it into the vault first.
  const ref = itemRefColumns(itemId);
  const existing = outputs.value.find((o) => sameItemRef(o, ref));
  if (existing) {
    existing.quantity += 1;
  } else {
    outputs.value.push({ ...ref, quantity: 1 });
  }
}

function addIngredient(itemId: string) {
  ingredientSearch.value = "";
  const ref = itemRefColumns(itemId);
  const existing = ingredients.value.find((i) => sameItemRef(i, ref));
  if (existing) {
    existing.quantity += 1;
  } else {
    ingredients.value.push({ ...ref, tags: null, quantity: 1 });
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
    ingredients.value.push({ item_id: null, library_item_id: null, tags, quantity: 1 });
  }
  tagIngredientInput.value = "";
}

function removeIngredient(idx: number) {
  ingredients.value.splice(idx, 1);
}

async function save() {
  if (!form.name.trim() || outputs.value.length === 0) return;

  let id: string;
  if (isNew.value) {
    const created = await createRecipe(buildRecipe(form));
    id = created.id;
    await replaceIngredients({ recipeId: id, ingredients: cloneDraftValue(ingredients.value) });
    await replaceModifiers({ recipeId: id, modifiers: cloneDraftValue(modifiers.value) });
    await replaceOutputs({ recipeId: id, outputs: cloneDraftValue(outputs.value) });
  } else {
    id = recipeId.value!;
    // Only what changed is written: a list or column the user never touched is
    // left alone, so a stale form cannot revert it.
    const recipeColumns = recipeChanges(buildRecipe);
    const ingredientsChanged = ingredientList.changes((d) => ({ rows: d.rows })).rows;
    const modifiersChanged = modifierList.changes((d) => ({ rows: d.rows })).rows;
    const outputsChanged = outputList.changes((d) => ({ rows: d.rows })).rows;
    // Material edit (#606): visibility alone is not a content change.
    const contentChanged =
      Object.keys(recipeColumns).some((key) => key !== "player_visible_to") || !!ingredientsChanged || !!modifiersChanged || !!outputsChanged;
    const update =
      contentChanged && props.recipe?.ai_provenance
        ? { ...recipeColumns, ai_provenance: markEdited(props.recipe.ai_provenance) }
        : recipeColumns;
    if (Object.keys(update).length > 0) {
      await updateRecipe({ id, update });
      commitRecipe();
    }
    if (ingredientsChanged) {
      await replaceIngredients({ recipeId: id, ingredients: cloneDraftValue(ingredients.value) });
      ingredientList.commit();
    }
    if (modifiersChanged) {
      await replaceModifiers({ recipeId: id, modifiers: cloneDraftValue(modifiers.value) });
      modifierList.commit();
    }
    if (outputsChanged) {
      await replaceOutputs({ recipeId: id, outputs: cloneDraftValue(outputs.value) });
      outputList.commit();
    }
  }

  emit("saved", id);
}
</script>
