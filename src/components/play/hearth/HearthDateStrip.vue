<template>
  <RouterLink
    to="/play/calendar"
    class="torn hearth-card block rounded-lg p-3.5 transition-colors hover:bg-accent/40"
    aria-label="Open the calendar"
  >
    <div class="flex items-baseline justify-between gap-2">
      <span class="text-eyebrow text-muted-foreground">In the realm</span>
      <span v-if="week" class="text-eyebrow text-muted-foreground">{{ week.label }}</span>
    </div>
    <div class="mt-1 flex items-baseline gap-2">
      <span class="hearth-display text-heading">{{ dayLabel }}</span>
      <span class="text-caption italic text-muted-foreground">{{ yearLabel }}</span>
    </div>

    <ol v-if="week" class="mt-3 flex gap-1" aria-label="This week">
      <li
        v-for="d in week.days"
        :key="d.day"
        class="day relative flex min-w-0 flex-1 flex-col items-center justify-center py-1.5 text-caption"
        :class="[d.isToday ? 'is-today font-bold text-foreground' : 'text-muted-foreground', d.hasEvent && 'has-event']"
        :aria-current="d.isToday ? 'date' : undefined"
      >
        <span>{{ d.day }}</span>
        <i
          v-if="d.hasEvent"
          class="mt-0.5 inline-block h-1.5 w-1.5 rotate-45 bg-current"
          role="img"
          aria-label="Something happens this day"
        />
        <i v-else class="mt-0.5 inline-block h-1.5 w-1.5" aria-hidden="true" />
      </li>
    </ol>
    <BannerLoader v-else-if="isLoading" class="mt-3 h-5" />

    <ul v-if="upcoming.length" class="mt-3 space-y-1 border-t border-border/60 pt-2.5">
      <li v-for="u in upcoming" :key="u.event.id" class="flex items-baseline gap-2 text-caption">
        <i class="inline-block h-1.5 w-1.5 shrink-0 translate-y-[-0.1rem] rotate-45 bg-primary" aria-hidden="true" />
        <span class="shrink-0 font-semibold text-foreground">{{ u.event.festival_day ?? u.event.harptos_day }}</span>
        <span class="min-w-0 truncate text-muted-foreground">{{ u.event.title }}</span>
      </li>
    </ul>
  </RouterLink>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import { usePlayerCalendarEventsRange } from "@/composables/calendar/useCalendarEvents";
import { upcomingEvents, weekContainingToday } from "@/lib/hearth/calendarWeek";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";

/**
 * "In the realm": the in-world date, the week (or tenday) row holding it with a
 * diamond under each day something happens, and the next two events. The whole
 * card opens the calendar. The date is the campaign's own today, never the
 * calendar page's browsing cursor.
 */
const campaign = useCampaignStore();
const calendar = useCalendarStore();

const today = computed(() => ({
  year: campaign.todayYear,
  month: campaign.todayMonth,
  day: campaign.todayDay,
}));
// Two years, so "the next events" still finds the first ones after a year's end.
const startYear = computed(() => today.value.year);
const endYear = computed(() => today.value.year + 1);
const { data: events, isLoading } = usePlayerCalendarEventsRange(startYear, endYear);

const week = computed(() =>
  events.value ? weekContainingToday(calendar.adapter, today.value, events.value) : null,
);
const upcoming = computed(() =>
  events.value ? upcomingEvents(events.value, calendar.adapter, today.value, 2) : [],
);

const dayLabel = computed(() => {
  const month = calendar.adapter.months[today.value.month - 1];
  return month ? `${today.value.day} ${month.name}` : `Day ${today.value.day}`;
});
const yearLabel = computed(() => `${today.value.year} ${calendar.adapter.epochName}`);
</script>

<style scoped>
.hearth-display {
  font-family: "Cinzel", Georgia, serif;
}

/* The kalendarium's marks (VellumCalendar): today sits between a double gilt
   rule on a faint gilt wash, and a day with something on it is a red-letter
   day, its numeral in the rubric. */
.day {
  border-block: 3px double transparent;
}
.day.is-today {
  border-block-color: var(--primary-fill, var(--primary));
  background: color-mix(in oklab, var(--primary-fill, var(--primary)) 16%, transparent);
}
.day.has-event {
  color: var(--live-ink, var(--primary));
}
</style>
