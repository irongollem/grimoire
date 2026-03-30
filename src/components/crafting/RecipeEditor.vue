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
        :title="form.is_player_visible ? 'Visible to players — click to hide' : 'Hidden from players — click to share'"
        class="p-2 rounded-md border border-border transition-colors"
        :class="form.is_player_visible ? 'bg-elven-green/15 text-elven-green border-elven-green/30' : 'bg-card text-muted-foreground hover:text-foreground'"
        @click="form.is_player_visible = !form.is_player_visible"
      >
        <Eye class="h-3.5 w-3.5" />
      </button>

      <button
        v-if="!isNew"
        type="button"
        class="p-2 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
        title="Grant recipe to party members"
        @click="showGrant = true"
      >
        <UserPlus class="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        :disabled="saving || !form.name.trim() || outputs.length === 0"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <Save class="h-3.5 w-3.5" />
        {{ saving ? "Saving…" : isNew ? "Create" : "Save" }}
      </button>
    </div>

    <!-- Core fields -->
    <div class="grid grid-cols-2 gap-4">
      <!-- Discipline -->
      <div>
        <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">DISCIPLINE</label>
        <div class="relative">
          <component :is="activeDiscipline.icon" class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <select
            v-model="form.discipline"
            class="w-full bg-muted border border-border rounded-md pl-9 pr-3 py-2 font-fell text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option v-for="d in CRAFTING_DISCIPLINES" :key="d.id" :value="d.id">{{ d.label }}</option>
          </select>
        </div>
      </div>

      <!-- DC -->
      <div>
        <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">CRAFTING DC</label>
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
        <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">CRAFTING TIME (DAYS)</label>
        <input
          v-model.number="form.crafting_time_days"
          type="number"
          min="1"
          class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

    </div>

    <!-- Description -->
    <div>
      <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">DESCRIPTION</label>
      <RichTextEditor
        v-model="form.description"
        placeholder="How is this item crafted? Any special requirements or lore…"
        min-height="140px"
      />
    </div>

    <!-- Outputs -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">OUTPUTS</span>
        <span class="font-fell text-xs text-muted-foreground italic">At least one required</span>
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
          <button type="button" class="text-muted-foreground hover:text-destructive transition-colors" @click="outputs.splice(idx, 1)">
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- Add output -->
        <div class="relative mt-1">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            v-model="outputSearch"
            placeholder="Add output item…"
            class="w-full bg-muted border border-border rounded-md pl-9 pr-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div v-if="outputSearch.length > 1" class="max-h-40 overflow-y-auto rounded-md border border-border bg-card divide-y divide-border">
          <button
            v-for="item in filteredOutputItems"
            :key="item.id"
            type="button"
            class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            @click="addOutput(item.id)"
          >
            <span class="font-cinzel text-xs font-semibold text-foreground flex-1 truncate">{{ item.name }}</span>
            <span class="font-fell text-[10px] text-muted-foreground capitalize shrink-0">{{ item.item_type.replace(/_/g, " ") }}</span>
          </button>
          <p v-if="filteredOutputItems.length === 0" class="px-3 py-2 font-fell text-xs text-muted-foreground italic">No items found.</p>
        </div>
      </div>
    </div>

    <!-- Ingredients -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">INGREDIENTS</span>
        <span class="font-fell text-xs text-muted-foreground italic">First ingredient = primary (ruined on critical fail)</span>
      </div>
      <div class="p-4 flex flex-col gap-2">
        <!-- Existing ingredients -->
        <div
          v-for="(ing, idx) in ingredients"
          :key="idx"
          class="flex items-center gap-2"
        >
          <span v-if="idx === 0" class="font-cinzel text-[9px] text-primary tracking-wider shrink-0 w-10">PRIMARY</span>
          <span v-else class="w-10 shrink-0" />
          <span class="flex-1 font-fell text-sm text-foreground truncate">
            {{ itemById(ing.item_id)?.name ?? "Unknown item" }}
          </span>
          <input
            v-model.number="ing.quantity"
            type="number"
            min="1"
            class="w-16 bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring text-center"
          />
          <span class="font-fell text-xs text-muted-foreground">×</span>
          <button type="button" class="text-muted-foreground hover:text-destructive transition-colors" @click="removeIngredient(idx)">
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- Add ingredient -->
        <div class="relative mt-1">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            v-model="ingredientSearch"
            placeholder="Add ingredient…"
            class="w-full bg-muted border border-border rounded-md pl-9 pr-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div v-if="ingredientSearch.length > 1" class="max-h-40 overflow-y-auto rounded-md border border-border bg-card divide-y divide-border">
          <button
            v-for="item in filteredIngredientItems"
            :key="item.id"
            type="button"
            class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            @click="addIngredient(item.id)"
          >
            <span class="font-cinzel text-xs font-semibold text-foreground flex-1 truncate">{{ item.name }}</span>
            <span class="font-fell text-[10px] text-muted-foreground capitalize shrink-0">{{ item.item_type.replace(/_/g, " ") }}</span>
          </button>
          <p v-if="filteredIngredientItems.length === 0" class="px-3 py-2 font-fell text-xs text-muted-foreground italic">No items found.</p>
        </div>
      </div>
    </div>

    <!-- Conditional modifiers -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">CONDITIONAL MODIFIERS</span>
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
          <button type="button" class="text-muted-foreground hover:text-destructive transition-colors" @click="modifiers.splice(idx, 1)">
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          class="flex items-center gap-1.5 text-xs font-cinzel text-muted-foreground hover:text-foreground transition-colors mt-1"
          @click="modifiers.push({ description: '', bonus: 2 })"
        >
          <Plus class="h-3.5 w-3.5" />
          Add modifier
        </button>
      </div>
    </div>

    <GrantRecipeDialog
      v-if="!isNew"
      :open="showGrant"
      :recipe-id="recipeId!"
      :recipe-name="form.name"
      :party-members="partyMembers ?? []"
      :existing-grants="grants ?? []"
      @close="showGrant = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Eye, Plus, Save, Search, Trash2, UserPlus } from "lucide-vue-next";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import { CRAFTING_DISCIPLINES, getDiscipline } from "@/lib/crafting-disciplines";
