<template>
  <PageHeader
    title="Workshop"
    description="Create recipes and share them with your players"
  >
    <template #actions>
      <button
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        @click="$router.push('/crafting/new')"
      >
        <Plus class="h-3.5 w-3.5" />
        New Recipe
      </button>
    </template>

    <!-- Discipline tabs -->
    <div class="flex flex-wrap gap-1 mb-6 rounded-md border border-border p-1 bg-muted w-fit">
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-cinzel tracking-wide transition-colors"
        :class="ui.workshopActiveTab === 'all'
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'"
        @click="ui.workshopActiveTab = 'all'"
      >
        <LayoutList class="h-3.5 w-3.5" />
        All
      </button>
      <button
        v-for="d in CRAFTING_DISCIPLINES"
        :key="d.id"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-cinzel tracking-wide transition-colors"
        :class="ui.workshopActiveTab === d.id
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'"
        @click="ui.workshopActiveTab = d.id"
      >
        <component :is="d.icon" class="h-3.5 w-3.5" />
        {{ d.label }}
      </button>
    </div>

    <!-- Recipes for active discipline -->
    <div class="flex flex-col gap-4">

      <div v-if="isLoading" class="font-fell text-sm text-muted-foreground italic">Loading recipes…</div>

      <div v-else-if="disciplineRecipes.length === 0" class="rounded-lg border border-border border-dashed px-6 py-10 text-center">
        <component
          :is="activeDiscipline ? activeDiscipline.icon : LayoutList"
          class="h-8 w-8 text-muted-foreground/40 mx-auto mb-3"
        />
        <p class="font-cinzel text-sm font-semibold text-muted-foreground">
          {{ activeDiscipline ? `No ${activeDiscipline.label} recipes yet` : 'No recipes yet' }}
        </p>
        <p class="font-fell text-xs text-muted-foreground/60 italic mt-1">
          {{ activeDiscipline
            ? `Create a recipe to let players craft ${activeDiscipline.label.toLowerCase()} items.`
            : 'Create a recipe to get started.' }}
        </p>
      </div>

      <div v-else class="grid gap-3">
        <div
          v-for="recipe in disciplineRecipes"
          :key="recipe.id"
          class="rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-3 hover:border-border/80 transition-colors"
        >
          <!-- Left: name + meta -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <p class="font-cinzel text-sm font-bold text-foreground truncate">{{ recipe.name }}</p>
              <span
                v-if="!activeDiscipline"
                class="shrink-0 font-cinzel text-[10px] tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
              >{{ getDiscipline(recipe.discipline).label }}</span>
              <span
                v-if="recipe.requires_proficiency"
                class="shrink-0 font-cinzel text-[10px] tracking-wider px-1.5 py-0.5 rounded border border-destructive/40 text-destructive bg-destructive/10"
                title="Requires tool proficiency"
              >PROF</span>
              <span
                v-if="recipe.requires_tools"
                class="shrink-0 font-cinzel text-[10px] tracking-wider px-1.5 py-0.5 rounded border border-destructive/40 text-destructive bg-destructive/10"
                title="Requires physical tools"
              >TOOLS</span>
            </div>
            <p class="font-fell text-xs text-muted-foreground">
              DC {{ recipe.dc }} · {{ recipe.crafting_time }} {{ recipe.crafting_time !== 1 ? recipe.crafting_time_unit : recipe.crafting_time_unit.replace(/s$/, '') }}
            </p>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1 shrink-0">
            <button
              class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Edit recipe"
              @click="$router.push(`/crafting/${recipe.id}`)"
            >
              <Pencil class="h-3.5 w-3.5" />
            </button>
            <button
              class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
              title="Delete recipe"
              @click="remove(recipe)"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { LayoutList, Pencil, Plus, Trash2 } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import { CRAFTING_DISCIPLINES, getDiscipline } from "@/lib/crafting-disciplines";
import { useCraftingRecipes, useDeleteRecipe } from "@/composables/useCrafting";
import { useConfirm } from "@/composables/useConfirm";
import { useUiStore } from "@/stores/ui";
import type { CraftingRecipe } from "@/types/crafting.types";

const ui = useUiStore();

const activeDiscipline = computed(() =>
  ui.workshopActiveTab === "all" ? null : getDiscipline(ui.workshopActiveTab),
);

const { data: recipes, isLoading } = useCraftingRecipes();
const { mutateAsync: deleteRecipe } = useDeleteRecipe();
const { confirm } = useConfirm();

const disciplineRecipes = computed(() =>
  ui.workshopActiveTab === "all"
    ? (recipes.value ?? [])
    : (recipes.value ?? []).filter((r) => r.discipline === ui.workshopActiveTab),
);

async function remove(recipe: CraftingRecipe) {
  const ok = await confirm(`Delete "${recipe.name}"? This cannot be undone.`, { title: "Delete Recipe" });
  if (!ok) return;
  await deleteRecipe(recipe.id);
}
</script>
