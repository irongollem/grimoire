<template>
  <div class="flex flex-col gap-2">
    <ol v-if="ordered.length > 0" class="flex flex-col rounded-lg border border-border bg-muted/40" data-testid="force-log">
      <li v-for="tick in shown" :key="tick.id" class="flex min-w-0 items-start gap-2 border-b border-border px-3 py-2 last:border-b-0" data-testid="force-tick">
        <span class="min-w-0 flex-1">
          <span class="block text-body text-foreground">{{ tick.note !== "" ? tick.note : tick.delta > 0 ? "Ticked forward by hand." : "Ticked back by hand." }}</span>
          <span class="block text-label text-muted-foreground">{{ when(tick) }}</span>
        </span>
        <span class="text-label font-bold text-foreground" aria-hidden="true">{{ tick.delta > 0 ? "+" : "" }}{{ tick.delta }}</span>
        <AppButton v-if="tick.id === newestId" variant="ghost" size="xs" :icon="IconUndo" icon-size="xs" label="Undo" @click="emit('undo', tick)" />
      </li>
    </ol>
    <p v-else class="m-0 text-caption text-muted-foreground">Nothing has moved yet. Each tick is kept here, newest first, with why.</p>
    <AppButton v-if="hidden > 0" variant="link" size="inline" class="self-start" :label="`All ${ordered.length} moves`" data-testid="force-log-all" @click="showAll = true" />
  </div>
</template>

<script setup lang="ts">
/**
 * One force's ticks, newest first, each with its note, the day it happened and (in the story) the world's date in the
 * campaign's calendar. Undo is on the newest tick only. Given a `limit`, only that many show and "All N moves" opens the rest in place.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { newestTick } from "@/composables/canon/useCanonForces";
import { IconUndo } from "@/lib/icons";
import { useCalendarStore } from "@/stores/calendar";
import type { CanonForceTick } from "@/types/canon.types";

const { ticks, limit } = defineProps<{ ticks: readonly CanonForceTick[]; limit?: number }>();
const emit = defineEmits<{ undo: [tick: CanonForceTick] }>();

const calendar = useCalendarStore();

// Oldest first, then reversed (not sorted descending): among ticks written in the same instant the last written is the newest, as `newestTick` says.
const ordered = computed(() => [...ticks].sort((a, b) => a.created_at.localeCompare(b.created_at)).reverse());
// Transient UI state: whether the older moves are showing.
const showAll = ref(false);
const shown = computed(() => (limit === undefined || showAll.value ? ordered.value : ordered.value.slice(0, limit)));
const hidden = computed(() => ordered.value.length - shown.value.length);
const newestId = computed(() => newestTick(ticks)?.id ?? null);

function when(tick: CanonForceTick): string {
  const day = new Date(tick.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (tick.world_year === null || tick.world_month === null || tick.world_day === null) return day;
  return `${day} · in the story: ${calendar.adapter.formatDate(tick.world_year, tick.world_month, tick.world_day, null)}`;
}
</script>
