<template>
  <div
    class="cal-day relative rounded-md border min-h-14 p-1.5 flex flex-col transition-colors"
    :class="[
      day !== null && !readOnly
        ? 'border-border bg-card hover:border-primary/50 cursor-pointer'
        : day !== null
          ? 'border-border bg-card'
          : 'border-transparent bg-transparent',
      day !== null && events.length ? 'has-events ring-1 ring-primary/40' : '',
      isToday ? 'is-today ring-2 ring-primary bg-primary/5' : '',
      day === null && 'is-blank',
    ]"
    @click="!readOnly && day !== null && emit('create')"
  >
    <span
      v-if="day !== null"
      class="text-label-lg font-semibold leading-none"
      :class="isToday ? 'text-primary' : 'text-muted-foreground'"
    >
      {{ day }}
    </span>
    <span
      v-if="isToday"
      class="absolute top-0.5 right-1 text-eyebrow font-bold text-primary uppercase leading-none"
    >today</span>
    <!-- A season beginning today: a tiny eyebrow under the numeral. -->
    <span
      v-if="seasonStart"
      class="mt-0.5 truncate text-eyebrow italic leading-none text-muted-foreground"
    >{{ seasonStart }}</span>
    <!-- Event dots on the left, the moons at their peak on the right. -->
    <div v-if="day !== null" class="flex flex-wrap items-end gap-0.5 mt-auto pt-1">
      <span
        v-for="event in events"
        :key="event.id"
        :title="event.title"
        :style="{ backgroundColor: eventColor(event) }"
        class="w-1.5 h-1.5 rounded-full"
      />
      <span v-if="peaks.length" class="ml-auto flex items-center gap-0.5">
        <MoonPhaseIcon
          v-for="(m, mi) in peaks"
          :key="mi"
          :age="m.age"
          :color="m.moon.color"
          :label="`${m.moon.name}: ${MOON_PHASE_LABELS[m.phase].toLowerCase()}`"
          class="h-3 w-3"
        />
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import MoonPhaseIcon from "@/components/calendar/MoonPhaseIcon.vue";
import { MOON_PHASE_LABELS, type MoonState } from "@/lib/calendar/moons";
import { eventColor, type CalendarEvent } from "@/types/calendar.types";

/**
 * One day of the month grid, or a blank offset cell when `day` is null. The
 * `.cal-day` class and the numeral as the first `span` child are what the Vellum
 * stylesheet targets, so both stay put.
 */
const { day, isToday = false, readOnly = false, events = [], peaks = [], seasonStart = null } =
  defineProps<{
    day: number | null;
    isToday?: boolean;
    readOnly?: boolean;
    events?: CalendarEvent[];
    /** Moons whose full or new day this is (#1086). */
    peaks?: MoonState[];
    /** Name of the season that begins on this day, if one does. */
    seasonStart?: string | null;
  }>();

const emit = defineEmits<{ create: [] }>();
</script>
