<template>
  <div v-if="loading" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>

  <EmptyState
    v-else-if="!member"
    title="No linked character"
    description="Link a character to your account to use the notebook."
  >
    <template #action>
      <AppButton :to="{ name: 'play-crafting' }" variant="subtle" size="md" label="Back to the Workshop" />
    </template>
  </EmptyState>

  <EmptyState v-else-if="!discipline" title="Unknown craft" description="There is no notebook for that craft.">
    <template #action>
      <AppButton :to="{ name: 'play-crafting' }" variant="subtle" size="md" label="Back to the Workshop" />
    </template>
  </EmptyState>

  <InventorNotebook v-else :key="discipline.id" :discipline-id="discipline.id" :member="member" :previewing="appUi.dmPreviewMode" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import InventorNotebook from "@/components/crafting/invention/InventorNotebook.vue";
import { usePlayerCrafting } from "@/composables/crafting/usePlayerCrafting";
import { CRAFTING_DISCIPLINES } from "@/lib/crafting/disciplines";
import { useAppUiStore } from "@/stores/ui/app";

/** A craft's inventor's notebook (#1103): finds the character and the craft, then hands over. */
const route = useRoute();
const appUi = useAppUiStore();

// The notebook reads no recipe, so an empty id list keeps the detail reads idle.
const { member, loading } = usePlayerCrafting({ recipeIds: () => [] });

const discipline = computed(() => CRAFTING_DISCIPLINES.find((d) => d.id === route.params.discipline) ?? null);
</script>
