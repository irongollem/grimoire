<template>
  <div v-if="loading || !recipeDetailsReady" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>

  <EmptyState
    v-else-if="!member"
    title="No linked character"
    description="Link a character to your account to use the workbench."
  >
    <template #action>
      <AppButton :to="{ name: 'play-crafting' }" variant="subtle" size="md" label="Back to the Workshop" />
    </template>
  </EmptyState>

  <EmptyState
    v-else-if="!recipe"
    title="Recipe not available"
    description="Your DM may have taken it back, or it was never shared with you."
  >
    <template #action>
      <AppButton :to="{ name: 'play-crafting' }" variant="subtle" size="md" label="Back to the Workshop" />
    </template>
  </EmptyState>

  <WorkbenchPlay v-else :recipe="recipe" :member="member" :crafting="crafting" />
</template>
<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { usePlayerCrafting } from "@/composables/crafting/usePlayerCrafting";
import AppButton from "@/components/common/controls/AppButton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import WorkbenchPlay from "@/components/crafting/workbench/WorkbenchPlay.vue";

/** A recipe's workbench (#1080): finds the recipe and the character, then hands over to the bench. */
const route = useRoute();
const recipeId = computed(() => String(route.params.recipeId));

// A recipe with no ingredients is legal, so the bench waits for the recipe's ingredient, output and
// modifier reads to land: an empty slot list before then would be an open door. These are the same
// queries the bench reads, so once they have landed here they are already in its cache.
// One instance for the route: the bench receives it rather than building its own.
const crafting = usePlayerCrafting({ recipeIds: () => [recipeId.value] });
const { recipes, member, loading, recipeDetailsReady } = crafting;

const recipe = computed(() => (recipes.value ?? []).find((r) => r.id === recipeId.value) ?? null);
</script>
