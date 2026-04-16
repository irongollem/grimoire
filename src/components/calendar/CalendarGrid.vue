<template>
  <div>
    <!-- Month navigation -->
    <div class="flex items-center justify-between mb-4 gap-2">
      <div class="flex items-center gap-1 shrink-0">
        <button
          title="Previous year"
          class="rounded-md border border-border px-2 py-1.5 font-fell text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          @click="calendar.goToYear(calendar.currentYear - 1)"
        >
          ◀◀
        </button>
        <button
          class="rounded-md border border-border px-2 py-1.5 font-fell text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          @click="calendar.prevMonth()"
        >
          ← <span class="hidden sm:inline">Previous</span>
        </button>
      </div>

      <div class="text-center min-w-0 flex-1">
        <p class="font-cinzel text-lg md:text-xl font-semibold text-foreground truncate">
          {{ currentMonth.name }}
        </p>
        <div class="flex items-center justify-center gap-1 mt-0.5 flex-wrap">
          <p v-if="currentMonth.alias" class="font-fell text-xs md:text-sm text-muted-foreground italic">
            {{ currentMonth.alias }} ·
          </p>
          <input
            :value="calendar.currentYear"
            type="number"
            class="w-16 md:w-20 bg-transparent border-b border-border text-center font-fell text-xs md:text-sm text-muted-foreground italic focus:outline-none focus:border-primary"
            @change="onYearInput"
          />
          <p class="font-fell text-xs md:text-sm text-muted-foreground italic">
            {{ calendar.adapter.epochName }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <button
          class="rounded-md border border-border px-2 py-1.5 font-fell text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          @click="calendar.nextMonth()"
        >
          <span class="hidden sm:inline">Next</span> →
        </button>
        <button
          title="Next year"
          class="rounded-md border border-border px-2 py-1.5 font-fell text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          @click="calendar.goToYear(calendar.currentYear + 1)"
        >
          ▶▶
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <template v-else>
      <!-- Optional day-of-week column headers (Gregorian, Greyhawk, etc.) -->
      <div
        v-if="calendar.adapter.dayLabels"
        :class="gridColsClass"
        class="grid gap-1 mb-1 px-0"
      >
        <div
          v-for="label in calendar.adapter.dayLabels"
          :key="label"
          class="text-center font-cinzel text-xs font-semibold tracking-wider text-muted-foreground py-1"
        >
          {{ label.slice(0, 3) }}
        </div>
      </div>

      <!-- Week rows -->
      <div v-for="(row, rowIdx) in gridRows" :key="rowIdx" class="mb-4">
        <p class="font-cinzel text-xs font-semibold tracking-widest text-muted-foreground mb-2">
          {{ weekRowLabel(rowIdx) }}
        </p>
        <div :class="gridColsClass" class="grid gap-1">
          <div
            v-for="(day, colIdx) in row"
            :key="colIdx"
            class="relative rounded-md border min-h-14 p-1.5 flex flex-col transition-colors"
            :class="[
              day !== null
                ? 'border-border bg-card hover:border-primary/50 cursor-pointer'
                : 'border-transparent bg-transparent',
              day !== null && hasEvents(day) ? 'ring-1 ring-primary/40' : '',
            ]"
            @click="day !== null && emit('create-event', day)"
          >
            <span
              v-if="day !== null"
              class="font-cinzel text-xs font-semibold text-muted-foreground leading-none"
            >
              {{ day }}
            </span>
            <!-- Event dots -->
            <div v-if="day !== null" class="flex flex-wrap gap-0.5 mt-auto pt-1">
              <span
                v-for="event in eventsForDay(day)"
                :key="event.id"
                :title="event.title"
                :style="{ backgroundColor: event.color }"
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
          <span v-if="festival.isLeapOnly" class="font-fell text-xs text-muted-foreground italic">
            (leap year)
          </span>
        </div>
        <p class="font-fell text-sm text-muted-foreground italic">
          {{ festival.description }}
        </p>
        <!-- Festival events -->
        <div v-if="eventsForFestival(festival.name).length" class="mt-2 flex flex-wrap gap-1.5">
          <span
            v-for="event in eventsForFestival(festival.name)"
            :key="event.id"
            :style="{ borderColor: event.color, color: event.color }"
            class="inline-flex items-center gap-1 border rounded px-1.5 py-0.5 font-fell text-xs"
          >
            <span :style="{ backgroundColor: event.color }" class="w-1.5 h-1.5 rounded-full" />
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
            class="flex items-center gap-2 rounded-md bg-card border border-border px-3 py-2 group cursor-pointer hover:border-primary/40 transition-colors"
            @click="!entityLink(event) && emit('edit-event', event)"
          >
            <span
              :style="{ backgroundColor: event.color }"
              class="w-2.5 h-2.5 rounded-full shrink-0"
            />
            <component
              :is="entityIcon(event)"
              v-if="entityIcon(event)"
              class="h-3.5 w-3.5 text-muted-foreground shrink-0"
            />
            <span class="font-fell text-sm text-foreground flex-1 truncate">{{ event.title }}</span>
            <span class="font-fell text-xs text-muted-foreground italic shrink-0">
              {{ formatEventDate(event) }}
            </span>
            <span class="hidden md:inline font-cinzel text-xs text-muted-foreground/40 uppercase tracking-wider shrink-0">
              {{ event.event_type }}
            </span>
          </component>
        </div>
      </div>

      <div v-else-if="!isLoading" class="mt-6">
        <p class="font-fell text-sm text-muted-foreground italic text-center">
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
import { Scroll, Swords, MapPin } from "lucide-vue-next";
import { useCalendarStore } from "@/stores/calendar";
import { useCalendarEvents } from "@/composables/useCalendarEvents";
import { linkedEntityType, linkedEntityId } from "@/types/calendar.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import type { CalendarEvent } from "@/types/calendar.types";

const emit = defineEmits<{
  "edit-event": [event: CalendarEvent];
  "create-event": [day: number];
}>();

const calendar = useCalendarStore();
const yearRef = toRef(calendar, "currentYear");
const { data: events, isLoading } = useCalendarEvents(yearRef);

const currentMonth = computed(
  () =>
    calendar.adapter.months.find((m) => m.num === calendar.currentMonth) ??
    calendar.adapter.months[0],
);

// Dynamic Tailwind grid class based on week size.
// 10-day (Harptos) tendays show 5 columns on mobile so each tenday
// wraps into two rows of 5 instead of squashing 10 cells onto a phone screen.
const gridColsClass = computed(() =>
  calendar.adapter.weekSize === 7 ? "grid-cols-7" : "grid-cols-5 md:grid-cols-10",
);

// Build grid rows: each row is an array of day numbers (or null for empty offset cells).
// Handles Gregorian-style weekday offsets and variable month lengths.
const gridRows = computed(() => {
  const weekSize = calendar.adapter.weekSize;
  const monthDays = currentMonth.value.days;
  // For Gregorian, February has 29 days in leap years
  const actualDays =
    calendar.currentMonth === 2 && calendar.adapter.isLeapYear(calendar.currentYear)
      ? 29
      : monthDays;
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

function onYearInput(e: Event) {
  const val = parseInt((e.target as HTMLInputElement).value, 10);
  if (!isNaN(val) && val > 0) calendar.goToYear(val);
}

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
  if (type === "quest") return Scroll;
  if (type === "encounter") return Swords;
  if (type === "location") return MapPin;
  return null;
}
</script>
