<template>
  <div>
    <!-- Month navigation -->
    <div class="flex items-center justify-between mb-6">
      <button
        class="rounded-md border border-border px-3 py-1.5 font-fell text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        @click="calendar.prevMonth()"
      >
        ← Previous
      </button>

      <div class="text-center">
        <p class="font-cinzel text-xl font-semibold text-foreground">
          {{ currentMonth.name }}
        </p>
        <p class="font-fell text-sm text-muted-foreground italic">
          {{ currentMonth.alias }} · {{ calendar.currentYear }} {{ calendar.adapter.epochName }}
        </p>
      </div>

      <button
        class="rounded-md border border-border px-3 py-1.5 font-fell text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        @click="calendar.nextMonth()"
      >
        Next →
      </button>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <template v-else>
      <!-- Three tendays -->
      <div
        v-for="tenday in 3"
        :key="tenday"
        class="mb-4"
      >
        <p class="font-cinzel text-xs font-semibold tracking-widest text-muted-foreground mb-2">
          {{ TENDAY_NAMES[tenday - 1] }}
        </p>
        <div class="grid grid-cols-10 gap-1">
          <div
            v-for="dayOffset in 10"
            :key="dayOffset"
            :data-day="(tenday - 1) * 10 + dayOffset"
            class="relative rounded-md border border-border bg-card min-h-14 p-1.5 flex flex-col hover:border-primary/50 transition-colors cursor-default"
            :class="{ 'ring-1 ring-primary/40': hasEvents((tenday - 1) * 10 + dayOffset) }"
          >
            <span class="font-cinzel text-xs font-semibold text-muted-foreground leading-none">
              {{ (tenday - 1) * 10 + dayOffset }}
            </span>
            <!-- Event dots -->
            <div class="flex flex-wrap gap-0.5 mt-auto pt-1">
              <span
                v-for="event in eventsForDay((tenday - 1) * 10 + dayOffset)"
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
          <div
            v-for="event in monthEvents"
            :key="event.id"
            class="flex items-center gap-2 rounded-md bg-card border border-border px-3 py-2 group cursor-pointer hover:border-primary/40 transition-colors"
            @click="emit('edit-event', event)"
          >
            <span
              :style="{ backgroundColor: event.color }"
              class="w-2.5 h-2.5 rounded-full shrink-0"
            />
            <span class="font-fell text-sm text-foreground flex-1">{{ event.title }}</span>
            <span class="font-fell text-xs text-muted-foreground italic">
              {{ formatEventDate(event) }}
            </span>
            <span class="font-cinzel text-xs text-muted-foreground/40 uppercase tracking-wider">
              {{ event.event_type }}
            </span>
          </div>
        </div>
      </div>

      <div v-else-if="!isLoading" class="mt-6">
        <p class="font-fell text-sm text-muted-foreground italic text-center">
          No events recorded for {{ currentMonth.name }}, {{ calendar.currentYear }} {{ calendar.adapter.epochName }}.
        </p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useCalendarStore } from '@/stores/calendar'
import { useCalendarEvents } from '@/composables/useCalendarEvents'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import type { CalendarEvent } from '@/types/calendar.types'

const TENDAY_NAMES = ['First Tenday', 'Second Tenday', 'Third Tenday']

const emit = defineEmits<{
  'edit-event': [event: CalendarEvent]
}>()

const calendar = useCalendarStore()
const yearRef = toRef(calendar, 'currentYear')
const { data: events, isLoading } = useCalendarEvents(yearRef)

const currentMonth = computed(() =>
  calendar.adapter.months.find(m => m.num === calendar.currentMonth)
  ?? calendar.adapter.months[0]
)

// Festival days that fall right after the current month
const festivalsAfterCurrentMonth = computed(() =>
  calendar.adapter.intercalaryDays.filter(d => {
    if (d.afterMonth !== calendar.currentMonth) return false
    if (d.isLeapOnly && !calendar.adapter.isLeapYear(calendar.currentYear)) return false
    return true
  })
)

// Events for the current month (non-festival)
const monthEvents = computed(() =>
  (events.value ?? []).filter(e => e.harptos_month === calendar.currentMonth)
)

function eventsForDay(day: number): CalendarEvent[] {
  return (events.value ?? []).filter(
    e => e.harptos_month === calendar.currentMonth && e.harptos_day === day
  )
}

function hasEvents(day: number): boolean {
  return eventsForDay(day).length > 0
}

function eventsForFestival(festivalName: string): CalendarEvent[] {
  return (events.value ?? []).filter(e => e.festival_day === festivalName)
}

function formatEventDate(event: CalendarEvent): string {
  if (event.festival_day) return event.festival_day
  if (event.harptos_day) {
    const tenday = Math.ceil(event.harptos_day / 10)
    return `Day ${event.harptos_day} (Tenday ${tenday})`
  }
  return ''
}
</script>
