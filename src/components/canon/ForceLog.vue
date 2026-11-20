<template>
  <div class="flex flex-col gap-2">
    <span class="text-eyebrow text-muted-foreground">The world moved</span>
    <ol v-if="ordered.length > 0" class="flex flex-col border border-border bg-muted/40" data-testid="force-log">
      <li v-for="tick in ordered" :key="tick.id" class="flex min-w-0 items-start gap-2 border-b border-border px-3 py-2 last:border-b-0" data-testid="force-tick">
        <span class="min-w-0 flex-1">
          <span v-if="forceName" class="block text-label font-bold text-foreground" data-testid="force-tick-force">{{ forceName(tick.force_id) }}</span>
          <span class="block text-body text-foreground">{{ tick.note !== "" ? tick.note : tick.delta > 0 ? "Ticked forward by hand." : "Ticked back by hand." }}</span>
          <span class="block text-label text-muted-foreground">{{ when(tick) }}</span>
        </span>
        <span class="text-label font-bold text-foreground" aria-hidden="true">{{ tick.delta > 0 ? "+" : "" }}{{ tick.delta }}</span>
        <AppButton v-if="newestIds.has(tick.id)" variant="ghost" size="xs" :icon="IconUndo" icon-size="xs" label="Undo" @click="emit('undo', tick)" />
      </li>
    </ol>
    <p v-else class="text-caption text-muted-foreground">Nothing has moved yet. Each tick is kept here, newest first, with why.</p>
  </div>
</template>

<script setup lang="ts">
/**
 * Ticks, newest first, each with its note, the day it happened and (in the story) the world's date in the campaign's
 * calendar. Undo is on each force's newest tick only. Given `forceName`, every row names its force: that is the log
 * across every force beside the list.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { newestTick } from "@/composables/canon/useCanonForces";
import { IconUndo } from "@/lib/icons";
import { useCalendarStore } from "@/stores/calendar";
import type { CanonForceTick } from "@/types/canon.types";

const { ticks, forceName } = defineProps<{ ticks: readonly CanonForceTick[]; forceName?: (forceId: string) => string }>();
const emit = defineEmits<{ undo: [tick: CanonForceTick] }>();

const calendar = useCalendarStore();

// Oldest first, then reversed (not sorted descending): among ticks written in the same instant the last written is the newest, as `newestTick` says.
const ordered = computed(() => [...ticks].sort((a, b) => a.created_at.localeCompare(b.created_at)).reverse());
const newestIds = computed(() => {
  const ids = new Set<string>();
  for (const forceId of new Set(ticks.map((t) => t.force_id))) {
    const newest = newestTick(ticks.filter((t) => t.force_id === forceId));
    if (newest) ids.add(newest.id);
  }
  return ids;
});

function when(tick: CanonForceTick): string {
  const day = new Date(tick.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (tick.world_year === null || tick.world_month === null || tick.world_day === null) return day;
  return `${day} · in the story: ${calendar.adapter.formatDate(tick.world_year, tick.world_month, tick.world_day, null)}`;
}
</script>
