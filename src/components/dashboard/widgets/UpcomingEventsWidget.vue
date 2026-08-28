<template>
  <DashboardWidget
    title="Upcoming events"
    :count="upcoming ? upcoming.length || null : undefined"
    :loading="events === undefined"
    :empty="upcoming !== undefined && upcoming.length === 0"
    empty-text="Nothing on the calendar yet."
  >
    <!-- The header only ever wants one control from DashboardWidget's default
         action slot (a single "View all" link) -- this widget wants two, a
         type filter beside the link out to the full calendar, so it builds
         the whole action area itself rather than fighting the default. -->
    <template #action>
      <div class="flex items-center gap-1.5">
        <AppSelect
          v-model="selectedType"
          size="xs"
          tone="muted"
          aria-label="Filter upcoming events by type"
        >
          <option value="all">All types</option>
          <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </AppSelect>
        <!-- The pattern's third requirement: a Clear that only exists while a
             filter is on. Redundant-looking beside a select whose first option
             is "All types", and kept anyway — the point of the rule is that
             every filtered list offers the same way out, and a card that
             invented its own would be the one place it did not. -->
        <AppButton
          v-if="ui.upcomingEventsHasActiveFilters"
          variant="link"
          size="inline-xs"
          label="Clear"
          @click="ui.resetUpcomingEventsFilters()"
        />
        <AppButton to="/calendar" variant="link" size="inline-xs" label="Calendar →" />
      </div>
    </template>

    <div v-if="upcoming?.length" class="divide-y divide-border">
      <RouterLink
        v-for="item in upcoming"
        :key="item.event.id"
        to="/calendar"
        class="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-muted/30"
        @click="focusEvent(item.event)"
      >
        <span
          :style="{ backgroundColor: eventColor(item.event) }"
          class="h-2 w-2 shrink-0 rounded-full"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-body text-foreground">{{ item.event.title }}</p>
          <p class="truncate text-caption text-muted-foreground italic">
            {{ adapter.formatDate(item.event.harptos_year, item.event.harptos_month, item.event.harptos_day, item.event.festival_day) }}
          </p>
        </div>
        <!-- The countdown is the point of this widget for a deadline -- prep
             gaps matter *because* a date is closing in. Other event types get
             the date above and nothing here; a countdown on a festival or a
             travel note would just be noise. -->
        <span
          v-if="item.event.event_type === 'deadline'"
          class="shrink-0 font-cinzel text-label uppercase tracking-wide"
          :class="item.daysUntil <= 1 ? 'text-tone-caution' : 'text-muted-foreground'"
        >
          {{ formatDaysUntil(item.daysUntil) }}
        </span>
      </RouterLink>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useCalendarEventsRange } from "@/composables/calendar/useCalendarEvents";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import { useCalendarStore } from "@/stores/calendar";
import { nextUpcomingEvents, formatDaysUntil, type CalendarToday } from "@/lib/calendar/upcoming";
import { eventColor, type CalendarEvent, type CalendarEventType } from "@/types/calendar.types";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import DashboardWidget from "../DashboardWidget.vue";

/**
 * The next few events on the campaign's *in-world* calendar, with a countdown
 * for deadlines -- distinct from `NextSessionWidget`, which is the next
 * *real-world* table date pulled from `session_proposals`. One asks "when do
 * we next play"; this one asks "what is closing in on the party".
 *
 * The next-N query and the day-count arithmetic both live in
 * `src/lib/calendar/upcoming.ts` (#764) rather than here, per the module
 * placement rule: it is calendar logic a future `CalendarView` "what's next"
 * affordance could equally want, and it is exactly the kind of edge-case-heavy
 * arithmetic (year boundaries, intercalary days) that is cheap to test in
 * isolation and expensive to test through a mounted widget.
 */

// Five in-world years is a generous, bounded horizon for a dashboard glance --
// enough to catch a deadline, festival or travel date planned several story
// arcs out, without turning this into an open-ended "fetch everything" query.
const HORIZON_YEARS = 5;
const LIMIT = 6;

const campaign = useCampaignStore();
const calendarStore = useCalendarStore();

const startYear = computed(() => campaign.todayYear);
const endYear = computed(() => campaign.todayYear + HORIZON_YEARS);
const { data: events } = useCalendarEventsRange(startYear, endYear);

const adapter = computed(() => calendarStore.adapter);
const today = computed<CalendarToday>(() => ({
  year: campaign.todayYear,
  month: campaign.todayMonth,
  day: campaign.todayDay,
}));

/**
 * In `useUiStore`, not a local ref: this filters the list already on the card,
 * which is exactly what the Filter State Pattern governs. The sanctioned
 * exceptions are dialog-scoped searches and add-pickers that empty themselves,
 * and this is neither — so it survives navigating away from the dashboard and
 * back, without pinning itself into localStorage forever.
 */
const ui = useUiStore();
const selectedType = computed<CalendarEventType | "all">({
  get: () => ui.upcomingEventsFilterType,
  set: (value) => {
    ui.upcomingEventsFilterType = value;
  },
});

const TYPE_OPTIONS: readonly { value: CalendarEventType; label: string }[] = [
  { value: "deadline", label: "Deadline" },
  { value: "festival", label: "Festival" },
  { value: "travel", label: "Travel" },
  { value: "quest", label: "Quest" },
  { value: "encounter", label: "Encounter" },
  { value: "session", label: "Session" },
  { value: "campaign", label: "Campaign" },
  { value: "world", label: "World" },
  { value: "location", label: "Location" },
  { value: "discovery", label: "Discovery" },
  { value: "boss_fight", label: "Boss Fight" },
  { value: "npc_death", label: "NPC Death" },
  { value: "player_death", label: "Player Death" },
];

// `events` is `undefined` while `useCalendarEventsRange` is still loading (or
// has no active campaign to query for) -- that is a different state from "the
// campaign genuinely has no upcoming events", so this stays `undefined` too
// rather than coercing with `?? []`. DashboardWidget's `loading`/`empty` props
// read that distinction directly off `events`/`upcoming` in the template.
const upcoming = computed(() => {
  if (events.value === undefined) return undefined;
  const eventTypes = selectedType.value === "all" ? undefined : [selectedType.value];
  return nextUpcomingEvents(events.value, adapter.value, today.value, { limit: LIMIT, eventTypes });
});

/**
 * Mirrors `CalendarEventRefChip.vue`'s `navigate()` (the tiptap inline-ref
 * click handler): point the calendar store at the event's month and mark it
 * highlighted before the `RouterLink` itself lands on `/calendar`, so the
 * calendar view opens already scrolled to, and glowing on, this event instead
 * of wherever the DM last left the calendar scrolled.
 */
function focusEvent(event: CalendarEvent) {
  calendarStore.goToMonth(event.harptos_year, event.harptos_month ?? 1);
  calendarStore.setHighlightedEvent(event.id);
}
</script>
