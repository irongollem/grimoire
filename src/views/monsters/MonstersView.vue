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
      <div class="flex flex-wrap items-center gap-2 min-w-max md:min-w-0">
        <div class="relative flex-1 min-w-48">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            v-model="ui.monstersSearch"
            type="text"
            placeholder="Search monsters…"
            class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider shrink-0">
          <button
            v-for="s in SOURCE_OPTIONS"
            :key="s.value"
            class="px-2.5 py-1.5 transition-colors"
            :class="ui.monstersFilterSource === s.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="ui.monstersFilterSource = s.value"
          >
            {{ s.label }}
          </button>
        </div>

        <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider shrink-0">
          <button
            v-for="t in TYPE_OPTIONS"
            :key="t.value"
            class="px-2.5 py-1.5 transition-colors"
            :class="ui.monstersFilterType === t.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="ui.monstersFilterType = t.value"
          >
            {{ t.label }}
          </button>
        </div>

        <ListActionButton
          v-if="ui.monstersHasActiveFilters"
          label="Clear"
          variant="ghost"
          :collapse-on-mobile="false"
          @click="ui.resetMonstersFilters()"
        />
      </div>
    </template>

    <MonsterList />
  </ListPageLayout>
</template>

<script setup lang="ts">
import { Plus, Search, Wand2 } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import MonsterList from "@/components/monsters/MonsterList.vue";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();

const SOURCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "srd", label: "SRD" },
  { value: "custom", label: "Custom" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "beast", label: "Beast" },
  { value: "humanoid", label: "Humanoid" },
  { value: "undead", label: "Undead" },
  { value: "fiend", label: "Fiend" },
  { value: "dragon", label: "Dragon" },
  { value: "giant", label: "Giant" },
  { value: "monstrosity", label: "Monstrosity" },
];
</script>
