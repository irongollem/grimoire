<template>
  <p
    v-if="season || moons.length"
    class="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground"
  >
    <span v-if="season" class="italic">{{ season.season.name }} · day {{ season.dayOfSeason }}</span>
    <span
      v-for="m in moons"
      :key="m.moon.name"
      class="inline-flex items-center gap-1"
      :title="`${m.moon.name}, ${MOON_PHASE_LABELS[m.phase].toLowerCase()}`"
    >
      <MoonPhaseIcon :age="m.age" :color="m.moon.color" class="h-3 w-3" />
      <span v-if="spellOut">{{ m.moon.name }}, {{ MOON_PHASE_LABELS[m.phase].toLowerCase() }}</span>
      <span v-else class="sr-only">{{ m.moon.name }}, {{ MOON_PHASE_LABELS[m.phase].toLowerCase() }}</span>
    </span>
  </p>
</template>

<script setup lang="ts">
import { computed } from "vue";
import MoonPhaseIcon from "@/components/calendar/MoonPhaseIcon.vue";
import { MOON_PHASE_LABELS, moonsOn } from "@/lib/calendar/moons";
import { seasonOn } from "@/lib/calendar/seasons";
import { useCalendarStore } from "@/stores/calendar";

/**
 * The sky on one day (#1086): the season and each moon's phase, quiet enough to
 * sit under a date. Renders nothing for a calendar with neither. Moons are
 * spelled out only when there are few of them; Eberron's twelve are a row of
 * icons, each titled with its name and phase.
 */
const { year, month, day, festivalDay = null } = defineProps<{
  year: number;
  month: number | null;
  day: number | null;
  festivalDay?: string | null;
}>();

const calendar = useCalendarStore();

const season = computed(() => seasonOn(calendar.adapter, year, month, day, festivalDay));
const moons = computed(() => moonsOn(calendar.adapter, year, month, day, festivalDay));
const spellOut = computed(() => moons.value.length <= 3);
</script>
