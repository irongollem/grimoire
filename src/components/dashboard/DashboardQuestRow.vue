<template>
  <!--
    One row for every quest, whatever stage it is at.
Rumors used to render as chips and active quests as rows, which said they were
    different kinds of thing. They are not: a rumor is a quest the party has
    heard about and an active quest is one they have taken up. The stage belongs
    in the dot and the trailing label, never in the shape of the row. See #759.
  -->
  <RouterLink
    :to="row.runLink ? { path: `/quests/${row.id}`, query: { mode: 'run' } } : `/quests/${row.id}`"
    class="flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 group"
  >
    <span
      class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
      :class="STAGES[row.stage].dot"
      aria-hidden="true"
    />
    <span class="min-w-0 flex-1">
      <span class="block truncate font-cinzel text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
        {{ row.title }}
      </span>
      <span v-if="row.secondary" class="block truncate text-caption text-muted-foreground italic">
        {{ row.secondary }}
      </span>
    </span>
    <span
      v-if="STAGES[row.stage].badge"
      class="mt-0.5 shrink-0 text-label uppercase tracking-wide"
      :class="STAGES[row.stage].badgeClass"
    >{{ STAGES[row.stage].badge }}</span>
  </RouterLink>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { DashboardQuestRowModel } from "@/lib/dashboard/questRows";

defineProps<{ row: DashboardQuestRowModel }>();

/**
 * The lifecycle, encoded once. `here` and `paused` both mean the quest holds a
 * runtime cursor — the difference is whether the table is standing in it, which
 * matters because after a session ends every open chain is paused.
 */
const STAGES = {
  here:   { dot: "bg-primary",      badge: "Party is here", badgeClass: "text-primary" },
  paused: { dot: "bg-muted-foreground", badge: "Paused",    badgeClass: "text-muted-foreground" },
  active: { dot: "bg-tone-success", badge: "",              badgeClass: "" },
  rumor:  { dot: "bg-tone-caution", badge: "Rumor",         badgeClass: "text-muted-foreground/70" },
} as const;
</script>
