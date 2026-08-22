<template>
  <section
    v-if="chains.length"
    aria-labelledby="open-chains-heading"
    class="space-y-1 rounded-xl border border-border bg-card p-3"
  >
    <div class="px-2">
      <h2 id="open-chains-heading" class="font-cinzel text-sm font-bold text-foreground">Also open</h2>
      <!-- The distinction that matters at the table: switching chains costs
           nothing, while Jump moves a cursor and asks why. -->
      <p class="text-caption text-muted-foreground">Switching is just navigation — no cursor moves and nothing is recorded.</p>
    </div>
    <QuestChainRow v-for="chain in chains" :key="chain.quest_id" :chain="chain" />
  </section>
</template>

<script setup lang="ts">
import QuestChainRow from "./QuestChainRow.vue";
import type { CampaignLiveQuest } from "@/types/quest.types";

/**
 * The chains the party has open besides the one being run.
 *
 * This is the view a single campaign-wide cursor could not produce: "live" used
 * to be one row, so a suspended main quest and a converging second quest were
 * both invisible while a third was on screen.
 */
defineProps<{ chains: CampaignLiveQuest[] }>();
</script>
