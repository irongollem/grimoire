<template>
  <div class="flex flex-col gap-6 max-w-2xl">
    <!-- Header row -->
    <EntityEditorActionBar
      :title="form.name"
      title-placeholder="Recipe name…"
      :exists="!isNew"
      :can-save="canSave"
      :saving="saving"
      :error="saveError"
      :autosave="autosaveBar"
      :visible-to="form.player_visible_to"
      @update:title="form.name = $event"
      @update:visible-to="form.player_visible_to = $event"
      @save="save"
      @cancel="onDone"
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

        <AppButton
          variant="subtle"
          size="icon-sm"
          :active="form.discoverable"
          :icon="IconSearch"
          :tooltip="
            form.discoverable
              ? 'Discoverable: a player can find it by experimenting, click to keep it secret'
              : 'Secret: only the players you share it with know it, click to make it discoverable'
          "
          @click="form.discoverable = !form.discoverable"
        />
      </template>
    </EntityEditorActionBar>

    <DraftConflictNotice :fields="conflictLabels" :on-discard="resetRecipe" />

    <!-- Core fields -->
    <div class="grid grid-cols-2 gap-4">
      <!-- Discipline -->
      <div>
        <label
          class="block text-label-lg font-semibold text-muted-foreground mb-1"
          >DISCIPLINE</label
        >
        <!-- AppSelect has no leading-icon slot, so the discipline icon sits beside it. -->
        <div class="flex items-center gap-2">
          <component :is="activeDiscipline.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
          <AppSelect v-model="form.discipline" tone="filled" size="body" weight="normal" class="min-w-0 flex-1">
            <option v-for="d in CRAFTING_DISCIPLINES" :key="d.id" :value="d.id">
              {{ d.label }}
            </option>
          </AppSelect>
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

    <RecipePictureField
      v-model="form.image_url"
      v-model:focal-point="form.image_focal_point"
      :fallback="fallbackArt"
      :fallback-name="fallbackName"
    />

    <!-- Description -->
    <div>
      <label
        class="block text-label-lg font-semibold text-muted-foreground mb-1"
        >DESCRIPTION</label
      >
      <!--
        RichTextEditor reads its content once, when it is created. The draft seeds
        only after the child lists arrive, so mounted earlier it would show an empty
        description, and typing into it would autosave over the real one.
      -->
      <RichTextEditor
        v-if="isNew || seeded"
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
          class="flex flex-col gap-1"
        >
          <div class="flex items-center gap-2">
            <AppInput
              v-model="mod.description"
              placeholder="e.g. Assisted by a master crafter"
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
          <p
            v-if="repeatsWorkspaceBonus(form.discipline, mod)"
            class="flex items-start gap-1.5 text-caption text-ink-caution"
          >
            <IconWarning class="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              This reads like the workspace bonus, which every attempt already
              offers as “{{ activeDiscipline.workspaceLabel }}”
              +{{ activeDiscipline.workspaceBonus }}. A player could take both.
            </span>
          </p>
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
import { ref, computed, nextTick, watch } from "vue";
import { IconAdd, IconDelete, IconLock, IconSearch, IconTool, IconWarning } from '@/lib/icons';
import DraftConflictNotice from "@/components/common/feedback/DraftConflictNotice.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import EntityEditorActionBar from "@/components/common/entity/EntityEditorActionBar.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import RecipeOutputsPanel from "@/components/crafting/RecipeOutputsPanel.vue";
import RecipeIngredientsPanel from "@/components/crafting/RecipeIngredientsPanel.vue";
import {
  CRAFTING_DISCIPLINES,
  getDiscipline,
} from "@/lib/crafting/disciplines";
import { repeatsWorkspaceBonus } from "@/lib/crafting/workspaceModifier";
import { useRecordDraft, cloneDraftValue, draftValueEqual } from "@/composables/useRecordDraft";
import { useAutosave } from "@/composables/useAutosave";
import { useConfirm } from "@/composables/useConfirm";
import RecipePictureField from "@/components/crafting/RecipePictureField.vue";
import type { RecipeArt } from "@/lib/crafting/recipeArt";
import { useCraftingUiStore } from "@/stores/ui/crafting";
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
  CraftingIngredient,
  CraftingModifier,
  CraftingOutput,
} from "@/types/crafting.types";

const props = defineProps<{
  recipe?: CraftingRecipe;
}>();

// `saved` is the create path only: an existing recipe saves itself and `done`
// is the way out.
const emit = defineEmits<{ saved: [id: string]; done: [] }>();

const isNew = computed(() => !props.recipe);
const recipeId = computed(() => props.recipe?.id);

const craftingUi = useCraftingUiStore();
const { confirm } = useConfirm();

const { data: allItems } = useItemIndex();

// Load existing sub-resources when editing — pass the computed so the query
// re-enables reactively once the recipe prop resolves after a hard refresh.
const recipeIdStr = computed(() => recipeId.value ?? "");
const { data: existingIngredients } = useRecipeIngredients(recipeIdStr);
const { data: existingModifiers } = useRecipeModifiers(recipeIdStr);
const { data: existingOutputs } = useRecipeOutputs(recipeIdStr);

