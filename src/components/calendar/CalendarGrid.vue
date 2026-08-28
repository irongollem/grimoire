<template>
  <div>
    <!-- Month navigation -->
    <div class="flex items-center justify-between mb-4 gap-2">
      <div class="flex items-center gap-1 shrink-0">
        <AppButton
          variant="outline"
          size="body"
          tooltip="Previous year"
          label="◀◀"
          @click="calendar.goToYear(calendar.currentYear - 1)"
        />
        <AppButton variant="outline" size="body" @click="calendar.prevMonth()">
          ← <span class="hidden sm:inline">Previous</span>
        </AppButton>
      </div>

      <div class="text-center min-w-0 flex-1">
        <p class="text-heading md:text-xl font-semibold text-foreground truncate">
          {{ currentMonth.name }}
        </p>
        <div class="flex items-center justify-center gap-1 mt-0.5 flex-wrap">
          <p v-if="currentMonth.alias" class="text-caption text-muted-foreground italic">
            {{ currentMonth.alias }} ·
          </p>
          <AppInput
            v-if="!readOnly"
            v-model.number="yearModel"
            type="number"
            tone="underline"
            size="caption"
            align="center"
            class="w-16 md:w-20 text-muted-foreground italic"
          />
          <span
            v-else
            class="text-caption text-muted-foreground italic"
          >{{ calendar.currentYear }}</span>
          <p class="text-caption text-muted-foreground italic">
            {{ calendar.adapter.epochName }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <AppButton variant="outline" size="body" @click="calendar.nextMonth()">
          <span class="hidden sm:inline">Next</span> →
        </AppButton>
        <AppButton
          variant="outline"
          size="body"
          tooltip="Next year"
          label="▶▶"
          @click="calendar.goToYear(calendar.currentYear + 1)"
        />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading && !eventsOverride" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <template v-else-if="!isLoading || eventsOverride">
      <!-- Optional day-of-week column headers (Gregorian, Greyhawk, etc.) -->
      <div
        v-if="calendar.adapter.dayLabels"
        :class="gridColsClass"
        :style="gridColsStyle"
        class="grid gap-1 mb-1 px-0"
      >
        <div
          v-for="label in calendar.adapter.dayLabels"
          :key="label"
          class="text-center text-label-lg font-semibold text-muted-foreground py-1"
        >
          {{ label.slice(0, 3) }}
        </div>
      </div>

      <!-- Week rows -->
      <div v-for="(row, rowIdx) in gridRows" :key="rowIdx" class="mb-4">
        <p class="font-cinzel text-xs font-semibold tracking-widest text-muted-foreground mb-2">
          {{ weekRowLabel(rowIdx) }}
        </p>
        <div :class="gridColsClass" :style="gridColsStyle" class="grid gap-1">
          <div
            v-for="(day, colIdx) in row"
            :key="colIdx"
            class="relative rounded-md border min-h-14 p-1.5 flex flex-col transition-colors"
            :class="[
              day !== null && !readOnly
                ? 'border-border bg-card hover:border-primary/50 cursor-pointer'
                : day !== null
                  ? 'border-border bg-card'
                  : 'border-transparent bg-transparent',
              day !== null && hasEvents(day) ? 'ring-1 ring-primary/40' : '',
              day !== null && day === todayDayInView ? 'ring-2 ring-primary bg-primary/5' : '',
            ]"
            @click="!readOnly && day !== null && emit('create-event', day)"
          >
            <span
              v-if="day !== null"
              class="font-cinzel text-xs font-semibold leading-none"
              :class="day === todayDayInView ? 'text-primary' : 'text-muted-foreground'"
            >
              {{ day }}
            </span>
            <span
              v-if="day === todayDayInView"
              class="absolute top-0.5 right-1 font-cinzel text-2xs font-bold text-primary tracking-widest uppercase leading-none"
            >today</span>
            <!-- Event dots -->
            <div v-if="day !== null" class="flex flex-wrap gap-0.5 mt-auto pt-1">
              <span
                v-for="event in eventsForDay(day)"
                :key="event.id"
                :title="event.title"
                :style="{ backgroundColor: eventColor(event) }"
                class="w-1.5 h-1.5 rounded-full"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Intercalary day banner (shown after this month if applicable) -->
      <div
        v-for="festival in festivalsAfterCurrentMonth"
        :key="festival.name"
        class="mt-5 rounded-md border border-gold-500/40 bg-gold-500/10 px-4 py-3"
      >
        <div class="flex items-center gap-2 mb-1">
          <span class="text-gold-400 text-lg">✦</span>
          <span class="font-cinzel text-sm font-bold text-gold-400 tracking-wider">
            {{ festival.name }}
          </span>
          <span v-if="festival.isLeapOnly" class="text-caption text-muted-foreground italic">
            (leap year)
          </span>
        </div>
        <p class="text-body text-muted-foreground italic">
          {{ festival.description }}
        </p>
        <!-- Festival events -->
        <div v-if="eventsForFestival(festival.name).length" class="mt-2 flex flex-wrap gap-1.5">
          <span
            v-for="event in eventsForFestival(festival.name)"
            :key="event.id"
            :style="{ borderColor: eventColor(event), color: eventColor(event) }"
            class="inline-flex items-center gap-1 border rounded px-1.5 py-0.5 text-caption"
          >
            <span :style="{ backgroundColor: eventColor(event) }" class="w-1.5 h-1.5 rounded-full" />
            {{ event.title }}
          </span>
        </div>
      </div>

      <!-- Events list for the month -->
      <div v-if="monthEvents.length" class="mt-6">
        <p class="font-cinzel text-xs font-semibold tracking-widest text-muted-foreground mb-3">
          EVENTS THIS MONTH
        </p>
        <div class="space-y-1.5">
          <component
            :is="entityLink(event) ? RouterLink : 'div'"
            v-for="event in monthEvents"
            :key="event.id"
            :to="entityLink(event) ?? undefined"
            class="flex items-center gap-2 rounded-md bg-card border border-border px-3 py-2 group transition-colors"
            :class="!readOnly ? 'cursor-pointer hover:border-primary/40' : ''"
            @click="!readOnly && !entityLink(event) && emit('edit-event', event)"
          >
            <span
              :style="{ backgroundColor: eventColor(event) }"
              class="w-2.5 h-2.5 rounded-full shrink-0"
            />
            <component
              :is="entityIcon(event)"
              v-if="entityIcon(event)"
              class="h-3.5 w-3.5 text-muted-foreground shrink-0"
            />
            <span class="text-body text-foreground flex-1 truncate">{{ event.title }}</span>
            <span class="text-caption text-muted-foreground italic shrink-0">
              {{ formatEventDate(event) }}
            </span>
            <span class="hidden md:inline text-label-lg text-muted-foreground/40 uppercase shrink-0">
              {{ event.event_type }}
            </span>
          </component>
        </div>
      </div>

      <div v-else-if="!isLoading" class="mt-6">
        <p class="text-body text-muted-foreground italic text-center">
          No events recorded for {{ currentMonth.name }}, {{ calendar.currentYear }}
          {{ calendar.adapter.epochName }}.
        </p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from "vue";
