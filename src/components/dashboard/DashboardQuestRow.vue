<template>
  <!--
    One row for every quest, whatever stage it is at. Rumors and active quests
    used to render as different shapes — a chip versus a row — which said they
    were different kinds of thing. They weren't (and since #874 there is no
    quest-level rumor stage at all — a rumor is a beat's visibility). The stage
    belongs in the dot and the trailing label, never in the shape of the row.
    See #759.
  -->
  <RouterLink
    :to="row.runLink ? { path: `/quests/${row.id}`, query: { view: 'run' } } : `/quests/${row.id}`"
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
} as const;
</script>