const { mutateAsync: createRecipe } = useCreateRecipe();
const { mutateAsync: updateRecipe } = useUpdateRecipe();
const { mutateAsync: replaceIngredients } = useReplaceIngredients();
const { mutateAsync: replaceModifiers } = useReplaceModifiers();
const { mutateAsync: replaceOutputs } = useReplaceOutputs();

// The create path's state. An existing recipe reports through the autosave status.
const saving = ref(false);
const saveError = ref("");

type IngredientRow = { item_id: string | null; library_item_id: string | null; tags: string[] | null; quantity: number };
type OutputRow = { item_id: string | null; library_item_id: string | null; quantity: number };
type ModifierRow = { description: string; bonus: number };

// One draft for the recipe row and its three child lists, so autosave watches a
// single object. The lists load as separate queries; the draft seeds once all
// are in. Each field takes fresh server data until the user touches it, and the
// save writes only what changed (#946). Row order is the order on screen: the
// replace helpers write `position` from the index, and the first output is the
// recipe's picture.
interface RecipeDraft {
  name: string;
  description: string;
  discipline: CraftingDiscipline;
  dc: number;
  crafting_time: number;
  crafting_time_unit: "minutes" | "hours" | "days";
  requires_proficiency: boolean;
  requires_tools: boolean;
  discoverable: boolean;
  player_visible_to: string[];
  image_url: string | null;
  image_focal_point: { x: number; y: number } | null;
  ingredients: IngredientRow[];
  modifiers: ModifierRow[];
  outputs: OutputRow[];
}

interface RecipeSource {
  recipe: CraftingRecipe;
  ingredients: CraftingIngredient[];
  modifiers: CraftingModifier[];
  outputs: CraftingOutput[];
}

function toDraft(r: RecipeSource | null): RecipeDraft {
  if (!r) {
    return {
      name: "",
      description: "",
      discipline: (craftingUi.workshopActiveTab !== "all" ? craftingUi.workshopActiveTab : "smithing") as CraftingDiscipline,
      dc: 10,
      crafting_time: 1,
      crafting_time_unit: "days",
      requires_proficiency: false,
      requires_tools: false,
      discoverable: false,
      player_visible_to: [],
      image_url: null,
      image_focal_point: null,
      ingredients: [],
      modifiers: [],
      outputs: [],
    };
  }
  return {
    name: r.recipe.name,
    description: r.recipe.description,
    discipline: r.recipe.discipline,
    dc: r.recipe.dc,
    crafting_time: r.recipe.crafting_time,
    crafting_time_unit: r.recipe.crafting_time_unit,
    requires_proficiency: r.recipe.requires_proficiency,
    requires_tools: r.recipe.requires_tools,
    discoverable: r.recipe.discoverable,
    player_visible_to: [...r.recipe.player_visible_to],
    image_url: r.recipe.image_url,
    image_focal_point: r.recipe.image_focal_point ? { ...r.recipe.image_focal_point } : null,
    ingredients: r.ingredients.map((i) => ({ item_id: i.item_id, library_item_id: i.library_item_id, tags: i.tags ? [...i.tags] : null, quantity: i.quantity })),
    modifiers: r.modifiers.map((m) => ({ description: m.description, bonus: m.bonus })),
    outputs: r.outputs.map((o) => ({ item_id: o.item_id, library_item_id: o.library_item_id, quantity: o.quantity })),
  };
}

function currentSource(): RecipeSource | null {
  const recipe = props.recipe;
  const ingredients = existingIngredients.value;
  const modifiers = existingModifiers.value;
  const outputs = existingOutputs.value;
  if (!recipe || !ingredients || !modifiers || !outputs) return null;
  return { recipe, ingredients, modifiers, outputs };
}

const {
  draft: form,
  seeded,
  conflicts: recipeConflicts,
  changes,
  commit,
  reset: resetRecipe,
} = useRecordDraft<RecipeSource, RecipeDraft>({
  source: currentSource,
  identity: (row) => row.recipe.id,
  toDraft,
});

/** The recipe columns (no child lists). Pure: also run over the server copy. */
function buildRecipe(d: RecipeDraft) {
  return {
    name: d.name,
    description: d.description,
    discipline: d.discipline,
    dc: d.dc,
    crafting_time: d.crafting_time,
    crafting_time_unit: d.crafting_time_unit,
    requires_proficiency: d.requires_proficiency,
    requires_tools: d.requires_tools,
    discoverable: d.discoverable,
    player_visible_to: [...d.player_visible_to],
    image_url: d.image_url,
    image_focal_point: d.image_focal_point,
  };
}

const ingredients = computed(() => form.ingredients);
const modifiers = computed(() => form.modifiers);
const outputs = computed(() => form.outputs);

const CONFLICT_LABELS: Record<keyof RecipeDraft, string> = {
  name: "Name",
  description: "Description",
  discipline: "Discipline",
  dc: "Crafting DC",
  crafting_time: "Crafting time",
  crafting_time_unit: "Crafting time",
  requires_proficiency: "Requires proficiency",
  requires_tools: "Requires tools",
  discoverable: "Discoverable",
  player_visible_to: "Visible to",
  image_url: "Picture",
  image_focal_point: "Picture",
  ingredients: "Ingredients",
  modifiers: "Conditional modifiers",
  outputs: "Outputs",
};

