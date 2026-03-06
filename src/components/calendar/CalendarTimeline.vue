<template>
  <div>
    <!-- Controls bar -->
    <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
      <!-- Year/month navigation -->
      <div class="flex items-center gap-2">
        <button
          class="rounded-md border border-border px-2.5 py-1 font-fell text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          @click="shiftBack"
        >
          ←
        </button>
        <div class="text-center min-w-36">
          <p class="font-cinzel text-sm font-semibold text-foreground">
            {{ rangeLabel }}
          </p>
        </div>
        <button
          class="rounded-md border border-border px-2.5 py-1 font-fell text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          @click="shiftForward"
        >
          →
        </button>
      </div>

      <!-- Zoom selector -->
      <div class="flex items-center gap-1">
        <span class="font-cinzel text-xs text-muted-foreground tracking-wider mr-1">ZOOM</span>
        <button
          v-for="z in ZOOM_PRESETS"
          :key="z.value"
          class="rounded border px-2 py-0.5 font-cinzel text-xs font-semibold tracking-wider transition-colors"
          :class="zoomYears === z.value
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:text-foreground'"
          @click="setZoom(z.value)"
        >
          {{ z.label }}
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
      class="overflow-x-auto rounded-lg border border-border bg-card"
    >
      <div
        :style="{ width: timelineWidth + 'px', minWidth: '100%', height: containerHeight + 'px' }"
        class="relative"
      >
        <!-- Axis line -->
        <div
          class="absolute left-0 right-0 bg-border"
          :style="{ height: '2px', top: axisY + 'px' }"
        />

        <!-- Ticks + labels -->
        <template v-if="zoomMode === 'years'">
          <div
            v-for="year in yearTicks"
            :key="year"
            :style="{ left: fractionalYearToX(year) + 'px', top: axisY + 'px' }"
            class="absolute"
            style="transform: translate(-50%, -50%);"
          >
            <div
              class="bg-border mx-auto"
              :class="year % 10 === 0 ? 'w-px h-5' : 'w-px h-3'"
            />
            <span
              class="absolute font-cinzel font-semibold text-muted-foreground whitespace-nowrap"
              :class="year % 10 === 0 ? 'text-xs' : 'text-[10px]'"
              style="top: 14px; left: 50%; transform: translateX(-50%);"
            >
              {{ year }}
            </span>
          </div>
        </template>

        <template v-else-if="zoomMode === 'months'">
          <div
            v-for="tick in monthTicks"
            :key="tick.key"
            :style="{ left: fractionalYearToX(tick.frac) + 'px', top: axisY + 'px' }"
            class="absolute"
            style="transform: translate(-50%, -50%);"
          >
            <div
              class="bg-border mx-auto"
              :class="tick.isFirst ? 'w-px h-6' : 'w-px h-3'"
            />
            <span
              class="absolute font-cinzel font-semibold text-muted-foreground whitespace-nowrap"
              :class="tick.isFirst ? 'text-xs' : 'text-[10px]'"
              style="top: 16px; left: 50%; transform: translateX(-50%);"
            >
              {{ tick.label }}
            </span>
          </div>
        </template>

        <template v-else>
          <!-- Day ticks (1-month zoom) -->
          <div
            v-for="tick in dayTicks"
            :key="tick.day"
            :style="{ left: fractionalYearToX(tick.frac) + 'px', top: axisY + 'px' }"
            class="absolute"
            style="transform: translate(-50%, -50%);"
          >
            <div
              class="bg-border mx-auto"
              :class="tick.day % 10 === 1 ? 'w-px h-6' : 'w-px h-3'"
            />
            <span
              class="absolute font-cinzel font-semibold text-muted-foreground whitespace-nowrap text-[10px]"
              style="top: 16px; left: 50%; transform: translateX(-50%);"
            >
              {{ tick.day % 5 === 0 || tick.day === 1 ? tick.label : '' }}
            </span>
          </div>
        </template>

        <!-- Current year/month marker -->
        <div
          :style="{ left: currentMarkerX + 'px', top: axisY + 'px' }"
          class="absolute z-10"
          style="transform: translate(-50%, -50%);"
        >
          <div class="w-0.5 h-10 bg-primary mx-auto" />
          <span
            class="absolute font-cinzel text-xs font-bold text-primary whitespace-nowrap"
            style="top: 20px; left: 50%; transform: translateX(-50%);"
          >
            ★ {{ calendar.currentYear }}
          </span>
        </div>

        <!-- Events -->
        <template v-for="pe in positionedEvents" :key="pe.event.id">
          <!-- Multi-day bar -->
          <div
            v-if="pe.event.is_multi_day && pe.endX !== null && pe.endX > pe.x"
            :style="{
              left: pe.x + 'px',
              width: (pe.endX - pe.x) + 'px',
              top: (pe.above ? axisY - pe.lane * LANE_HEIGHT - 10 : axisY + pe.lane * LANE_HEIGHT - 2) + 'px',
              backgroundColor: pe.event.color + '33',
              borderColor: pe.event.color,
            }"
            class="absolute h-5 border rounded-sm cursor-pointer hover:brightness-125 transition-all z-10"
            :title="pe.event.title"
            @click="emit('edit-event', pe.event)"
          />

          <!-- Vertical stem -->
          <div
            :style="{
              left: pe.x + 'px',
              backgroundColor: pe.event.color,
              height: (pe.lane * LANE_HEIGHT + 18) + 'px',
              top: pe.above
                ? (axisY - pe.lane * LANE_HEIGHT - 18) + 'px'
                : (axisY + 2) + 'px',
            }"
            class="absolute w-px"
          />

          <!-- Dot on axis -->
          <div
            :style="{
              left: pe.x + 'px',
              top: axisY + 'px',
              backgroundColor: pe.event.color,
            }"
            class="absolute w-3 h-3 rounded-full border-2 border-card cursor-pointer hover:scale-125 transition-transform z-20"
            style="transform: translate(-50%, -50%);"
            :title="pe.event.title"
            @click="emit('edit-event', pe.event)"
          />

          <!-- Label -->
          <div
            :style="{
              left: pe.x + 'px',
              top: pe.above
                ? (axisY - pe.lane * LANE_HEIGHT - 22) + 'px'
                : (axisY + pe.lane * LANE_HEIGHT + 18) + 'px',
              color: pe.event.color,
            }"
            class="absolute font-fell text-xs font-semibold pointer-events-none max-w-32 text-center leading-tight"
            style="transform: translateX(-50%);"
            :title="pe.event.title"
          >
            {{ pe.event.title }}
          </div>
        </template>

        <!-- Empty state -->
        <div
          v-if="!positionedEvents.length"
          class="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <p class="font-fell text-sm text-muted-foreground italic">
            No events in this period. Add one with the button above.
          </p>
        </div>
      </div>
    </div>

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

