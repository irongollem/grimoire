<template>
  <PageHeader title="Bestiary" description="Your custom monster compendium">
    <template #actions>
      <RouterLink
        to="/monsters/new"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
      >
        <Plus class="h-3.5 w-3.5" />
        New Monster
      </RouterLink>
    </template>

    <template #sticky>
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative flex-1 min-w-48">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            v-model="ui.monstersSearch"
            type="text"
            placeholder="Search monsters…"
            class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
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

        <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
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

        <button
          v-if="ui.monstersHasActiveFilters"
          type="button"
          class="px-2.5 py-1.5 rounded-md border border-border bg-card font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          @click="ui.resetMonstersFilters()"
        >
          Clear
        </button>
      </div>
    </template>

    <MonsterList />
  </PageHeader>
</template>

<script setup lang="ts">
import { Plus, Search } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
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