import { RouterLink } from "vue-router";
import { IconEncounter, IconLocation, IconQuest } from '@/lib/icons';
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";
import { useCalendarEvents } from "@/composables/calendar/useCalendarEvents";
import { linkedEntityType, linkedEntityId, eventColor } from "@/types/calendar.types";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import type { CalendarEvent } from "@/types/calendar.types";

const { eventsOverride = null, readOnly = false } = defineProps<{
  eventsOverride?: CalendarEvent[] | null;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  "edit-event": [event: CalendarEvent];
  "create-event": [day: number];
}>();

const calendar = useCalendarStore();
const campaignStore = useCampaignStore();
const yearRef = toRef(calendar, "currentYear");
const { data: fetchedEvents, isLoading } = useCalendarEvents(yearRef);
const events = computed(() => eventsOverride ?? fetchedEvents.value ?? null);

// Today marker: show when the viewed month/year matches the campaign's in-game today
const todayDayInView = computed<number | null>(() => {
  if (
    campaignStore.todayYear === calendar.currentYear &&
    campaignStore.todayMonth === calendar.currentMonth
  ) {
    return campaignStore.todayDay;
  }
  return null;
});

const currentMonth = computed(
  () =>
    calendar.adapter.months.find((m) => m.num === calendar.currentMonth) ??
    calendar.adapter.months[0],
);

// Grid columns derive from the adapter's weekSize. The 10-day Harptos preset
// wraps into 5 mobile columns so it doesn't squash; everything else uses
// weekSize directly via an inline style so any custom width renders.
const gridColsClass = computed(() =>
  calendar.adapter.weekSize === 7
    ? "grid-cols-7"
    : calendar.adapter.weekSize === 10
      ? "grid-cols-5 md:grid-cols-10"
      : "",
);
const gridColsStyle = computed(() =>
  calendar.adapter.weekSize === 7 || calendar.adapter.weekSize === 10
    ? undefined
    : { gridTemplateColumns: `repeat(${calendar.adapter.weekSize}, minmax(0, 1fr))` },
);

