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
        v-if="isAiEnabled"
        :icon="IconGenerate"
        label="Generate"
        @click="questsUi.questGeneratorOpen = true"
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
        :has-active-filters="questsUi.questsHasActiveFilters"
        @clear="questsUi.resetQuestsFilters()"
      >
        <ListSearchInput
          v-model="questsUi.questsSearch"
          placeholder="Search quests…"
        />
        <AppButton
          :icon="IconParty"
          :label="filterCounts ? `Shared with party (${filterCounts.party})` : 'Shared with party'"
          :mobile-label="filterCounts ? `Party ${filterCounts.party}` : 'Party'"
          variant="subtle"
          size="md"
          :active="questsUi.questsPartyFilter"
          :aria-pressed="questsUi.questsPartyFilter"
          @click="questsUi.questsPartyFilter = !questsUi.questsPartyFilter"
        />
        <EntityCombobox
          v-if="entityOptions?.length"
          v-model="questsUi.questsEntityFilter"
          :options="entityOptions"
          placeholder="NPC, faction, or location…"
          class="min-w-48 max-w-full flex-1 sm:max-w-64 sm:flex-none"
        />
        <AppButton
          v-if="boardSummaries !== undefined"
          :icon="IconWarning"
          :label="filterCounts ? `Prep gaps (${filterCounts.prepGaps})` : 'Prep gaps'"
          :mobile-label="filterCounts ? `Gaps ${filterCounts.prepGaps}` : 'Gaps'"
          variant="subtle"
          size="md"
          :active="questsUi.questsPrepGapsFilter"
          :aria-pressed="questsUi.questsPrepGapsFilter"
          @click="questsUi.questsPrepGapsFilter = !questsUi.questsPrepGapsFilter"
        />
        <AppButton
          v-if="boardSummaries !== undefined"
          :icon="IconLoot"
          :label="filterCounts ? `Loot pending (${filterCounts.pendingLoot})` : 'Loot pending'"
          :mobile-label="filterCounts ? `Loot ${filterCounts.pendingLoot}` : 'Loot'"
          variant="subtle"
          size="md"
          :active="questsUi.questsLootFilter"
          :aria-pressed="questsUi.questsLootFilter"
          @click="questsUi.questsLootFilter = !questsUi.questsLootFilter"
        />
        <!--
          View-toggle — reuses AppButton for consistent styling. Label
          stays visible on mobile because it complements the icon (without
          it the icon alone is ambiguous between Kanban/List).
        -->
        <AppButton
          size="md"
          variant="subtle"
          :icon="questsUi.questsIsKanban ? IconColumns : IconListView"
          :label="questsUi.questsIsKanban ? 'Kanban' : 'List'"
          :tooltip="
            questsUi.questsIsKanban ? 'Switch to list view' : 'Switch to kanban view'
          "
          @click="questsUi.questsIsKanban = !questsUi.questsIsKanban"
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
import ListPageLayout from "@/components/common/list/ListPageLayout.vue";
import ListActionButton from "@/components/common/list/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import ListFilterBar from "@/components/common/list/ListFilterBar.vue";
import ListSearchInput from "@/components/common/list/ListSearchInput.vue";
import QuestList from "@/components/quests/QuestList.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { useCreateGate } from "@/composables/billing/useCreateGate";
import { useQuestsUiStore } from "@/stores/ui/quests";
import { useCampaignStore } from "@/stores/campaign";
import { useQuests, useCampaignQuestRefs, useQuestFilterEntities } from "@/composables/quests/useQuests";
import { useQuestBoardSummaries } from "@/composables/quests/useQuestFlow";
import { countQuestBoardFilters } from "@/lib/quests/board";

const questsUi = useQuestsUiStore();
const campaignStore = useCampaignStore();
const isAiEnabled = computed(() => campaignStore.isAiEnabled);
const { data: entityOptions } = useQuestFilterEntities();
const { data: allQuests } = useQuests();
const { data: campaignRefs } = useCampaignQuestRefs();
const { data: boardSummaries } = useQuestBoardSummaries();
// Null until the quests arrive: counting an unanswered query as an empty one
// would put "(0)" on every chip, and "0 active" in the header, while a full
// campaign is still loading.
const filterCounts = computed(() => allQuests.value && countQuestBoardFilters(
  allQuests.value,
  {
    search: questsUi.questsSearch,
    partyOnly: questsUi.questsPartyFilter,
    entity: questsUi.questsEntityFilter,
    prepGapsOnly: questsUi.questsPrepGapsFilter,
    pendingLootOnly: questsUi.questsLootFilter,
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
  const quests = allQuests.value;
  if (!quests) return undefined;
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
