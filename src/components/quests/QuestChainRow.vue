<template>
  <RouterLink
    :to="{ path: `/quests/${chain.quest_id}`, query: { mode: 'run' } }"
    class="flex items-start gap-2 rounded-lg p-2 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
  >
    <IconParty
      class="mt-0.5 h-3.5 w-3.5 shrink-0"
      :class="chain.runtime_status === 'running' ? 'text-primary' : 'text-muted-foreground'"
      aria-hidden="true"
    />
    <span class="min-w-0 flex-1">
      <span class="block truncate font-cinzel text-sm font-semibold text-foreground">{{ chain.quest_title }}</span>
      <span class="block truncate text-caption text-muted-foreground">{{ chain.beat_title }}</span>
    </span>
    <span
      v-if="chain.runtime_status === 'paused'"
      class="mt-0.5 shrink-0 text-label uppercase tracking-wide text-muted-foreground"
    >Paused</span>
  </RouterLink>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { IconParty } from "@/lib/icons";
import type { CampaignLiveQuest } from "@/types/quest.types";

/**
 * One chain the party has open, wherever it is listed.
 *
 * Shared by the Run cockpit's "Also open" rail and the dashboard's In progress
 * panel. They differ in their surrounding chrome and in which chains they show,
 * never in what a chain looks like — so the row is a component and the
 * difference is the parent's business.
 *
 * Running and paused are always distinguished. A paused chain still holds its
 * place but is not where the table is, and after a session ends every chain is
 * paused — so treating "has a cursor" as "is being played" would make the
 * between-sessions view claim the party is in six places at once.
 */
defineProps<{ chain: CampaignLiveQuest }>();
</script>