// Build grid rows: each row is an array of day numbers (or null for empty offset cells).
// Handles Gregorian-style weekday offsets and variable month lengths.
const gridRows = computed(() => {
  const weekSize = calendar.adapter.weekSize;
  const monthDays = currentMonth.value.days;
  // Ask the calendar, never decide for it. This used to read
  // `currentMonth === 2 && adapter.isLeapYear(year) ? 29 : monthDays` for
  // *every* adapter — a Gregorian rule applied to all of them. Harptos has an
  // `every4` leap rule and a 30-day second month (Ches), so every year
  // divisible by four rendered Ches with 29 cells and the 30th could not be
  // reached. Only Gregorian implements `daysInMonth`; everyone else keeps
  // their fixed month length and puts the leap day in an intercalary day.
  const actualDays =
    calendar.adapter.daysInMonth?.(calendar.currentYear, calendar.currentMonth) ?? monthDays;
  const offset = calendar.adapter.weekdayOffset?.(calendar.currentYear, calendar.currentMonth) ?? 0;
  const totalCells = Math.ceil((offset + actualDays) / weekSize) * weekSize;

  const rows: (number | null)[][] = [];
  for (let i = 0; i < totalCells; i += weekSize) {
    const row: (number | null)[] = [];
    for (let j = 0; j < weekSize; j++) {
      const cellIdx = i + j;
      const day = cellIdx - offset + 1;
      row.push(day >= 1 && day <= actualDays ? day : null);
    }
    rows.push(row);
  }
  return rows;
});

function weekRowLabel(rowIdx: number): string {
  const names = calendar.adapter.weekRowNames;
  if (names && names[rowIdx]) return names[rowIdx];
  const unit = calendar.adapter.weekSize === 10 ? "Tenday" : "Week";
  return `${unit} ${rowIdx + 1}`;
}

// Festival days that fall right after the current month
const festivalsAfterCurrentMonth = computed(() =>
  calendar.adapter.intercalaryDays.filter((d) => {
    if (d.afterMonth !== calendar.currentMonth) return false;
    if (d.isLeapOnly && !calendar.adapter.isLeapYear(calendar.currentYear)) return false;
    return true;
  }),
);

// Check if a regular (non-festival) event covers a given month/day.
function dayIsInEvent(event: CalendarEvent, month: number, day: number): boolean {
  if (event.festival_day) return false;
  const startMonth = event.harptos_month;
  const startDay = event.harptos_day;
  if (startMonth === null || startDay === null) return false;
  if (!event.is_multi_day || event.end_day === null) {
    return startMonth === month && startDay === day;
  }
  const endMonth = event.end_month ?? startMonth;
  const endDay = event.end_day;
  const pos = month * 100 + day;
  return pos >= startMonth * 100 + startDay && pos <= endMonth * 100 + endDay;
}

// Events for the current month — includes multi-day events that span into this month
const monthEvents = computed(() => {
  const month = calendar.currentMonth;
  return (events.value ?? []).filter((e) => {
    if (e.festival_day) return false;
    if (!e.is_multi_day || e.end_day === null) return e.harptos_month === month;
    const startMonth = e.harptos_month ?? 0;
    const endMonth = e.end_month ?? startMonth;
    return startMonth <= month && month <= endMonth;
  });
});

function eventsForDay(day: number): CalendarEvent[] {
  return (events.value ?? []).filter((e) => dayIsInEvent(e, calendar.currentMonth, day));
}

function hasEvents(day: number): boolean {
  return eventsForDay(day).length > 0;
}

function eventsForFestival(festivalName: string): CalendarEvent[] {
  return (events.value ?? []).filter((e) => e.festival_day === festivalName);
}

function formatEventDate(event: CalendarEvent): string {
  if (event.festival_day) return event.festival_day;
  if (event.harptos_day) {
    const weekSize = calendar.adapter.weekSize;
    const week = Math.ceil(event.harptos_day / weekSize);
    const label = calendar.adapter.weekRowNames?.[week - 1] ?? `Week ${week}`;
    return `Day ${event.harptos_day} (${label})`;
  }
  return "";
}

// AppInput's v-model.number casts an empty field to `null` rather than NaN — the
// guard below covers both, so clearing the field or typing something invalid is
// still a no-op exactly as the old parseInt-based handler was.
const yearModel = computed<number | null>({
  get: () => calendar.currentYear,
  set: (val) => {
    if (val !== null && !isNaN(val) && val > 0) calendar.goToYear(val);
  },
});

const ENTITY_ROUTES: Record<string, string> = {
  quest: "/quests",
  encounter: "/encounters",
  location: "/locations",
};

function entityLink(event: CalendarEvent): string | null {
  const type = linkedEntityType(event);
  const id = linkedEntityId(event);
  if (!type || !id) return null;
  return `${ENTITY_ROUTES[type]}/${id}`;
}

function entityIcon(event: CalendarEvent) {
  const type = linkedEntityType(event);
  if (type === "quest") return IconQuest;
  if (type === "encounter") return IconEncounter;
  if (type === "location") return IconLocation;
  return null;
}
</script>
