<template>
  <PageHeader title="Encounters" description="Build and run combat encounters">
    <template #actions>
      <RouterLink
        to="/encounters/new"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
      >
        New Encounter
      </RouterLink>
    </template>

    <template #sticky>
      <div class="flex items-center gap-2">
        <div class="relative flex-1 min-w-48">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            v-model="ui.encountersSearch"
            type="text"
            placeholder="Search encounters…"
            class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <select
          v-model="ui.encountersFilterQuestId"
          class="bg-card border border-border rounded-md px-2 py-1.5 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All quests</option>
          <option value="unassigned">Unassigned</option>
          <option v-for="q in quests" :key="q.id" :value="q.id">{{ q.title }}</option>
        </select>
        <button
          type="button"
          class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md border font-cinzel text-xs tracking-wider transition-colors"
          :class="ui.encountersHideFinished
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:text-foreground'"
          @click="ui.encountersHideFinished = !ui.encountersHideFinished"
        >
          <CheckCheck class="h-3.5 w-3.5" />
          {{ ui.encountersHideFinished ? 'Active only' : 'All' }}
        </button>
        <button
          v-if="ui.encountersHasActiveFilters"
          type="button"
          class="shrink-0 px-2.5 py-1.5 rounded-md border border-border bg-card font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          @click="ui.resetEncountersFilters()"
        >
          Clear
        </button>
      </div>
    </template>

    <EncounterList />
  </PageHeader>
</template>

<script setup lang="ts">
import { Search, CheckCheck } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import EncounterList from "@/components/encounters/EncounterList.vue";
import { useUiStore } from "@/stores/ui";
import { useAllQuests } from "@/composables/useQuests";

const ui = useUiStore();
const { data: quests } = useAllQuests();
</script>
