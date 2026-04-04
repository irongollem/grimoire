<template>
  <PageHeader title="Quest Log" description="Track active quests, side jobs, and completed adventures">
    <template #actions>
      <RouterLink
        to="/quests/new"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
      >
        <Plus class="h-3.5 w-3.5" />
        New Quest
      </RouterLink>
    </template>

    <template #sticky>
      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            v-model="ui.questsSearch"
            type="text"
            placeholder="Search quests…"
            class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <button
          type="button"
          :title="ui.questsIsKanban ? 'Switch to list view' : 'Switch to kanban view'"
          class="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
          @click="ui.questsIsKanban = !ui.questsIsKanban"
        >
          <Columns2 v-if="ui.questsIsKanban" class="h-3.5 w-3.5" />
          <LayoutList v-else class="h-3.5 w-3.5" />
          <span class="font-cinzel text-[10px] font-semibold tracking-wider">{{ ui.questsIsKanban ? 'Kanban' : 'List' }}</span>
        </button>
        <button
          v-if="ui.questsHasActiveFilters"
          type="button"
          class="shrink-0 px-2.5 py-1.5 rounded-md border border-border bg-card font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          @click="ui.resetQuestsFilters()"
        >
          Clear
        </button>
      </div>
    </template>

    <QuestList />
  </PageHeader>
</template>

<script setup lang="ts">
import { Plus, Search, Columns2, LayoutList } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import QuestList from "@/components/quests/QuestList.vue";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();
</script>
