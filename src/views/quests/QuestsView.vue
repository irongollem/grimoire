<template>
  <ListPageLayout
    title="Quest Log"
    description="Track active quests, side jobs, and completed adventures"
  >
    <template #title-suffix>
      <ManualHelpLink page="quest-log" />
    </template>

    <template #actions>
      <AppButton
        size="md"
        collapse-label-on-mobile
        variant="outline"
        :icon="IconGenerate"
        label="Generate"
        @click="ui.questGeneratorOpen = true"
      />
      <AppButton
        size="md"
        collapse-label-on-mobile
        variant="primary"
        :icon="IconAdd"
        label="New Quest"
        mobile-label="Quest"
        @click="handleNew"
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
          View-toggle — reuses AppButton for consistent styling. Label
          stays visible on mobile because it complements the icon (without
          it the icon alone is ambiguous between Kanban/List).
        -->
        <AppButton
          size="md"
          variant="subtle"
          :icon="ui.questsIsKanban ? IconColumns : IconListView"
          :label="ui.questsIsKanban ? 'Kanban' : 'List'"
          :tooltip="
            ui.questsIsKanban ? 'Switch to list view' : 'Switch to kanban view'
          "
          @click="ui.questsIsKanban = !ui.questsIsKanban"
        />
      </ListFilterBar>
    </template>

    <QuestList />
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="quests" />
</template>

<script setup lang="ts">
import { IconAdd, IconColumns, IconGenerate, IconListView } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/AppButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import QuestList from "@/components/quests/QuestList.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useCreateGate } from "@/composables/useCreateGate";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();
const { showPaywall, handleNew } = useCreateGate("quests", "/quests/new");
</script>
