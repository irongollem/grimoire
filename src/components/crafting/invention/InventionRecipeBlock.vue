<template>
  <section class="flex flex-col gap-2" aria-label="Recipe">
    <!-- The recipe usually shares the item's name; say "Recipe" then, rather than the title twice. -->
    <h4 class="text-label-lg font-semibold text-foreground">
      {{ draft.recipe.name === draft.item.name ? "Recipe" : `Recipe: ${draft.recipe.name}` }}
    </h4>
    <p class="text-body text-muted-foreground">{{ recipeDescriptionText(draft.recipe) }}</p>
    <p class="text-caption text-muted-foreground">{{ inventionRequirementLine(draft.recipe, tool) }}</p>
    <p v-if="draft.recipe.special_requirement" class="text-caption text-foreground">
      Also needs: {{ draft.recipe.special_requirement }}
    </p>

    <ul class="flex flex-col divide-y divide-border rounded-md border border-border">
      <li v-for="(ing, i) in draft.ingredients" :key="i" class="flex items-baseline gap-2 px-3 py-1.5">
        <span class="min-w-0 flex-1 text-body text-foreground">
          <span class="tabular-nums text-muted-foreground">{{ ing.quantity }}&times;</span>
          {{ ing.name }}
          <span
            v-if="ingredientIsNew(ing)"
            class="ml-1 rounded border border-gold-500/40 bg-gold-500/10 px-1 text-label text-foreground"
          >New material</span>
        </span>
        <span class="shrink-0 text-caption tabular-nums text-muted-foreground">
          {{ inventionValueText(ing.value_cp) }}<template v-if="ing.quantity > 1"> each</template>
        </span>
      </li>
    </ul>

    <p class="text-caption text-muted-foreground">
      Materials worth {{ inventionValueText(draft.materials_value_cp) }}, so up to
      {{ inventionValueText(draft.value_limit_cp) }}.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { getDiscipline } from "@/lib/crafting/disciplines";
import {
  ingredientIsNew,
  inventionRequirementLine,
  inventionValueText,
  recipeDescriptionText,
} from "@/lib/crafting/invention";
import type { CraftingDiscipline, InventionDraft } from "@/types/crafting.types";

const { draft, discipline } = defineProps<{ draft: InventionDraft; discipline: CraftingDiscipline }>();

// The first tool is the discipline's primary one, the name shown everywhere.
const tool = computed(() => getDiscipline(discipline).tools[0]);
</script>