import { useItems } from "@/composables/useItems";
import { useParty } from "@/composables/useParty";
import {
  useCreateRecipe,
  useUpdateRecipe,
  useReplaceIngredients,
  useReplaceModifiers,
  useReplaceOutputs,
  useRecipeGrants,
} from "@/composables/useCrafting";
import type { CraftingRecipe, CraftingDiscipline } from "@/types/crafting.types";
import GrantRecipeDialog from "./GrantRecipeDialog.vue";

const props = defineProps<{
  recipe?: CraftingRecipe;
}>();

const emit = defineEmits<{ saved: [id: string] }>();

const isNew = computed(() => !props.recipe);
const recipeId = computed(() => props.recipe?.id);

const { data: allItems } = useItems();
const { data: partyMembers } = useParty();
const { data: grants } = useRecipeGrants(recipeId.value ?? "");

const { mutateAsync: createRecipe, isPending: isCreating } = useCreateRecipe();
const { mutateAsync: updateRecipe, isPending: isUpdating } = useUpdateRecipe();
const { mutateAsync: replaceIngredients } = useReplaceIngredients();
const { mutateAsync: replaceModifiers } = useReplaceModifiers();
const { mutateAsync: replaceOutputs } = useReplaceOutputs();

const saving = computed(() => isCreating.value || isUpdating.value);
const showGrant = ref(false);

// Form state
const form = ref({
  name: props.recipe?.name ?? "",
  description: props.recipe?.description ?? "",
  discipline: (props.recipe?.discipline ?? "smithing") as CraftingDiscipline,
  dc: props.recipe?.dc ?? 10,
  crafting_time_days: props.recipe?.crafting_time_days ?? 1,
  is_player_visible: props.recipe?.is_player_visible ?? false,
});

const ingredients = ref<{ item_id: string; quantity: number }[]>([]);
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
        crafting_time_days: r.crafting_time_days,
        is_player_visible: r.is_player_visible,
      };
    }
  },
  { immediate: true },
);

const activeDiscipline = computed(() => getDiscipline(form.value.discipline));

// Item search
const outputSearch = ref("");
const ingredientSearch = ref("");

const items = computed(() => allItems.value ?? []);

const filteredOutputItems = computed(() =>
  items.value
    .filter((i) => i.name.toLowerCase().includes(outputSearch.value.toLowerCase()))
    .slice(0, 20),
);

const filteredIngredientItems = computed(() =>
  items.value
    .filter((i) => i.name.toLowerCase().includes(ingredientSearch.value.toLowerCase()))
    .slice(0, 20),
);

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
    ingredients.value.push({ item_id: itemId, quantity: 1 });
  }
  ingredientSearch.value = "";
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
    const updated = await updateRecipe({ id: recipeId.value!, update: form.value });
    id = updated.id;
  }

  await replaceIngredients({ recipeId: id, ingredients: ingredients.value });
  await replaceModifiers({ recipeId: id, modifiers: modifiers.value });
  await replaceOutputs({ recipeId: id, outputs: outputs.value });

  emit("saved", id);
}
</script>
