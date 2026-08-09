<template>
  <ListPageLayout
    title="Quest Log"
    description="Track active quests, side jobs, and completed adventures"
  >
    <template #title-suffix>
      <ManualHelpLink page="quest-log" />
    </template>

    <template #actions>
      <ListActionButton
        :icon="IconGenerate"
        label="Generate"
        @click="ui.questGeneratorOpen = true"
      />
      <ListActionButton
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
        <AppButton
          :icon="IconParty"
          label="Shared with party"
          mobile-label="Party"
          variant="subtle"
          size="md"
          :active="ui.questsPartyFilter"
          :aria-pressed="ui.questsPartyFilter"
          @click="ui.questsPartyFilter = !ui.questsPartyFilter"
        />
        <EntityCombobox
          v-if="entityOptions?.length"
          v-model="ui.questsEntityFilter"
          :options="entityOptions"
          placeholder="NPC or location…"
          class="min-w-48 max-w-64 flex-none"
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
import { IconAdd, IconColumns, IconGenerate, IconListView, IconParty } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/AppButton.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import QuestList from "@/components/quests/QuestList.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useCreateGate } from "@/composables/useCreateGate";
import { useUiStore } from "@/stores/ui";
import { useQuestFilterEntities } from "@/composables/useQuests";

const ui = useUiStore();
const { data: entityOptions } = useQuestFilterEntities();
const { showPaywall, handleNew } = useCreateGate("quests", "/quests/new");
</script>
