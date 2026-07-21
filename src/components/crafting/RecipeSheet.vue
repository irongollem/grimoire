<template>
  <div class="flex flex-col gap-5 max-w-2xl">
    <!-- Action bar -->
    <div class="flex items-center justify-end gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="handleDelete"
      >
        <IconDelete class="h-3.5 w-3.5" />Delete
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      >
        <IconEdit class="h-3.5 w-3.5" />Edit
      </button>
    </div>

    <!-- Core stats row -->
    <div class="rounded-lg border border-border bg-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
      <!-- Discipline -->
      <div class="flex flex-col gap-1">
        <span class="text-label font-semibold text-muted-foreground">DISCIPLINE</span>
        <div class="flex items-center gap-1.5">
          <component :is="discipline.icon" class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span class="text-body text-foreground">{{ discipline.label }}</span>
        </div>
      </div>

      <!-- DC -->
      <div class="flex flex-col gap-1">
        <span class="text-label font-semibold text-muted-foreground">CRAFTING DC</span>
        <span class="font-cinzel text-lg font-bold text-foreground">{{ recipe.dc }}</span>
      </div>

      <!-- Time -->
      <div class="flex flex-col gap-1">
        <span class="text-label font-semibold text-muted-foreground">TIME</span>
        <span class="text-body text-foreground">{{ recipe.crafting_time }} {{ recipe.crafting_time_unit }}</span>
      </div>

      <!-- Requirements -->
      <div class="flex flex-col gap-1">
        <span class="text-label font-semibold text-muted-foreground">REQUIRES</span>
        <div class="flex flex-wrap gap-1">
          <span v-if="recipe.requires_proficiency" class="font-cinzel text-2xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">Proficiency</span>
          <span v-if="recipe.requires_tools" class="font-cinzel text-2xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">Tools</span>
          <span v-if="!recipe.requires_proficiency && !recipe.requires_tools" class="text-caption text-muted-foreground italic">None</span>
        </div>
      </div>
    </div>

    <!-- Player visibility -->
    <div v-if="recipe.player_visible_to?.length" class="flex items-center gap-1.5">
      <span class="text-label-lg font-semibold px-2 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
        Shared with players
      </span>
    </div>

    <!-- Description -->
    <div v-if="recipe.description" class="rounded-lg border border-border bg-card p-4">
      <span class="text-label font-semibold text-muted-foreground block mb-2">DESCRIPTION</span>
      <RichTextViewer :content="recipe.description" />
    </div>

    <!-- Outputs -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">OUTPUTS</span>
      </div>
      <div class="p-4">
        <div v-if="outputs?.length" class="space-y-1.5">
          <div v-for="out in outputs" :key="out.id" class="flex items-center justify-between gap-2">
            <span class="text-body text-foreground">{{ itemById(out.item_id)?.name ?? "Unknown item" }}</span>
            <span class="font-cinzel text-xs text-muted-foreground shrink-0">× {{ out.quantity }}</span>
          </div>
        </div>
        <p v-else class="text-body text-muted-foreground italic">No outputs defined.</p>
      </div>
    </div>

    <!-- Ingredients -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">INGREDIENTS</span>
      </div>
      <div class="p-4">
        <div v-if="ingredients?.length" class="space-y-1.5">
          <div v-for="(ing, idx) in ingredients" :key="ing.id" class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span v-if="idx === 0" class="text-label text-primary shrink-0">PRIMARY</span>
              <span class="text-body text-foreground truncate">
                <template v-if="ing.item_id">{{ itemById(ing.item_id)?.name ?? "Unknown item" }}</template>
                <span v-else class="italic text-muted-foreground">
                  any <template v-if="ing.tags?.length === 1">"{{ ing.tags[0] }}"</template>
                  <template v-else-if="ing.tags">{{ ing.tags.join(" + ") }}</template>
                </span>
              </span>
            </div>
            <span class="font-cinzel text-xs text-muted-foreground shrink-0">× {{ ing.quantity }}</span>
          </div>
        </div>
        <p v-else class="text-body text-muted-foreground italic">No ingredients required.</p>
      </div>
    </div>

    <!-- Modifiers -->
    <div v-if="modifiers?.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">CONDITIONAL MODIFIERS</span>
      </div>
      <div class="p-4 space-y-1.5">
        <div v-for="mod in modifiers" :key="mod.id" class="flex items-center justify-between gap-2">
          <span class="text-body text-foreground">{{ mod.description }}</span>
          <span class="font-cinzel text-xs font-bold text-green-600 dark:text-green-400 shrink-0">+{{ mod.bonus }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconDelete, IconEdit } from '@/lib/icons';
import { useRoute, useRouter } from "vue-router";
import { useConfirm } from "@/composables/useConfirm";
import { useDeleteRecipe, useRecipeIngredients, useRecipeOutputs, useRecipeModifiers } from "@/composables/useCrafting";
import { useItems } from "@/composables/useItems";
import { getDiscipline } from "@/lib/crafting-disciplines";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import type { CraftingRecipe } from "@/types/crafting.types";

const props = defineProps<{ recipe: CraftingRecipe }>();

const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const deleteMut = useDeleteRecipe();

const discipline = computed(() => getDiscipline(props.recipe.discipline));

const { data: allItems } = useItems();
const { data: outputs } = useRecipeOutputs(computed(() => props.recipe.id));
const { data: ingredients } = useRecipeIngredients(computed(() => props.recipe.id));
const { data: modifiers } = useRecipeModifiers(computed(() => props.recipe.id));

function itemById(id: string) {
  return allItems.value?.find((i) => i.id === id);
}

async function handleDelete() {
  const ok = await confirm(`Delete "${props.recipe.name}"? This cannot be undone.`, {
    title: "Delete Recipe",
    confirmLabel: "Delete",
  });
  if (!ok) return;
  await deleteMut.mutateAsync(props.recipe.id);
  router.push("/crafting");
}
</script>
