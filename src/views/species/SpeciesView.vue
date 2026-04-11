<template>
  <PageHeader title="Species" description="Playable species & subspecies compendium">
    <template #actions>
      <div class="flex gap-2">
        <button
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-foreground tracking-wider hover:bg-accent hover:text-accent-foreground transition-colors"
          @click="ui.speciesOpen5ePanelOpen = true"
        >
          <Download class="h-3.5 w-3.5" />
          Import Open5e
        </button>
        <RouterLink
          to="/species/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          <Plus class="h-3.5 w-3.5" />
          New Species
        </RouterLink>
      </div>
    </template>

    <template #sticky>
      <div class="flex flex-wrap items-center gap-2">
        <!-- Search -->
        <div class="relative flex-1 min-w-48">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            v-model="ui.speciesSearch"
            type="text"
            placeholder="Search species…"
            class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <!-- Size filter -->
        <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
          <button
            v-for="s in SIZE_OPTIONS"
            :key="s.value"
            class="px-2.5 py-1.5 transition-colors"
            :class="ui.speciesFilterSize === s.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="ui.speciesFilterSize = s.value"
          >
            {{ s.label }}
          </button>
        </div>

        <!-- Clear -->
        <button
          v-if="ui.speciesHasActiveFilters"
          type="button"
          class="px-2.5 py-1.5 rounded-md border border-border bg-card font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          @click="ui.resetSpeciesFilters()"
        >
          Clear
        </button>
      </div>
    </template>

    <SpeciesList />
    <SpeciesOpen5ePanel />
  </PageHeader>
</template>

<script setup lang="ts">
import { Plus, Search, Download } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
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
];
</script>
