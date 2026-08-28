<template>
  <!--
    Every quest, once.

    The dashboard carried three cards — chains holding a live cursor, the active
    lane, and the rumor lane. All three ask about quests, each stood mostly empty
    while together pushing the page past the first screen, and a quest being
    played appeared in two of them at the same time.

    Merging them is not stacking them, and it is not grouping them either. Stage
    headings were the second wrong answer: once quests are properly built out,
    every active quest holds a cursor, so "Party is here" and "Active" would
    contain the same quests under two headings — and the heading repeated what
    the row's own badge already said.

    So it is one list, sorted by where each quest is in its life, with the stage
    on the row. A rumor and an active quest are the same thing at different
    stages, so only the dot and the trailing label differ.
  -->
  <DashboardWidget
    tour="dm-quests"
    title="Quests"
    :count="rows.length || null"
    to="/quests"
    action-label="Quest log →"
    :loading="questsLoading && chainsLoading"
    :empty="!rows.length"
    empty-text="No quests yet."
  >
    <template #empty>
      <p class="text-body text-muted-foreground italic">No quests yet.</p>
      <AppButton to="/quests/new" variant="link" size="inline" class="mt-1" label="+ New Quest" />
    </template>

    <div class="p-2">
      <DashboardQuestRow v-for="row in rows" :key="row.id" :row="row" />
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import DashboardWidget from "../DashboardWidget.vue";
import DashboardQuestRow from "../DashboardQuestRow.vue";
import { buildQuestRows } from "@/lib/dashboard/questRows";
import { useAllQuests } from "@/composables/quests/useQuests";
import { useCampaignLiveQuests } from "@/composables/quests/useQuestFlow";
import { useNpcs } from "@/composables/npcs/useNpcs";
import type { Quest } from "@/types/quest.types";

const { data: allQuests, isLoading: questsLoading } = useAllQuests();
const { data: liveChains, isLoading: chainsLoading } = useCampaignLiveQuests();
const { data: npcs } = useNpcs();

const activeQuests = computed(() => (allQuests.value ?? []).filter((q) => q.status === "active"));
const rumorQuests = computed(() => (allQuests.value ?? []).filter((q) => q.status === "rumor"));

function giverName(quest: Quest): string | null {
  if (!quest.giver_npc_id) return null;
  return (npcs.value ?? []).find((n) => n.id === quest.giver_npc_id)?.name ?? null;
}

const rows = computed(() =>
  buildQuestRows(liveChains.value ?? [], activeQuests.value, rumorQuests.value, giverName),
);
</script>
