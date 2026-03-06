<template>
  <div>
    <!-- Controls bar -->
    <div class="flex items-center justify-between mb-4 gap-4 flex-wrap">
      <!-- Year navigation -->
      <div class="flex items-center gap-2">
        <button
          class="rounded-md border border-border px-2.5 py-1 font-fell text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          @click="shiftYears(-zoomYears / 2)"
        >
          ←
        </button>
        <div class="text-center min-w-28">
          <p class="font-cinzel text-sm font-semibold text-foreground">
            {{ startYear }} – {{ endYear }} {{ calendar.adapter.epochName }}
          </p>
        </div>
        <button
          class="rounded-md border border-border px-2.5 py-1 font-fell text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          @click="shiftYears(zoomYears / 2)"
        >
          →
        </button>
      </div>

      <!-- Zoom selector -->
      <div class="flex items-center gap-1.5">
        <span class="font-cinzel text-xs text-muted-foreground tracking-wider">ZOOM</span>
        <button
          v-for="z in ZOOM_LEVELS"
          :key="z"
          class="rounded border px-2 py-0.5 font-cinzel text-xs font-semibold tracking-wider transition-colors"
          :class="zoomYears === z
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:text-foreground'"
          @click="setZoom(z)"
        >
          {{ z }}yr
        </button>
      </div>

      <!-- Jump to year -->
      <form class="flex items-center gap-1.5" @submit.prevent="jumpToYear">
        <input
          v-model.number="jumpYear"
          type="number"
          placeholder="Jump to year…"
          class="w-32 bg-muted border border-border rounded-md px-2 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="submit"
          class="rounded-md border border-border px-2.5 py-1 font-cinzel text-xs font-semibold text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          Go
        </button>
      </form>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <!-- Timeline canvas -->
    <div
      v-else
      ref="scrollContainer"
      class="overflow-x-auto rounded-lg border border-border bg-card"
    >
      <div
        :style="{ width: timelineWidth + 'px', minWidth: '100%' }"
        class="relative"
        :class="{ 'min-h-80': positionedEvents.length === 0, 'min-h-64': positionedEvents.length > 0 }"
      >
        <!-- Axis line -->
        <div
          class="absolute left-0 right-0 bg-border"
          style="height: 2px; top: 50%; transform: translateY(-50%);"
        />

        <!-- Year tick marks -->
        <div
          v-for="year in yearTicks"
          :key="year"
          :style="{ left: yearToX(year) + 'px' }"
          class="absolute flex flex-col items-center"
          style="top: 50%; transform: translate(-50%, -50%);"
        >
          <!-- Tick -->
          <div
            class="bg-border"
            :class="year % 10 === 0 ? 'w-px h-5' : 'w-px h-3'"
          />
          <!-- Year label (below axis) -->
          <span
            class="font-cinzel font-semibold text-muted-foreground absolute whitespace-nowrap"
            :class="year % 10 === 0 ? 'text-xs' : 'text-[10px]'"
            style="top: calc(50% + 14px); transform: translateX(-50%);"
          >
            {{ year }}
          </span>
        </div>

        <!-- Current year marker -->
        <div
          :style="{ left: yearToX(calendar.currentYear) + 'px' }"
          class="absolute flex flex-col items-center z-10"
          style="top: 50%; transform: translate(-50%, -50%);"
        >
          <div class="w-0.5 h-8 bg-primary" />
          <span
            class="font-cinzel text-xs font-bold text-primary absolute whitespace-nowrap"
            style="top: calc(50% + 18px); transform: translateX(-50%);"
          >
            ★ {{ calendar.currentYear }}
          </span>
        </div>

        <!-- Events -->
        <template v-for="pe in positionedEvents" :key="pe.event.id">
          <!-- Multi-day bar -->
          <div
            v-if="pe.event.is_multi_day && pe.endX !== null"
            :style="{
              left: pe.x + 'px',
              width: (pe.endX - pe.x) + 'px',
              top: pe.above ? (timelineMiddle - pe.lane * LANE_HEIGHT - 12) + 'px' : (timelineMiddle + pe.lane * LANE_HEIGHT) + 'px',
              backgroundColor: pe.event.color + '33',
              borderColor: pe.event.color,
            }"
            class="absolute h-5 border rounded-sm cursor-pointer hover:brightness-125 transition-all"
            :title="pe.event.title"
            @click="emit('edit-event', pe.event)"
          />

          <!-- Vertical stem -->
          <div
            :style="{
              left: pe.x + 'px',
              backgroundColor: pe.event.color,
              height: (pe.lane * LANE_HEIGHT + 20) + 'px',
              top: pe.above
                ? (timelineMiddle - pe.lane * LANE_HEIGHT - 20) + 'px'
                : (timelineMiddle + 2) + 'px',
            }"
            class="absolute w-px"
          />

          <!-- Dot on axis -->
          <div
            :style="{
              left: pe.x + 'px',
              top: timelineMiddle + 'px',
              backgroundColor: pe.event.color,
              transform: 'translate(-50%, -50%)',
            }"
            class="absolute w-3 h-3 rounded-full border-2 border-card cursor-pointer hover:scale-125 transition-transform z-10"
            :title="pe.event.title"
            @click="emit('edit-event', pe.event)"
          />

          <!-- Label -->
          <div
            :style="{
              left: pe.x + 'px',
              top: pe.above
                ? (timelineMiddle - pe.lane * LANE_HEIGHT - 24) + 'px'
                : (timelineMiddle + pe.lane * LANE_HEIGHT + 20) + 'px',
              transform: 'translateX(-50%)',
              color: pe.event.color,
            }"
            class="absolute font-fell text-xs whitespace-nowrap cursor-pointer font-semibold pointer-events-none max-w-32 truncate text-center"
            :title="pe.event.title"
          >
            {{ pe.event.title }}
          </div>
        </template>

        <!-- Empty state -->
        <div
          v-if="!positionedEvents.length && !isLoading"
          class="absolute inset-0 flex items-center justify-center pointer-events-none"
          style="top: 30%;"
        >
          <p class="font-fell text-sm text-muted-foreground italic">
            No events in this period. Add one with the button above.
          </p>
        </div>
      </div>
    </div>

    <!-- Legend / event count -->
    <p v-if="positionedEvents.length" class="mt-2 font-fell text-xs text-muted-foreground italic text-right">
      {{ positionedEvents.length }} event{{ positionedEvents.length === 1 ? '' : 's' }} · click any to edit
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCalendarStore } from '@/stores/calendar'
import { useCalendarEventsRange } from '@/composables/useCalendarEvents'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import type { CalendarEvent } from '@/types/calendar.types'
import type { TimelineZoom } from '@/stores/calendar'