const AXIS_PADDING = 60   // px padding left + right
const LANE_HEIGHT = 30    // px between stacked event lanes
const CONTAINER_HEIGHT = 340

const ZOOM_PRESETS = [
  { value: 1 / 12, label: '1mo' },
  { value: 1,      label: '1yr' },
  { value: 10,     label: '10yr' },
  { value: 20,     label: '20yr' },
  { value: 50,     label: '50yr' },
  { value: 100,    label: '100yr' },
]

const emit = defineEmits<{
  'edit-event': [event: CalendarEvent]
}>()

const calendar = useCalendarStore()
const jumpYear = ref<number>(calendar.currentYear)

const zoomYears = computed(() => calendar.timelineZoom)

// Zoom mode determines which tick type to render
const zoomMode = computed((): 'days' | 'months' | 'years' => {
  if (zoomYears.value <= 1 / 11) return 'days'
  if (zoomYears.value <= 1.5) return 'months'
  return 'years'
})

// Center the view on current month when zoomed in finely
const centerFrac = computed(() => {
  if (zoomMode.value === 'days') {
    return calendar.currentYear + (calendar.currentMonth - 0.5) / 12
  }
  if (zoomMode.value === 'months') {
    return calendar.currentYear + (calendar.currentMonth - 1) / 12
  }
  return calendar.currentYear
})

const startFrac = computed(() => centerFrac.value - zoomYears.value / 2)
const endFrac   = computed(() => centerFrac.value + zoomYears.value / 2)

// Integer year range for the Supabase query
const queryStart = computed(() => Math.floor(startFrac.value))
const queryEnd   = computed(() => Math.ceil(endFrac.value))

// Pixels per year — scales so the timeline is a useful width for each zoom
const pixelsPerYear = computed(() => {
  if (zoomYears.value <= 1 / 11) return 8400   // 1 month: ~700px
  if (zoomYears.value <= 1.5)    return 840    // 1 year: ~840px
  if (zoomYears.value <= 15)     return 100    // 10 years
  if (zoomYears.value <= 30)     return 60     // 20 years
  if (zoomYears.value <= 75)     return 24     // 50 years
  return 12                                    // 100 years
})

const timelineWidth = computed(() =>
  Math.round(zoomYears.value * pixelsPerYear.value + AXIS_PADDING * 2)
)

const containerHeight = CONTAINER_HEIGHT
const axisY = Math.floor(CONTAINER_HEIGHT / 2)

// Convert a fractional year to an x pixel position
function fractionalYearToX(frac: number): number {
  return AXIS_PADDING + (frac - startFrac.value) * pixelsPerYear.value
}

// Convert an event's date to a fractional year
function eventToFrac(event: CalendarEvent): number {
  if (event.festival_day) {
    const festDay = calendar.adapter.intercalaryDays.find(d => d.name === event.festival_day)
    if (festDay) {
      const dayOfYear = festDay.afterMonth * 30 + 0.5
      return event.harptos_year + dayOfYear / 365
    }
  }
  if (event.harptos_month !== null && event.harptos_day !== null) {
    const dayOfYear = (event.harptos_month - 1) * 30 + event.harptos_day
    return event.harptos_year + dayOfYear / 365
  }
  return event.harptos_year
}

