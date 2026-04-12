<template>
  <ListPageLayout title="Species" description="Playable species & subspecies compendium">
    <template #actions>
      <ListActionButton
        :icon="Download"
        label="Import Open5e"
        @click="ui.speciesOpen5ePanelOpen = true"
      />
      <ListActionButton
        :icon="Plus"
        label="New Species"
        variant="primary"
        to="/species/new"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.speciesHasActiveFilters"
        @clear="ui.resetSpeciesFilters()"
      >
        <ListSearchInput v-model="ui.speciesSearch" placeholder="Search species…" />
        <ListFilterGroup
          v-model="ui.speciesFilterSize"
          :options="SIZE_OPTIONS"
          aria-label="Species size filter"
        />
      </ListFilterBar>
    </template>

    <SpeciesList />
    <SpeciesOpen5ePanel />
  </ListPageLayout>
</template>

<script setup lang="ts">
import { Plus, Download } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import SpeciesList from "@/components/species/SpeciesList.vue";
import SpeciesOpen5ePanel from "@/components/species/SpeciesOpen5ePanel.vue";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();

const SIZE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "tiny", label: "Tiny" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;
</script>
