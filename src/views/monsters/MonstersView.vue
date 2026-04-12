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
        <!-- Source has 3 options → a segmented pill group fits naturally. -->
        <ListFilterGroup
          v-model="ui.monstersFilterSource"
          :options="SOURCE_OPTIONS"
          aria-label="Source filter"
        />
        <!--
          Type covers all 14 standard D&D creature types — too many to sit as
          a button row without causing weird widths and wrap on mobile. A
          native select lists them compactly and uses the OS picker on
          touch devices (keeps iOS wheel / Android bottom-sheet).
        -->
        <ListFilterSelect
          v-model="ui.monstersFilterType"
          aria-label="Monster type filter"
        >
          <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </ListFilterSelect>
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
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import MonsterList from "@/components/monsters/MonsterList.vue";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();

const SOURCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "srd", label: "SRD" },
  { value: "custom", label: "Custom" },
] as const;

// All 14 standard D&D 5e creature types. Keeping in alphabetical order after
// "All" so the picker reads predictably on both mobile wheels and desktop.
const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "aberration", label: "Aberration" },
  { value: "beast", label: "Beast" },
  { value: "celestial", label: "Celestial" },
  { value: "construct", label: "Construct" },
  { value: "dragon", label: "Dragon" },
  { value: "elemental", label: "Elemental" },
  { value: "fey", label: "Fey" },
  { value: "fiend", label: "Fiend" },
  { value: "giant", label: "Giant" },
  { value: "humanoid", label: "Humanoid" },
  { value: "monstrosity", label: "Monstrosity" },
  { value: "ooze", label: "Ooze" },
  { value: "plant", label: "Plant" },
  { value: "undead", label: "Undead" },
] as const;
</script>
