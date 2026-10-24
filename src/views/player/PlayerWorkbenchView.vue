<template>
  <div v-if="loading || !ingredientsReady" class="flex justify-center py-16">
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

  <WorkbenchPlay v-else :recipe="recipe" :member="member" />
</template>
<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useRecipeIngredients } from "@/composables/crafting/useCrafting";
import { usePlayerCrafting } from "@/composables/crafting/usePlayerCrafting";
import AppButton from "@/components/common/controls/AppButton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import WorkbenchPlay from "@/components/crafting/workbench/WorkbenchPlay.vue";

/** A recipe's workbench (#1080): finds the recipe and the character, then hands over to the bench. */
const route = useRoute();
const recipeId = computed(() => String(route.params.recipeId));

const { recipes, member, loading } = usePlayerCrafting({ recipeIds: () => [recipeId.value] });

// The batch reads give no loading state, and a recipe with no ingredients is legal, so the
// bench waits on the single read: an empty slot list before it lands would be an open door.
const { isSuccess: ingredientsReady } = useRecipeIngredients(recipeId);

const recipe = computed(() => (recipes.value ?? []).find((r) => r.id === recipeId.value) ?? null);
</script>
