<template>
  <div class="flex gap-1.5" role="group" aria-label="Show">
    <AppButton size="sm" :active="ui.familyShowDead" label="The dead" @click="ui.familyShowDead = !ui.familyShowDead" />
    <AppButton size="sm" :active="ui.familyShowMarriedIn" label="Married in" @click="ui.familyShowMarriedIn = !ui.familyShowMarriedIn" />
    <AppButton size="sm" :active="ui.familyShowPcs" label="PCs" @click="ui.familyShowPcs = !ui.familyShowPcs" />
    <AppButton v-if="ui.familyHasActiveFilters" variant="link" size="sm" label="Clear" @click="ui.resetFamilyFilters()" />
  </div>
</template>

<script setup lang="ts">
/** The "Show" toggles shared by the person tree and a House's lineage. */
import AppButton from "@/components/common/controls/AppButton.vue";
import { useFamilyUiStore } from "@/stores/ui/family";

const ui = useFamilyUiStore();
</script>
