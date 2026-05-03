<template>
  <ListPageLayout
    title="Quest Log"
    description="Track active quests, side jobs, and completed adventures"
  >
    <template #actions>
      <ListActionButton
        :icon="Wand2"
        label="Generate"
        @click="ui.questGeneratorOpen = true"
      />
      <ListActionButton
        :icon="Plus"
        label="New Quest"
        mobile-label="Quest"
        variant="primary"
        to="/quests/new"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.questsHasActiveFilters"
        @clear="ui.resetQuestsFilters()"
      >
        <ListSearchInput
          v-model="ui.questsSearch"
          placeholder="Search quests…"
        />
        <!--
          View-toggle — reuses ListActionButton for consistent styling. Label
          stays visible on mobile because it complements the icon (without
          it the icon alone is ambiguous between Kanban/List).
        -->
        <ListActionButton
          :icon="ui.questsIsKanban ? Columns2 : LayoutList"
          :label="ui.questsIsKanban ? 'Kanban' : 'List'"
          :collapse-on-mobile="false"
          variant="ghost"
          :tooltip="
            ui.questsIsKanban ? 'Switch to list view' : 'Switch to kanban view'
          "
          @click="ui.questsIsKanban = !ui.questsIsKanban"
        />
      </ListFilterBar>
    </template>

    <QuestList />
  </ListPageLayout>
</template>

<script setup lang="ts">
import { Plus, Columns2, LayoutList, Wand2 } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import QuestList from "@/components/quests/QuestList.vue";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();
</script>
