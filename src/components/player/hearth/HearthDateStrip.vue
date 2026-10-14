<template>
  <RouterLink
    to="/play/calendar"
    class="torn hearth-paper hearth-card block rounded-lg px-3.5 pb-3 pt-2.5 transition-colors hover:bg-accent/40"
    :aria-label="`${dateline}. Open the calendar`"
  >
    <!-- The date as a kalendarium writes it: the day a red-letter numeral, the
         month in the book's capitals, where in the year in a quiet hand below. -->
    <p class="dateline">
      <span class="dateline-day">{{ today.day }}</span>
      <span class="dateline-month">{{ monthName ?? `Day ${today.day}` }}</span>
    </p>
    <p class="text-caption italic text-muted-foreground">{{ whereInYear }}</p>

    <!-- The week (or tenday) as beads on a thread: the days gone inked, today
         gilt, the days ahead open, a day with something on it in the rubric. -->
    <ol v-if="week" class="beads mt-3" :aria-label="week.label">
      <li
        v-for="d in week.days"
        :key="d.day"
        class="bead"
        :class="[beadState(d.day), d.hasEvent && 'is-event']"
        :aria-current="d.isToday ? 'date' : undefined"
        :title="beadLabel(d)"
      >
        <span class="sr-only">{{ beadLabel(d) }}</span>
      </li>
    </ol>
    <BannerLoader v-else-if="isLoading" class="mt-3 h-5" />

    <ul v-if="upcoming.length" class="mt-3 space-y-1 border-t border-border/60 pt-2.5">
      <li v-for="u in upcoming" :key="u.event.id" class="flex items-baseline gap-2 text-caption">
        <i class="rubric-diamond shrink-0" aria-hidden="true" />
        <span class="shrink-0 font-semibold text-foreground">{{ u.event.festival_day ?? u.event.harptos_day }}</span>
        <span class="min-w-0 truncate text-muted-foreground">{{ u.event.title }}</span>
      </li>
    </ul>
  </RouterLink>
</template>

<script setup lang="ts">
import "./hearth-paper.css";
import { computed } from "vue";
import { RouterLink } from "vue-router";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import { usePlayerCalendarEventsRange } from "@/composables/calendar/useCalendarEvents";
import { nextUpcomingEvents } from "@/lib/calendar/upcoming";
import { weekContainingToday, type HearthWeekDay } from "@/lib/hearth/calendarWeek";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";

/**
 * "In the realm": the in-world date, the week (or tenday) holding it as a row of
 * beads (a diamond in the rubric on each day something happens), and the next
 * two events. The whole card opens the calendar. The date is the campaign's own
 * today, never the calendar page's browsing cursor.
 *
 * The beads replaced a row of boxed numerals (maintainer, 14 Oct 2026: "really
 * ugly"): what a player wants from the row is where in the tenday they stand,
 * which a line of equal numbers did not show. The day's number is the large
 * numeral above; each bead still names its day to a screen reader and on hover.
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
  events.value ? nextUpcomingEvents(events.value, calendar.adapter, today.value, { limit: 2 }) : [],
);

/** Null for a stored month the campaign's calendar no longer has. */
const monthName = computed(() => calendar.adapter.months[today.value.month - 1]?.name ?? null);
const yearLabel = computed(() => `${today.value.year} ${calendar.adapter.epochName}`);

const dateline = computed(() =>
  monthName.value ? `${today.value.day} ${monthName.value}, ${yearLabel.value}` : `Day ${today.value.day}, ${yearLabel.value}`,
);
const whereInYear = computed(() =>
  week.value && monthName.value ? `${week.value.label} of ${monthName.value}, ${yearLabel.value}` : yearLabel.value,
);

function beadState(day: number): "is-past" | "is-today" | "is-ahead" {
  if (day === today.value.day) return "is-today";
  return day < today.value.day ? "is-past" : "is-ahead";
}

function beadLabel(d: HearthWeekDay): string {
  const date = monthName.value ? `${d.day} ${monthName.value}` : `Day ${d.day}`;
  const when = d.isToday ? `${date}, today` : date;
  return d.hasEvent ? `${when}: something happens` : when;
}
</script>

<style scoped>
/* The dateline: Cinzel, as the Hearth's title. The day is the one loud thing
   on the card, a red-letter numeral in the rubric; the month sits on its
   baseline at heading size. */
.dateline {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin: 0;
  font-family: "Cinzel", Georgia, serif;
  line-height: 1;
}
.dateline-day {
  font-size: 2.75rem;
  font-weight: 700;
  color: var(--live-ink, var(--primary));
}
.dateline-month {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--foreground);
}

/* The beads: diamonds spaced evenly along a hairline thread. */
.beads {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 1.25rem;
  margin-inline: 0.25rem;
  padding: 0;
  list-style: none;
}
.beads::before {
  content: "";
  position: absolute;
  inset-inline: 0;
  top: 50%;
  border-top: 1px solid color-mix(in oklab, var(--foreground) 22%, transparent);
}
.bead {
  position: relative;
  width: 0.5rem;
  height: 0.5rem;
  rotate: 45deg;
  border: 1px solid color-mix(in oklab, var(--foreground) 45%, transparent);
  background: var(--torn-fill, var(--card));
}
.bead.is-past {
  border-color: transparent;
  background: color-mix(in oklab, var(--foreground) 45%, transparent);
}
.bead.is-event {
  border-color: var(--live-ink, var(--primary));
}
.bead.is-past.is-event {
  background: var(--live-ink, var(--primary));
}
/* Today: larger, gilt, ringed in the card's own colour so the thread breaks
   around it. */
.bead.is-today {
  width: 0.875rem;
  height: 0.875rem;
  border-color: var(--primary-fill, var(--primary));
  background: var(--primary-fill, var(--primary));
  box-shadow: 0 0 0 3px var(--torn-fill, var(--card));
}
.bead.is-today.is-event {
  border-color: var(--live-ink, var(--primary));
}

.rubric-diamond {
  display: inline-block;
  width: 0.375rem;
  height: 0.375rem;
  rotate: 45deg;
  translate: 0 -0.1rem;
  background: var(--live-ink, var(--primary));
}
</style>