const ZOOM_LEVELS: TimelineZoom[] = [10, 20, 50, 100]
const PIXELS_PER_YEAR = 80
const LANE_HEIGHT = 28   // vertical spacing between stacked event labels
const AXIS_PADDING = 40  // px padding on each side

const emit = defineEmits<{
  'edit-event': [event: CalendarEvent]
}>()

const calendar = useCalendarStore()

const zoomYears = computed(() => calendar.timelineZoom)

const startYear = computed(() =>
  Math.floor(calendar.currentYear - zoomYears.value / 2)
)
const endYear = computed(() =>
  startYear.value + zoomYears.value
)

const timelineWidth = computed(() =>
  zoomYears.value * PIXELS_PER_YEAR + AXIS_PADDING * 2
)

// Centre Y of the timeline (used for positioning events above/below axis)
const timelineMiddle = 160  // px from top of container

const { data: events, isLoading } = useCalendarEventsRange(startYear, endYear)

// All integer years visible, for tick marks
const yearTicks = computed(() => {
  const ticks: number[] = []
  const step = zoomYears.value >= 50 ? 5 : (zoomYears.value >= 20 ? 2 : 1)
  const first = Math.ceil(startYear.value / step) * step
  for (let y = first; y <= endYear.value; y += step) {
    ticks.push(y)
  }
  return ticks
})

// Convert a year (+ fractional month) to an x pixel position
function yearToX(year: number, month: number | null = null, day: number | null = null): number {
  let fractional = 0
  if (month !== null && day !== null) {
    fractional = ((month - 1) * 30 + day) / 365
  } else if (month !== null) {
    fractional = (month - 1) / 12
  }
  return AXIS_PADDING + (year - startYear.value + fractional) * PIXELS_PER_YEAR
}

function endXForEvent(event: CalendarEvent): number | null {
  if (!event.is_multi_day || event.end_year === null) return null
  return yearToX(event.end_year, event.end_month, event.end_day)
}

interface PositionedEvent {
  event: CalendarEvent
  x: number
  endX: number | null
  above: boolean
  lane: number
}

const positionedEvents = computed((): PositionedEvent[] => {
  const list = events.value ?? []
  // Sort by start position
  const sorted = [...list].sort((a, b) => {
    if (a.harptos_year !== b.harptos_year) return a.harptos_year - b.harptos_year
    return (a.harptos_month ?? 0) - (b.harptos_month ?? 0)
  })

  // Assign lanes to avoid label collision
  // Track occupied x-ranges per lane (above and below separately)
  const aboveLanes: [number, number][][] = []  // aboveLanes[lane] = array of [xStart, xEnd]
  const belowLanes: [number, number][][] = []

  return sorted.map((event, i) => {
    const x = yearToX(event.harptos_year, event.harptos_month, event.harptos_day)
    const endX = endXForEvent(event)
    const above = i % 2 === 0

    // Find smallest lane that doesn't collide
    const lanes = above ? aboveLanes : belowLanes
    const labelWidth = 130  // rough px width of label
    let lane = 1

    for (let l = 1; l <= 10; l++) {
      if (!lanes[l]) {
        lane = l
        break
      }
      const occupied = lanes[l]
      const collides = occupied.some(([s, e]) => x < e + labelWidth && x + labelWidth > s)
      if (!collides) {
        lane = l
        break
      }
      lane = l + 1
    }

    if (!lanes[lane]) lanes[lane] = []
    lanes[lane].push([x, endX ?? x + labelWidth])

    return { event, x, endX, above, lane }
  })
})

const scrollContainer = ref<HTMLElement | null>(null)
const jumpYear = ref<number>(calendar.currentYear)

function shiftYears(delta: number) {
  calendar.goToYear(Math.round(calendar.currentYear + delta))
}

function setZoom(z: TimelineZoom) {
  calendar.setTimelineZoom(z)
}

function jumpToYear() {
  if (jumpYear.value) {
    calendar.goToYear(jumpYear.value)
  }
}
</script>
