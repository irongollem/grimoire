<template>
  <div class="flex flex-col gap-6 max-w-2xl">
    <!-- Header row -->
    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="form.name"
        placeholder="Recipe name…"
        class="flex-1 min-w-48 bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />

      <button
        type="button"
        :title="
          form.requires_proficiency
            ? 'Requires proficiency — click to allow unskilled attempts'
            : 'Unskilled attempts allowed — click to require proficiency'
        "
        class="p-2 rounded-md border border-border transition-colors"
        :class="
          form.requires_proficiency
            ? 'bg-destructive/15 text-destructive border-destructive/30'
            : 'bg-card text-muted-foreground hover:text-foreground'
        "
        @click="form.requires_proficiency = !form.requires_proficiency"
      >
        <IconLock class="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        :title="
          form.requires_tools
            ? 'Requires physical tools — click to allow without tools'
            : 'Attemptable without tools (disadvantage) — click to require them'
        "
        class="p-2 rounded-md border border-border transition-colors"
        :class="
          form.requires_tools
            ? 'bg-destructive/15 text-destructive border-destructive/30'
            : 'bg-card text-muted-foreground hover:text-foreground'
        "
        @click="form.requires_tools = !form.requires_tools"
      >
        <IconTool class="h-3.5 w-3.5" />
      </button>

      <PlayerVisibilityToggle
        :visible-to="form.player_visible_to"
        @update:visible-to="form.player_visible_to = $event"
      />

      <button
        type="button"
        :disabled="saving || !form.name.trim() || outputs.length === 0"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <IconSave class="h-3.5 w-3.5" />
        {{ saving ? "Saving…" : isNew ? "Create" : "IconSave" }}
      </button>
    </div>

    <!-- Core fields -->
    <div class="grid grid-cols-2 gap-4">
      <!-- Discipline -->
      <div>
        <label
          class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1"
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
          class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1"
          >CRAFTING DC</label
        >
        <input
          v-model.number="form.dc"
          type="number"
          min="1"
          max="30"
          class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <!-- Time -->
      <div>
        <label
          class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1"
          >CRAFTING TIME</label
        >
        <div class="flex gap-2">
          <input
            v-model.number="form.crafting_time"
            type="number"
            min="1"
            class="flex-1 min-w-0 bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <select
            v-model="form.crafting_time_unit"
            class="bg-muted border border-border rounded-md px-2 py-2 font-fell text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Description -->
    <div>
      <label
        class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1"
        >DESCRIPTION</label
      >
      <RichTextEditor
        v-model="form.description"
        placeholder="How is this item crafted? Any special requirements or lore…"
        min-height="140px"
      />
    </div>

    <!-- Outputs -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div
        class="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between"
      >
        <span
          class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
          >OUTPUTS</span
        >
        <span class="font-fell text-xs text-muted-foreground italic"
          >At least one required</span
        >
      </div>
      <div class="p-4 flex flex-col gap-2">
        <!-- Existing outputs -->
        <div
          v-for="(out, idx) in outputs"
          :key="idx"
          class="flex items-center gap-2"
        >
          <span class="flex-1 font-fell text-sm text-foreground truncate">
            {{ itemById(out.item_id)?.name ?? "Unknown item" }}
          </span>
          <input
            v-model.number="out.quantity"
            type="number"
            min="1"
            class="w-16 bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring text-center"
          />
          <span class="font-fell text-xs text-muted-foreground">×</span>
          <button
            type="button"
            class="text-muted-foreground hover:text-destructive transition-colors"
            @click="outputs.splice(idx, 1)"
          >
            <IconDelete class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- Add output -->
        <div class="relative mt-1">
          <IconSearch
            class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
          />
          <input
            v-model="outputSearch"
            placeholder="Add output item…"
            class="w-full bg-muted border border-border rounded-md pl-9 pr-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div
          v-if="outputSearch.length > 1"
          class="max-h-40 overflow-y-auto rounded-md border border-border bg-card divide-y divide-border"
        >
          <button
            v-for="item in filteredOutputItems"
            :key="item.id"
            type="button"
            class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            @click="addOutput(item.id)"
          >
            <span
              class="font-cinzel text-xs font-semibold text-foreground flex-1 truncate"
              >{{ item.name }}</span
            >
            <span
              class="font-fell text-[10px] text-muted-foreground capitalize shrink-0"
              >{{ item.item_type.replace(/_/g, " ") }}</span
            >
          </button>
          <p
            v-if="filteredOutputItems.length === 0"
            class="px-3 py-2 font-fell text-xs text-muted-foreground italic"
          >
            No items found.
          </p>
        </div>
      </div>
    </div>

    <!-- Ingredients -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div
        class="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between"
      >
        <span
          class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
          >INGREDIENTS</span
        >
        <span class="font-fell text-xs text-muted-foreground italic"
          >First ingredient = primary (ruined on critical fail)</span
        >
      </div>
      <div class="p-4 flex flex-col gap-2">
        <!-- Existing ingredients -->
        <div
          v-for="(ing, idx) in ingredients"
          :key="idx"
          class="flex items-center gap-2"
        >
          <span
            v-if="idx === 0"
            class="font-cinzel text-[9px] text-primary tracking-wider shrink-0 w-10"
            >PRIMARY</span
          >
          <span v-else class="w-10 shrink-0" />
          <span class="flex-1 font-fell text-sm text-foreground truncate">
            <span v-if="ing.item_id">{{
              itemById(ing.item_id)?.name ?? "Unknown item"
            }}</span>
            <span v-else class="italic text-muted-foreground">
              any
              <template v-if="ing.tags && ing.tags.length === 1"
                >"{{ ing.tags[0] }}"</template
              >
              <template v-else-if="ing.tags">{{
                ing.tags.join(" + ")
              }}</template>
            </span>
          </span>
          <input
            v-model.number="ing.quantity"
            type="number"
            min="1"
            class="w-16 bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring text-center"
          />
          <span class="font-fell text-xs text-muted-foreground">×</span>
          <button
            type="button"
            class="text-muted-foreground hover:text-destructive transition-colors"
            @click="removeIngredient(idx)"
          >
            <IconDelete class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- Add ingredient by specific item -->
        <div class="relative mt-1">
          <IconSearch
            class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
          />
          <input
            v-model="ingredientSearch"
            placeholder="Add specific item…"
            class="w-full bg-muted border border-border rounded-md pl-9 pr-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div
          v-if="ingredientSearch.length > 1"
          class="max-h-40 overflow-y-auto rounded-md border border-border bg-card divide-y divide-border"
        >
          <button
            v-for="item in filteredIngredientItems"
            :key="item.id"
            type="button"
            class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            @click="addIngredient(item.id)"
          >
            <span
              class="font-cinzel text-xs font-semibold text-foreground flex-1 truncate"
              >{{ item.name }}</span
            >
            <span
              class="font-fell text-[10px] text-muted-foreground capitalize shrink-0"
              >{{ item.item_type.replace(/_/g, " ") }}</span
            >
          </button>
          <p
            v-if="filteredIngredientItems.length === 0"
            class="px-3 py-2 font-fell text-xs text-muted-foreground italic"
          >
            No items found.
          </p>
        </div>

        <!-- Add ingredient by tag -->
        <div class="flex items-center gap-2 mt-1">
          <div class="relative flex-1">
            <IconTag
              class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
            />
            <input
              v-model="tagIngredientInput"
              placeholder='Add by tag(s), e.g. "meat" or "glass, container"…'
              class="w-full bg-muted border border-border rounded-md pl-9 pr-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              @keydown.enter.prevent="addTagIngredient"
            />
          </div>
          <button
            type="button"
            :disabled="!tagIngredientInput.trim()"
            class="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-md bg-muted border border-border font-cinzel text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
            @click="addTagIngredient"
          >
            <IconAdd class="h-3.5 w-3.5" />
            Add tag
          </button>
        </div>
      </div>
    </div>

    <!-- Conditional modifiers -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div
        class="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between"
      >
        <span
          class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
          >CONDITIONAL MODIFIERS</span
        >
        <span class="font-fell text-xs text-muted-foreground italic">
          Workshop and ruined ingredients are already provided</span
        >
      </div>
      <div class="p-4 flex flex-col gap-2">
        <div
          v-for="(mod, idx) in modifiers"
          :key="idx"
          class="flex items-center gap-2"
        >
          <input
            v-model="mod.description"
            placeholder="e.g. Full forge available"
            class="flex-1 bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span class="font-cinzel text-xs text-muted-foreground">+</span>
          <input
            v-model.number="mod.bonus"
            type="number"
            min="1"
            max="20"
            class="w-14 bg-muted border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring text-center"
          />
          <button
            type="button"
            class="text-muted-foreground hover:text-destructive transition-colors"
            @click="modifiers.splice(idx, 1)"
          >
            <IconDelete class="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          class="flex items-center gap-1.5 text-xs font-cinzel text-muted-foreground hover:text-foreground transition-colors mt-1"
          @click="modifiers.push({ description: '', bonus: 2 })"
        >
          <IconAdd class="h-3.5 w-3.5" />
          Add modifier
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { IconAdd, IconDelete, IconLock, IconSave, IconSearch, IconTag, IconTool } from '@/lib/icons';
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import PlayerVisibilityToggle from "@/components/common/PlayerVisibilityToggle.vue";
import {
  CRAFTING_DISCIPLINES,
  getDiscipline,
} from "@/lib/crafting-disciplines";
import { useUiStore } from "@/stores/ui";
import { useItems } from "@/composables/useItems";
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

function addOutput(itemId: string) {
  const existing = outputs.value.find((o) => o.item_id === itemId);
  if (existing) {
    existing.quantity += 1;
  } else {
    outputs.value.push({ item_id: itemId, quantity: 1 });
  }
  outputSearch.value = "";
}

function addIngredient(itemId: string) {
  const existing = ingredients.value.find((i) => i.item_id === itemId);
  if (existing) {
    existing.quantity += 1;
  } else {
    ingredients.value.push({ item_id: itemId, tags: null, quantity: 1 });
  }
  ingredientSearch.value = "";
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
