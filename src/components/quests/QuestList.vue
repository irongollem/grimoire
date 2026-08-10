<template>
  <div>
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!allQuests?.length"
      title="No quests yet"
      description="Track your party's adventures, contracts, and personal goals."
    >
      <template #icon><IconNavQuests class="h-16 w-16" /></template>
      <template #action>
        <AppButton
          to="/quests/new"
          variant="primary"
          size="lg"
          label="Add your first quest"
        />
      </template>
    </EmptyState>

    <!-- The board is a presentational/mutation boundary of its own. Beat-only
         summaries are optional until #658 lands, so legacy quests stay useful. -->
    <QuestKanbanBoard
      v-else-if="isKanban"
      :quests="filtered"
      :all-quests="allQuests ?? []"
      :party="party ?? []"
      :summaries="boardSummaries"
      @move="onMove"
    />

    <!-- List view -->
    <template v-else>
      <p v-if="!filtered.length" class="text-center text-body text-muted-foreground italic py-12">
        No quests match the active filters.
      </p>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <RouterLink
          v-for="quest in filtered"
          :key="quest.id"
          :to="`/quests/${quest.id}`"
          class="group relative flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
        >
          <div class="h-1.5 w-full shrink-0" :style="{ backgroundColor: QUEST_STATUS_COLORS[quest.status] }" />

          <div class="p-3 flex flex-col gap-2 flex-1">
            <div class="flex items-start gap-2">
              <div
                class="h-7 w-7 shrink-0 rounded flex items-center justify-center mt-0.5"
                :style="{ backgroundColor: QUEST_STATUS_COLORS[quest.status] + '22' }"
              >
                <IconScrollText class="h-3.5 w-3.5" :style="{ color: QUEST_STATUS_COLORS[quest.status] }" />
              </div>
              <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight line-clamp-2 flex-1">
                {{ quest.title || "Untitled Quest" }}
              </h3>
            </div>

            <span
              class="self-start px-1.5 py-0.5 rounded text-label font-bold"
              :style="{
                backgroundColor: QUEST_STATUS_COLORS[quest.status] + '22',
                color: QUEST_STATUS_COLORS[quest.status],
              }"
            >
              {{ QUEST_STATUS_LABELS[quest.status] }}
            </span>

            <p v-if="quest.summary" class="text-caption text-muted-foreground italic line-clamp-3 flex-1">
              {{ quest.summary }}
            </p>
            <div v-else class="flex-1" />

            <div class="flex items-end justify-between gap-2 mt-auto">
              <div v-if="quest.tags.length" class="flex flex-wrap gap-1">
                <span
                  v-for="tag in quest.tags.slice(0, 2)"
                  :key="tag"
                  class="px-1.5 py-0.5 rounded bg-muted text-label text-muted-foreground"
                >{{ tag }}</span>
              </div>
              <span class="text-caption-sm text-muted-foreground italic shrink-0 ml-auto">
                {{ timeAgo(quest.updated_at) }}
              </span>
            </div>
          </div>
        </RouterLink>
      </div>

      <p v-if="filtered.length" class="mt-4 text-caption text-muted-foreground italic text-right">
        {{ filtered.length }} of {{ allQuests?.length ?? 0 }} quests
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconNavQuests, IconScrollText } from '@/lib/icons';
import {
  useAllQuests,
  useCampaignQuestRefs,
  useUpdateQuest,
  scheduleQuestTriggers,
} from "@/composables/useQuests";
import { useParty } from "@/composables/useParty";
import { useQuestBoardSummaries } from "@/composables/useQuestFlow";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import AppButton from "@/components/common/AppButton.vue";
import QuestKanbanBoard from "@/components/quests/QuestKanbanBoard.vue";
import { timeAgo } from "@/lib/utils";
import { filterQuestBoard } from "@/lib/quests/board";
import {
  QUEST_STATUS_LABELS,
  QUEST_STATUS_COLORS,
  type QuestStatus,
} from "@/types/quest.types";

const ui = useUiStore();
const campaign = useCampaignStore();
const search = computed(() => ui.questsSearch);
const isKanban = computed(() => ui.questsIsKanban);

const { data: allQuests, isLoading } = useAllQuests();
const { data: party } = useParty(() => isKanban.value);
const { data: campaignRefs } = useCampaignQuestRefs();
const { data: boardSummaries } = useQuestBoardSummaries();
const { mutateAsync: updateQuest } = useUpdateQuest();

const filtered = computed(() => filterQuestBoard(
  allQuests.value ?? [],
  {
    search: search.value,
    partyOnly: ui.questsPartyFilter,
    entity: ui.questsEntityFilter,
    prepGapsOnly: ui.questsPrepGapsFilter,
    pendingLootOnly: ui.questsLootFilter,
  },
  { refs: campaignRefs.value ?? [], summaries: boardSummaries.value },
));

async function onMove({ id, status: targetStatus }: { id: string; status: QuestStatus }) {
  const quest = allQuests.value?.find((q) => q.id === id);
  if (!quest || quest.status === targetStatus) return;

  await updateQuest({ id, update: { status: targetStatus } });

  if (targetStatus === "completed" && campaign.activeCampaignId) {
    void scheduleQuestTriggers(
      id, "quest_complete", null,
      { year: campaign.todayYear, month: campaign.todayMonth, day: campaign.todayDay },
      campaign.activeCampaignId,
    );
  }
}
</script>