const conflictLabels = computed(() => [...new Set(recipeConflicts.value.map((key) => CONFLICT_LABELS[key]))]);

const canSave = computed(() => !!form.name.trim() && outputs.value.length > 0);

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

// The picture a recipe falls back to: the first output's art, resolved the same
// way the list and the sheet do. Editor rows carry no `position`; their index is it.
const primaryItem = computed(() => {
  const first = outputs.value[0];
  return first ? itemById(inventoryItemRef(first)) : undefined;
});
const fallbackArt = computed<RecipeArt | null>(() =>
  primaryItem.value?.image_url
    ? { url: primaryItem.value.image_url, focalPoint: primaryItem.value.image_focal_point ?? null }
    : null,
);
const fallbackName = computed(() => primaryItem.value?.name ?? "the first output");

/** Writes what changed against the server copy. Existing recipes only. */
async function saveExisting(snapshot: RecipeDraft) {
  const recipe = props.recipe;
  if (!recipe) return;
  // Only what changed is written: a list or column the user never touched is
  // left alone, so a stale form cannot revert it. Copied now, before any await,
  // so edits made while the writes are in flight are not half-sent.
  const recipeColumns = cloneDraftValue(changes(buildRecipe));
  const ingredientsChanged = cloneDraftValue(changes((d) => ({ rows: d.ingredients })).rows);
  const modifiersChanged = cloneDraftValue(changes((d) => ({ rows: d.modifiers })).rows);
  const outputsChanged = cloneDraftValue(changes((d) => ({ rows: d.outputs })).rows);
  // Material edit (#606): visibility alone is not a content change.
  const contentChanged =
    Object.keys(recipeColumns).some((key) => key !== "player_visible_to") || !!ingredientsChanged || !!modifiersChanged || !!outputsChanged;
  const update =
    contentChanged && recipe.ai_provenance
      ? { ...recipeColumns, ai_provenance: markEdited(recipe.ai_provenance) }
      : recipeColumns;
  if (Object.keys(update).length > 0) await updateRecipe({ id: recipe.id, update });
  if (ingredientsChanged) await replaceIngredients({ recipeId: recipe.id, ingredients: ingredientsChanged });
  if (modifiersChanged) await replaceModifiers({ recipeId: recipe.id, modifiers: modifiersChanged });
  if (outputsChanged) await replaceOutputs({ recipeId: recipe.id, outputs: outputsChanged });
  // Edits made while the writes were in flight are not part of what was sent;
  // they stay unsaved until the refetch confirms the write.
  if (draftValueEqual(form, snapshot)) commit();
}

const autosave = props.recipe
  ? useAutosave({
      draft: form,
      initial: () => toDraft(currentSource()),
      equal: draftValueEqual,
      save: saveExisting,
      canSave: () => canSave.value,
      errorMessage: "Failed to save",
    })
  : null;

// The child lists arrive after the recipe, so the draft is seeded a moment after
// mount. Without this the autosave baseline would still be the empty form and the
// seeding itself would read as an edit.
if (autosave) {
  watch(seeded, (isSeeded) => {
    if (isSeeded) autosave.reset();
  });
}

const autosaveBar = computed(() =>
  autosave
    ? {
        status: autosave.status.value,
        error: autosave.saveError.value,
        pausedLabel: "Autosave paused until the recipe has a name and an output",
      }
    : undefined,
);

/** Done: write pending edits, and refuse to drop any that could not be written. */
async function onDone() {
  if (autosave) {
    // The draft watcher marks an edit dirty on the next flush; an edit made in the
    // same tick as the click would otherwise not be saved here.
    await nextTick();
    await autosave.saveNow();
    // Still dirty means nothing was written: autosave is paused (no name or no
    // output), or the write failed. Leaving silently would drop those edits.
    if (autosave.dirty.value) {
      const reason = autosave.status.value === "paused"
        ? "A recipe needs a name and an output before its edits can be saved."
        : autosave.status.value === "error"
          ? "The last save failed."
          : "Your latest edits are not saved yet.";
      const leave = await confirm(`${reason} Leave anyway and lose your unsaved edits?`, {
        title: "Unsaved edits",
        confirmLabel: "Leave",
      });
      if (!leave) return;
      autosave.reset();
    }
  }
  emit("done");
}

/** Creating a recipe: the explicit first save. */
async function save() {
  if (!canSave.value || !isNew.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    const created = await createRecipe(buildRecipe(form));
    await replaceIngredients({ recipeId: created.id, ingredients: cloneDraftValue(ingredients.value) });
    await replaceModifiers({ recipeId: created.id, modifiers: cloneDraftValue(modifiers.value) });
    await replaceOutputs({ recipeId: created.id, outputs: cloneDraftValue(outputs.value) });
    emit("saved", created.id);
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    saving.value = false;
  }
}
</script>
