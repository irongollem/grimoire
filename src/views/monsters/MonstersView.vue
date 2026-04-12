<template>
  <ListPageLayout title="Bestiary" description="Your custom monster compendium">
    <template #actions>
      <ListActionButton
        :icon="Wand2"
        label="Generate"
        @click="ui.monsterGeneratorOpen = true"
      />
      <ListActionButton
        :icon="Plus"
        label="New Monster"
        variant="primary"
        to="/monsters/new"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.monstersHasActiveFilters"
        @clear="ui.resetMonstersFilters()"
      >
        <ListSearchInput v-model="ui.monstersSearch" placeholder="Search monsters…" />
        <ListFilterGroup
          v-model="ui.monstersFilterSource"
          :options="SOURCE_OPTIONS"
          aria-label="Source filter"
        />
        <ListFilterGroup
          v-model="ui.monstersFilterType"
          :options="TYPE_OPTIONS"
          aria-label="Monster type filter"
        />
      </ListFilterBar>
    </template>

    <MonsterList />
  </ListPageLayout>
</template>

<script setup lang="ts">
import { Plus, Wand2 } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import MonsterList from "@/components/monsters/MonsterList.vue";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();

const SOURCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "srd", label: "SRD" },
  { value: "custom", label: "Custom" },
] as const;

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "beast", label: "Beast" },
  { value: "humanoid", label: "Humanoid" },
  { value: "undead", label: "Undead" },
  { value: "fiend", label: "Fiend" },
  { value: "dragon", label: "Dragon" },
  { value: "giant", label: "Giant" },
  { value: "monstrosity", label: "Monstrosity" },
] as const;
</script>
