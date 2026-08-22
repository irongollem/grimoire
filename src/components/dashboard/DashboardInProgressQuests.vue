<template>
  <div data-tour="dm-in-progress" class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
      <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">In progress</h2>
      <AppButton to="/quests" variant="link" size="inline-xs" label="Quest log →" />
    </div>

    <div v-if="isLoading" class="flex justify-center py-6"><LoadingSpinner /></div>

    <div v-else-if="!chains.length" class="px-4 py-6 text-center">
      <p class="text-body text-muted-foreground italic">No chains are open.</p>
      <p class="mt-1 text-caption text-muted-foreground">Open a quest and start its run to pick up where the party left off.</p>
    </div>

    <div v-else class="p-2">
      <!-- Running first, then paused: `get_campaign_live_quests` already orders
           them that way, so the split is a heading rather than a re-sort. -->
      <template v-if="running.length">
        <p class="px-2 pb-1 text-label uppercase tracking-wide text-primary">Party is here</p>
        <QuestChainRow v-for="chain in running" :key="chain.quest_id" :chain="chain" />
      </template>

      <template v-if="paused.length">
        <p class="px-2 pb-1 text-label uppercase tracking-wide text-muted-foreground" :class="running.length ? 'pt-3' : ''">
          Open, not being played
        </p>
        <QuestChainRow v-for="chain in paused" :key="chain.quest_id" :chain="chain" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import QuestChainRow from "@/components/quests/QuestChainRow.vue";
import type { CampaignLiveQuest } from "@/types/quest.types";

/**
 * Every chain the party has open, which is the question the dashboard could not
 * previously ask: "Active Quests" read `quests.status` alone, and starting a run
 * never wrote to it.
 *
 * Running and paused are separated rather than merged. After a session ends,
 * `end_campaign_quest_session` pauses every chain at its beat — so the paused
 * set is the normal between-sessions view, and a panel that called all of it
 * "live" would claim the party is mid-scene in six quests on a Sunday afternoon.
 */
const { chains, isLoading = false } = defineProps<{
  chains: CampaignLiveQuest[];
  isLoading?: boolean;
}>();

const running = computed(() => chains.filter((chain) => chain.runtime_status === "running"));
const paused = computed(() => chains.filter((chain) => chain.runtime_status === "paused"));
</script>
