<template>
  <aside class="flex flex-col gap-2 border border-border bg-card p-4" aria-labelledby="canon-almanac-heading" data-testid="almanac">
    <h3 id="canon-almanac-heading" class="m-0 text-heading-xs font-semibold text-foreground">The almanac</h3>
    <p class="m-0 text-caption text-muted-foreground">One timeline of the world: lore and moving forces with a date in the world, the events on the Calendar, and every session, in the world's own calendar. The Calendar's events are edited there; follow one to its month.</p>
    <ol v-if="events.length > 0" class="relative m-0 mt-1 flex list-none flex-col gap-2.5 p-0 pl-4 before:absolute before:top-1 before:bottom-1 before:left-1 before:w-px before:bg-border">
      <li v-for="event in events" :key="event.key" class="relative text-body" :data-kind="event.kind">
        <span
          aria-hidden="true"
          class="absolute top-1.5 -left-[0.9375rem] size-2 rounded-full border border-primary"
          :class="event.kind === 'session' ? 'bg-primary' : 'bg-card'"
        />
        <span class="block text-eyebrow text-muted-foreground">{{ whenOf(event) }}</span>
        <RouterLink :to="event.to" class="text-foreground hover:text-primary">{{ event.title }}</RouterLink>
      </li>
    </ol>
    <p v-else class="m-0 text-body italic text-muted-foreground">Nothing is dated yet. Give lore a date in the world, or a session its dates, and it lands here.</p>
  </aside>
</template>

<script setup lang="ts">
/** The almanac (frame 12): lore with a date, force ticks with a date, the Calendar's events (read-only here) and every session on one timeline, in the world's calendar. */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useCalendarStore } from "@/stores/calendar";
import { almanac, type AlmanacEvent, type AlmanacKind, type ChronicleItem } from "@/lib/canon/canonChronicle";
import { worldDateLabel } from "@/lib/canon/canonLore";
import type { CalendarEvent } from "@/types/calendar.types";
import type { CanonEntry, CanonForceTick } from "@/types/canon.types";

const { lore, forces, ticks, items, calendarEvents = [] } = defineProps<{
  lore: readonly CanonEntry[];
  forces: readonly CanonEntry[];
  ticks: readonly CanonForceTick[];
  items: readonly ChronicleItem[];
  calendarEvents?: readonly CalendarEvent[];
}>();

const calendar = useCalendarStore();
const events = computed(() => almanac({ lore, forces, ticks, items, calendarEvents }));

const KIND_WORD: Record<AlmanacKind, string> = { lore: "Lore", moving: "Moving", session: "Session", calendar: "Calendar" };
function whenOf(event: AlmanacEvent): string {
  const date = worldDateLabel(event.date, (y, m, d, f) => calendar.adapter.formatDate(y, m, d, f));
  return `${date ?? "No date in the world"} · ${event.word ?? KIND_WORD[event.kind]}`;
}
</script>