function endFracForEvent(event: CalendarEvent): number | null {
  if (!event.is_multi_day || event.end_year === null) return null
  if (event.end_month !== null && event.end_day !== null) {
    const dayOfYear = (event.end_month - 1) * 30 + event.end_day
    return event.end_year + dayOfYear / 365
  }
  return event.end_year
}

const { data: events, isLoading } = useCalendarEventsRange(queryStart, queryEnd)

// Year ticks for multi-year zoom
const yearTicks = computed(() => {
  const step = zoomYears.value >= 50 ? 5 : (zoomYears.value >= 20 ? 2 : 1)
  const first = Math.ceil(queryStart.value / step) * step
  const ticks: number[] = []
  for (let y = first; y <= queryEnd.value; y += step) {
    ticks.push(y)
  }
  return ticks
})

// Month ticks for 1-year zoom
const monthTicks = computed(() => {
  const ticks: { key: string; frac: number; label: string; isFirst: boolean }[] = []
  const sy = Math.floor(startFrac.value)
  const ey = Math.ceil(endFrac.value)
  for (let y = sy; y <= ey; y++) {
    for (const m of calendar.adapter.months) {
      const frac = y + (m.num - 1) / 12
      if (frac >= startFrac.value - 0.01 && frac <= endFrac.value + 0.01) {
        ticks.push({
          key: `${y}-${m.num}`,
          frac,
          label: m.num === 1 ? `${m.name} ${y}` : m.name,
          isFirst: m.num === 1,
        })
      }
    }
  }
  return ticks
})

// Day ticks for 1-month zoom
const dayTicks = computed(() => {
  const ticks: { day: number; frac: number; label: string }[] = []
  const y = calendar.currentYear
  const m = calendar.currentMonth
  const monthName = calendar.adapter.months.find(mo => mo.num === m)?.name ?? ''
  for (let d = 1; d <= 30; d++) {
    const frac = y + ((m - 1) * 30 + d) / 365
    ticks.push({ day: d, frac, label: d === 1 ? `${d} ${monthName}` : `${d}` })
  }
  return ticks
})

const currentMarkerX = computed(() =>
  fractionalYearToX(calendar.currentYear + (calendar.currentMonth - 1) / 12)
)

// Human-readable range label for the nav bar
const rangeLabel = computed(() => {
  const ep = calendar.adapter.epochName
  if (zoomMode.value === 'days') {
    const m = calendar.adapter.months.find(mo => mo.num === calendar.currentMonth)
    return `${m?.name ?? ''} ${calendar.currentYear} ${ep}`
  }
  if (zoomMode.value === 'months') {
    return `${Math.round(startFrac.value)} – ${Math.round(endFrac.value)} ${ep}`
  }
  return `${Math.round(startFrac.value)} – ${Math.round(endFrac.value)} ${ep}`
})

// ── Event positioning ───────────────────────────────────────────────────────

interface PositionedEvent {
  event: CalendarEvent
  x: number
  endX: number | null
  above: boolean
  lane: number
}

const positionedEvents = computed((): PositionedEvent[] => {
  const list = (events.value ?? [])
    .filter(e => {
      const frac = eventToFrac(e)
      return frac >= startFrac.value - 0.01 && frac <= endFrac.value + 0.01
    })
    .sort((a, b) => eventToFrac(a) - eventToFrac(b))

  // Lane assignment to avoid label collisions
  const aboveLanes: [number, number][][] = []
  const belowLanes: [number, number][][] = []

  return list.map((event, i) => {
    const x    = fractionalYearToX(eventToFrac(event))
    const ef   = endFracForEvent(event)
    const endX = ef !== null ? fractionalYearToX(ef) : null
    const above = i % 2 === 0

    const lanes = above ? aboveLanes : belowLanes
    const labelPx = 130
    let lane = 1

    for (let l = 1; l <= 12; l++) {
      if (!lanes[l]) { lane = l; break }
      const collides = lanes[l].some(([s, e]) => x < e + labelPx && x + labelPx > s)
      if (!collides) { lane = l; break }
      lane = l + 1
    }

    if (!lanes[lane]) lanes[lane] = []
    lanes[lane].push([x, endX ?? x + labelPx])

    return { event, x, endX, above, lane }
  })
})

// ── Navigation ──────────────────────────────────────────────────────────────

function shiftBack() {
  if (zoomMode.value === 'days') {
    calendar.prevMonth()
  } else if (zoomMode.value === 'months') {
    calendar.goToYear(calendar.currentYear - 1)
  } else {
    calendar.goToYear(Math.round(calendar.currentYear - zoomYears.value / 2))
  }
}

function shiftForward() {
  if (zoomMode.value === 'days') {
    calendar.nextMonth()
  } else if (zoomMode.value === 'months') {
    calendar.goToYear(calendar.currentYear + 1)
  } else {
    calendar.goToYear(Math.round(calendar.currentYear + zoomYears.value / 2))
  }
}

function setZoom(z: number) {
  calendar.setTimelineZoom(z)
}

function jumpToYear() {
  if (jumpYear.value) {
    calendar.goToYear(jumpYear.value)
  }
}
</script>
