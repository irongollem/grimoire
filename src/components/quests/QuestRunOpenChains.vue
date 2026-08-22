<template>
  <section
    v-if="chains.length"
    aria-labelledby="open-chains-heading"
    class="space-y-2 rounded-xl border border-border bg-card p-3"
  >
    <div>
      <h2 id="open-chains-heading" class="font-cinzel text-sm font-bold text-foreground">Also open</h2>
      <!-- The distinction that matters at the table: switching chains costs
           nothing, while Jump moves a cursor and asks why. -->
      <p class="text-caption text-muted-foreground">Switching is just navigation — no cursor moves and nothing is recorded.</p>
    </div>
    <RouterLink
      v-for="chain in chains"
      :key="chain.quest_id"
      :to="{ path: `/quests/${chain.quest_id}`, query: { mode: 'run' } }"
      class="flex items-start gap-2 rounded-lg border border-border p-2 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <IconParty
        class="mt-0.5 h-3.5 w-3.5 shrink-0"
        :class="chain.runtime_status === 'running' ? 'text-primary' : 'text-muted-foreground'"
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1">
        <span class="block truncate font-fell text-body font-semibold text-foreground">{{ chain.quest_title }}</span>
        <span class="block truncate text-caption text-muted-foreground">{{ chain.beat_title }}</span>
      </span>
      <span
        v-if="chain.runtime_status === 'paused'"
        class="shrink-0 text-label uppercase tracking-wide text-muted-foreground"
      >Paused</span>
    </RouterLink>
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { IconParty } from "@/lib/icons";
import type { CampaignLiveQuest } from "@/types/quest.types";

/**
 * The chains the party has open besides the one being run.
 *
 * This is the view that a single campaign-wide cursor could not produce: "live"
 * used to be one row, so a suspended main quest and a converging second quest
 * were both invisible while a third was on screen.
 */
defineProps<{ chains: CampaignLiveQuest[] }>();
</script>
