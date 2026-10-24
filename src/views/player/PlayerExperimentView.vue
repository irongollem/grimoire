<template>
  <div v-if="loading" class="flex justify-center py-16">
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

  <EmptyState v-else-if="!discipline" title="Unknown bench" description="There is no bench for that craft.">
    <template #action>
      <AppButton :to="{ name: 'play-crafting' }" variant="subtle" size="md" label="Back to the Workshop" />
    </template>
  </EmptyState>

  <ExperimentBench v-else :key="discipline.id" :discipline-id="discipline.id" :member="member" :crafting="crafting" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import ExperimentBench from "@/components/crafting/workbench/ExperimentBench.vue";
import { usePlayerCrafting } from "@/composables/crafting/usePlayerCrafting";
import { CRAFTING_DISCIPLINES } from "@/lib/crafting/disciplines";

/** A discipline's experiment bench (#1103): finds the character and the discipline, then hands over. */
const route = useRoute();

// No recipe is read here (the bench finds none yet), so an empty id list keeps the detail reads idle.
const crafting = usePlayerCrafting({ recipeIds: () => [] });
const { member, loading } = crafting;

const discipline = computed(() => CRAFTING_DISCIPLINES.find((d) => d.id === route.params.discipline) ?? null);
</script>
