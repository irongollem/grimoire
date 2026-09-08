<template>
  <ListPageLayout
    title="Quest Log"
    :description="headerLine"
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
          :label="`Shared with party (${filterCounts.party})`"
          :mobile-label="`Party ${filterCounts.party}`"
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
          placeholder="NPC, faction, or location…"
          class="min-w-48 max-w-full flex-1 sm:max-w-64 sm:flex-none"
        />
        <AppButton
          v-if="boardSummaries !== undefined"
          :icon="IconWarning"
          :label="`Prep gaps (${filterCounts.prepGaps})`"
          :mobile-label="`Gaps ${filterCounts.prepGaps}`"
          variant="subtle"
          size="md"
          :active="ui.questsPrepGapsFilter"
          :aria-pressed="ui.questsPrepGapsFilter"
          @click="ui.questsPrepGapsFilter = !ui.questsPrepGapsFilter"
        />
        <AppButton
          v-if="boardSummaries !== undefined"
          :icon="IconLoot"
          :label="`Loot pending (${filterCounts.pendingLoot})`"
          :mobile-label="`Loot ${filterCounts.pendingLoot}`"
          variant="subtle"
          size="md"
          :active="ui.questsLootFilter"
          :aria-pressed="ui.questsLootFilter"
          @click="ui.questsLootFilter = !ui.questsLootFilter"
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
import { computed } from "vue";
import { IconAdd, IconColumns, IconGenerate, IconListView, IconLoot, IconParty, IconWarning } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/AppButton.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import QuestList from "@/components/quests/QuestList.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useCreateGate } from "@/composables/billing/useCreateGate";
import { useUiStore } from "@/stores/ui";
import { useAllQuests, useCampaignQuestRefs, useQuestFilterEntities } from "@/composables/quests/useQuests";
import { useQuestBoardSummaries } from "@/composables/quests/useQuestFlow";
import { countQuestBoardFilters } from "@/lib/quests/board";

const ui = useUiStore();
const { data: entityOptions } = useQuestFilterEntities();
const { data: allQuests } = useAllQuests();
const { data: campaignRefs } = useCampaignQuestRefs();
const { data: boardSummaries } = useQuestBoardSummaries();
const filterCounts = computed(() => countQuestBoardFilters(
  allQuests.value ?? [],
  {
    search: ui.questsSearch,
    partyOnly: ui.questsPartyFilter,
    entity: ui.questsEntityFilter,
    prepGapsOnly: ui.questsPrepGapsFilter,
    pendingLootOnly: ui.questsLootFilter,
  },
  { refs: campaignRefs.value ?? [], summaries: boardSummaries.value },
));
const { showPaywall, handleNew } = useCreateGate("quests", "/quests/new");

/**
 * Frame `07 Log`'s header line: "N active · N threads live across N quests ·
 * N prep gaps". Deliberately whole-campaign, not filtered — this is the
 * table's overall state, not a count of what the current search happens to
 * show, so it reads off `allQuests`/`boardSummaries` directly rather than
 * `filterCounts` (which composes with whatever filters are active).
 *
 * The mockup's line also names a next-session date ("… before Thursday").
 * No such field exists anywhere in the data — `SessionProposal.proposed_date`
 * is the nearest thing and is not "the next session" — so it is left out
 * rather than invented.
 */
const headerLine = computed(() => {
  const quests = allQuests.value ?? [];
  const summaries = boardSummaries.value;
  const activeCount = quests.filter((quest) => quest.status === "active").length;
  let threadsLive = 0;
  let questsWithLiveThread = 0;
  let prepGapsTotal = 0;
  for (const quest of quests) {
    const summary = summaries?.[quest.id];
    if (!summary) continue;
    if (summary.liveThreadCount > 0) {
      threadsLive += summary.liveThreadCount;
      questsWithLiveThread += 1;
    }
    prepGapsTotal += summary.prepGapCount;
  }
  return `${activeCount} active · ${threadsLive} thread${threadsLive === 1 ? "" : "s"} live across ${questsWithLiveThread} quest${questsWithLiveThread === 1 ? "" : "s"} · ${prepGapsTotal} prep gap${prepGapsTotal === 1 ? "" : "s"}`;
});
</script>
