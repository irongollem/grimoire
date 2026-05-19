<template>
  <div>
    <!-- Controls bar -->
    <CalendarTimelineControls
      :range-label="rangeLabel"
      :zoom-years="zoomYears"
      :zoom-presets="ZOOM_PRESETS"
      :initial-year="calendar.currentYear"
      @shift-back="shiftBack"
      @shift-forward="shiftForward"
      @set-zoom="setZoom"
      @jump-to-year="jumpToYear"
    />

    <!-- Loading -->
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <!-- Timeline canvas -->
    <div
      v-else
      ref="canvasWrapper"
      class="rounded-lg border border-border bg-card overflow-hidden"
    >
      <div
        :style="{ width: '100%', height: containerHeight + 'px' }"
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
            style="transform: translate(-50%, -50%)"
          >
            <div
              class="bg-border mx-auto"
              :class="year % 10 === 0 ? 'w-px h-5' : 'w-px h-3'"
            />
            <span
              class="absolute font-cinzel font-semibold text-muted-foreground whitespace-nowrap"
              :class="year % 10 === 0 ? 'text-xs' : 'text-[10px]'"
              style="top: 14px; left: 50%; transform: translateX(-50%)"
            >
              {{ year }}
            </span>
          </div>
        </template>

        <template v-else-if="zoomMode === 'months'">
          <div
            v-for="tick in monthTicks"
            :key="tick.key"
            :style="{
              left: fractionalYearToX(tick.frac) + 'px',
              top: axisY + 'px',
            }"
            class="absolute"
            style="transform: translate(-50%, -50%)"
          >
            <div
              class="bg-border mx-auto"
              :class="tick.isFirst ? 'w-px h-6' : 'w-px h-3'"
            />
            <span
              v-if="tick.isFirst || pixelsPerYear / 12 >= 50"
              class="absolute font-cinzel font-semibold text-muted-foreground whitespace-nowrap"
              :class="tick.isFirst ? 'text-xs' : 'text-[10px]'"
              style="top: 16px; left: 50%; transform: translateX(-50%)"
            >
              {{ tick.label }}
            </span>
          </div>
        </template>

        <template v-else>
          <!-- Day ticks — bar and label are separate so tick height doesn't shift the label -->
          <template v-for="tick in dayTicks" :key="tick.day">
            <div
              class="absolute bg-border"
              :class="
                tick.day % calendar.adapter.weekSize === 0
                  ? 'w-px h-6'
                  : 'w-px h-3'
              "
              :style="{
                left: fractionalYearToX(tick.frac) + 'px',
                top: axisY + 'px',
                transform: 'translate(-50%, -50%)',
              }"
            />
            <span
              class="absolute font-cinzel font-semibold text-muted-foreground whitespace-nowrap text-[10px]"
              :style="{
                left: fractionalYearToX(tick.frac) + 'px',
                top: axisY + 8 + 'px',
                transform: 'translateX(-50%)',
              }"
            >
              {{
                isWeekZoom || tick.day % 5 === 0 || tick.day === 1
                  ? tick.label
                  : ""
              }}
            </span>
          </template>
        </template>

        <!-- Current year/month marker -->
        <div
          :style="{ left: currentMarkerX + 'px', top: axisY + 'px' }"
          class="absolute z-10"
          style="transform: translate(-50%, -50%)"
        >
          <div class="w-0.5 h-10 bg-primary mx-auto" />
          <span
            class="absolute font-cinzel text-xs font-bold text-primary whitespace-nowrap"
            style="top: 20px; left: 50%; transform: translateX(-50%)"
          >
            ★ {{ calendar.currentYear }}
          </span>
        </div>

        <!-- Today: past tint -->
        <div
          v-if="todayMarkerX !== null"
          :style="{ width: todayMarkerX + 'px' }"
          class="absolute inset-y-0 left-0 bg-muted/25 pointer-events-none z-20"
        />

        <!-- Today: full-height line + top label -->
        <div
          v-if="todayMarkerX !== null"
          :style="{ left: todayMarkerX + 'px' }"
          class="absolute inset-y-0 z-30 pointer-events-none"
          style="transform: translateX(-50%)"
        >
          <div class="w-px h-full bg-amber-400/70" />
          <span
            class="absolute font-cinzel text-xs font-bold text-amber-400 whitespace-nowrap"
            style="top: 4px; left: 50%; transform: translateX(-50%)"
          >
            ◆ Today
          </span>
        </div>

        <!-- Session strip separator -->
        <div
          class="absolute left-0 right-0 border-t border-dashed"
          style="border-color: rgba(255, 255, 255, 0.08)"
          :style="{ top: SESSION_STRIP_Y - 22 + 'px' }"
        />
        <span
          class="absolute font-cinzel font-bold tracking-widest text-muted-foreground uppercase"
          style="font-size: 9px; left: 4px"
          :style="{ top: SESSION_STRIP_Y - 18 + 'px' }"
          >Chronicle</span
        >

        <!-- Session events — every session is a bar in the dedicated strip -->
        <template v-for="pe in positionedSessionEvents" :key="pe.event.id">
          <!-- Bar: spans full days if multi-day, minimum 8px for single-day; same-day sessions hug each other -->
          <div
            :style="{
              left: pe.x + 'px',
              width: Math.max(8, (pe.endX ?? pe.naturalX) - pe.naturalX) + 'px',
              top: SESSION_STRIP_Y - SESSION_STRIP_HEIGHT / 2 + 'px',
              height: SESSION_STRIP_HEIGHT + 'px',
              backgroundColor: eventColor(pe.event) + '55',
              borderColor: eventColor(pe.event),
            }"
            class="absolute border rounded transition-all z-10 overflow-hidden flex items-center justify-center"
            :class="!readOnly ? 'cursor-pointer hover:brightness-125' : ''"
            :title="pe.event.title"
            @click="!readOnly && emit('edit-event', pe.event)"
          >
            <span
              v-if="Math.max(8, (pe.endX ?? pe.naturalX) - pe.naturalX) >= 36"
              class="font-fell text-[10px] font-semibold whitespace-nowrap px-1 leading-none pointer-events-none truncate"
              :style="{ color: eventColor(pe.event) }"
            >
              {{ pe.event.title }}
            </span>
          </div>
          <!-- Label above the bar for narrow sessions -->
          <div
            v-if="Math.max(8, (pe.endX ?? pe.naturalX) - pe.naturalX) < 36"
            :style="{
              left: pe.x + 'px',
              top: SESSION_STRIP_Y - SESSION_STRIP_HEIGHT / 2 - 14 + 'px',
              color: eventColor(pe.event),
            }"
            class="absolute font-fell text-[10px] font-semibold pointer-events-none whitespace-nowrap"
            style="transform: translateX(-50%)"
          >
            {{ pe.event.title }}
          </div>
        </template>

        <!-- Regular events (non-session) -->
        <template v-for="pe in positionedRegularEvents" :key="pe.event.id">
          <!-- Multi-day bar -->
          <div
            v-if="pe.event.is_multi_day && pe.endX !== null && pe.endX > pe.x"
            :style="{
              left: pe.x + 'px',
              width: pe.endX - pe.x + 'px',
              top:
                (pe.above
                  ? axisY - pe.lane * LANE_HEIGHT - 10
                  : axisY + pe.lane * LANE_HEIGHT - 2) + 'px',
              backgroundColor: eventColor(pe.event) + '33',
              borderColor: eventColor(pe.event),
            }"
            class="absolute h-5 border rounded-sm transition-all z-10"
            :class="!readOnly ? 'cursor-pointer hover:brightness-125' : ''"
            :title="pe.event.title"
            @click="!readOnly && emit('edit-event', pe.event)"
          />
          <!-- Vertical stem -->
          <div
            :style="{
              left: pe.x + 'px',
              backgroundColor: eventColor(pe.event),
              height: pe.lane * LANE_HEIGHT + 18 + 'px',
              top: pe.above
                ? axisY - pe.lane * LANE_HEIGHT - 18 + 'px'
                : axisY + 2 + 'px',
            }"
            class="absolute w-px"
          />
          <!-- Icon dot on axis -->
          <div
            :style="{
              left: pe.x + 'px',
              top: axisY + 'px',
              backgroundColor: eventColor(pe.event),
            }"
            class="absolute w-5 h-5 rounded-full flex items-center justify-center border-2 border-card transition-transform z-20"
            :class="!readOnly ? 'cursor-pointer hover:scale-125' : ''"
            style="transform: translate(-50%, -50%)"
            :title="pe.event.title"
            @click="!readOnly && emit('edit-event', pe.event)"
          >
            <component
              :is="EVENT_ICONS[pe.event.event_type] ?? IconStar"
              class="w-2.5 h-2.5 text-white"
            />
          </div>
          <!-- Label -->
          <div
            :style="{
              left: pe.x + 'px',
              top: pe.above
                ? axisY - pe.lane * LANE_HEIGHT - 22 + 'px'
                : axisY + pe.lane * LANE_HEIGHT + 18 + 'px',
              color: eventColor(pe.event),
            }"
            class="absolute font-fell text-xs font-semibold w-32 truncate text-center"
            :class="!readOnly ? 'cursor-pointer hover:underline' : ''"
            style="transform: translateX(-50%)"
            :title="pe.event.title"
            @click="!readOnly && emit('edit-event', pe.event)"
          >
            {{ pe.event.title }}
          </div>
        </template>

        <!-- Empty state -->
        <div
          v-if="
            !positionedRegularEvents.length && !positionedSessionEvents.length
          "
          class="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <p class="font-fell text-sm text-muted-foreground italic">
            No events in this period. Add one with the button above.
          </p>
        </div>
      </div>
    </div>

    <p
      v-if="positionedRegularEvents.length + positionedSessionEvents.length"
      class="mt-2 font-fell text-xs text-muted-foreground italic text-right"
    >
      {{
        positionedRegularEvents.length + positionedSessionEvents.length
      }}
      event{{
        positionedRegularEvents.length + positionedSessionEvents.length === 1
          ? ""
          : "s"
      }}
      <template v-if="!readOnly">· click any to edit</template>
    </p>

    <!-- Events in view list -->
    <CalendarTimelineEventList
      :events="visibleEvents"
      :read-only="readOnly"
      :is-loading="isLoading"
      :format-event-date="formatEventDate"
      @edit-event="emit('edit-event', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from "vue";
import type { Component } from "vue";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";
import { useCalendarEventsRange } from "@/composables/useCalendarEvents";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import CalendarTimelineControls from "@/components/calendar/CalendarTimelineControls.vue";
import CalendarTimelineEventList from "@/components/calendar/CalendarTimelineEventList.vue";
import { eventColor } from "@/types/calendar.types";
import type { CalendarEvent } from "@/types/calendar.types";
import { IconClock, IconEncounter, IconFire, IconGenerate, IconGlobe, IconMap, IconMonster, IconReveal, IconStar, IconUndead } from '@/lib/icons';

const AXIS_PADDING = 60; // px padding left + right
const LANE_HEIGHT = 30; // px between stacked event lanes
const CONTAINER_HEIGHT = 330;
const SESSION_STRIP_Y = 280;
const SESSION_STRIP_HEIGHT = 22;

const EVENT_ICONS: Record<string, Component> = {
  campaign: IconStar,
  session: IconEncounter,
  world: IconGlobe,
  festival: IconGenerate,
  deadline: IconClock,
  player_death: IconMonster,
  boss_fight: IconFire,
  discovery: IconReveal,
  npc_death: IconUndead,
  travel: IconMap,
};

const ZOOM_PRESETS = computed(() => [
  { value: calendar.adapter.weekSize / 365, label: "1wk" },
  { value: 1 / 12, label: "1mo" },
  { value: 1, label: "1yr" },
  { value: 10, label: "10yr" },
  { value: 20, label: "20yr" },
  { value: 50, label: "50yr" },
  { value: 100, label: "100yr" },
]);

const { eventsOverride = null, readOnly = false } = defineProps<{
  eventsOverride?: CalendarEvent[] | null;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  "edit-event": [event: CalendarEvent];
}>();

const calendar = useCalendarStore();
const campaignStore = useCampaignStore();

// Measure container so the timeline always fills available width.
// Uses watch() instead of onMounted() so it fires when the v-else div appears (after loading).
const canvasWrapper = ref<HTMLElement | null>(null);
const containerWidth = ref(900);
let resizeObserver: ResizeObserver | null = null;
watch(
  canvasWrapper,
  async (el) => {
    resizeObserver?.disconnect();
    if (el) {
      await nextTick(); // wait for layout to settle before measuring
      containerWidth.value = el.offsetWidth;
      resizeObserver = new ResizeObserver((entries) => {
        containerWidth.value = entries[0].contentRect.width;
      });
      resizeObserver.observe(el);
    }
  },
  { immediate: true },
);
onUnmounted(() => resizeObserver?.disconnect());

const zoomYears = computed(() => calendar.timelineZoom);

// Track which tenday (1-indexed) we're centred on for week-zoom navigation
const currentTenday = ref(1);
const tendaysPerMonth = computed(() =>
  Math.floor(30 / calendar.adapter.weekSize),
);
const isWeekZoom = computed(
  () => zoomYears.value <= (calendar.adapter.weekSize / 365) * 1.5,
);

// Zoom mode determines which tick type to render
const zoomMode = computed((): "days" | "months" | "years" => {
  if (zoomYears.value <= 1 / 6) return "days"; // covers both 1wk and 1mo
  if (zoomYears.value <= 1.5) return "months";
  return "years";
});

// Center the view on current position
const centerFrac = computed(() => {
  if (isWeekZoom.value) {
    const dayOfYear =
      (calendar.currentMonth - 1) * 30 +
      (currentTenday.value - 0.5) * calendar.adapter.weekSize;
    return calendar.currentYear + dayOfYear / 365;
  }
  if (zoomMode.value === "days") {
    return calendar.currentYear + (calendar.currentMonth - 0.5) / 12;
  }
  if (zoomMode.value === "months") {
    return calendar.currentYear + (calendar.currentMonth - 1) / 12;
  }
  return calendar.currentYear;
});

const startFrac = computed(() => centerFrac.value - zoomYears.value / 2);
const endFrac = computed(() => centerFrac.value + zoomYears.value / 2);

// Integer year range for the Supabase query
const queryStart = computed(() => Math.floor(startFrac.value));
const queryEnd = computed(() => Math.ceil(endFrac.value));

// Pixels per year — fills the measured container width exactly
const pixelsPerYear = computed(
  () => (containerWidth.value - AXIS_PADDING * 2) / zoomYears.value,
);

const containerHeight = CONTAINER_HEIGHT;
const axisY = 170;

// Convert a fractional year to an x pixel position
function fractionalYearToX(frac: number): number {
  return AXIS_PADDING + (frac - startFrac.value) * pixelsPerYear.value;
}

// Convert an event's date to a fractional year
function eventToFrac(event: CalendarEvent): number {
  if (event.festival_day) {
    const festDay = calendar.adapter.intercalaryDays.find(
      (d) => d.name === event.festival_day,
    );
    if (festDay) {
      const dayOfYear = festDay.afterMonth * 30 + 0.5;
      return event.harptos_year + dayOfYear / 365;
    }
  }
  if (event.harptos_month !== null && event.harptos_day !== null) {
    const dayOfYear = (event.harptos_month - 1) * 30 + event.harptos_day;
    return event.harptos_year + dayOfYear / 365;
  }
  return event.harptos_year;
}

function endFracForEvent(event: CalendarEvent): number | null {
  if (!event.is_multi_day || event.end_year === null) return null;
  if (event.end_month !== null && event.end_day !== null) {
    const dayOfYear = (event.end_month - 1) * 30 + event.end_day;
    return event.end_year + dayOfYear / 365;
  }
  return event.end_year;
}

const { data: fetchedEvents, isLoading } = useCalendarEventsRange(
  queryStart,
  queryEnd,
);
const events = computed(() => eventsOverride ?? fetchedEvents.value ?? null);

// Year ticks for multi-year zoom — step is chosen so labels never overlap
// (~40px per label is the minimum readable spacing for a 4-digit year).
const yearTicks = computed(() => {
  const minPx = 40;
  const ppy = pixelsPerYear.value;
  let step = 1;
  for (const s of [1, 2, 5, 10, 25, 50, 100]) {
    if (ppy * s >= minPx) { step = s; break; }
    step = s;
  }
  const first = Math.ceil(queryStart.value / step) * step;
  const ticks: number[] = [];
  for (let y = first; y <= queryEnd.value; y += step) {
    ticks.push(y);
  }
  return ticks;
});

// Month ticks for 1-year zoom
const monthTicks = computed(() => {
  const ticks: {
    key: string;
    frac: number;
    label: string;
    isFirst: boolean;
  }[] = [];
  const sy = Math.floor(startFrac.value);
  const ey = Math.ceil(endFrac.value);
  for (let y = sy; y <= ey; y++) {
    for (const m of calendar.adapter.months) {
      const frac = y + (m.num - 1) / 12;
      if (frac >= startFrac.value - 0.01 && frac <= endFrac.value + 0.01) {
        ticks.push({
          key: `${y}-${m.num}`,
          frac,
          label: m.num === 1 ? `${m.name} ${y}` : m.name,
          isFirst: m.num === 1,
        });
      }
    }
  }
  return ticks;
});

// Day ticks — for 1-month zoom shows full month; for 1-week zoom only the current tenday
const dayTicks = computed(() => {
  const ticks: { day: number; frac: number; label: string }[] = [];
  const y = calendar.currentYear;
  const m = calendar.currentMonth;
  const weekSize = calendar.adapter.weekSize;
  const monthName =
    calendar.adapter.months.find((mo) => mo.num === m)?.name ?? "";

  let dStart = 1;
  let dEnd = 30;
  if (isWeekZoom.value) {
    dStart = (currentTenday.value - 1) * weekSize + 1;
    dEnd = currentTenday.value * weekSize;
  }

  for (let d = dStart; d <= dEnd; d++) {
    const frac = y + ((m - 1) * 30 + d) / 365;
    ticks.push({
      day: d,
      frac,
      label: d === dStart ? `${d} ${monthName}` : `${d}`,
    });
  }
  return ticks;
});

const currentMarkerX = computed(() =>
  fractionalYearToX(calendar.currentYear + (calendar.currentMonth - 1) / 12),
);

// In-game "today" marker (campaign.todayYear/Month/Day)
const todayMarkerX = computed(() => {
  const dayOfYear = (campaignStore.todayMonth - 1) * 30 + campaignStore.todayDay;
  return fractionalYearToX(campaignStore.todayYear + dayOfYear / 365);
});

// Human-readable range label for the nav bar
const rangeLabel = computed(() => {
  const ep = calendar.adapter.epochName;
  const weekFrac = calendar.adapter.weekSize / 365;
  if (zoomMode.value === "days") {
    const m = calendar.adapter.months.find(
      (mo) => mo.num === calendar.currentMonth,
    );
    if (zoomYears.value <= weekFrac * 1.5) {
      return `${m?.name ?? ""} – Tenday ${currentTenday.value}, ${calendar.currentYear} ${ep}`;
    }
    return `${m?.name ?? ""} ${calendar.currentYear} ${ep}`;
  }
  return `${Math.round(startFrac.value)} – ${Math.round(endFrac.value)} ${ep}`;
});

// ── Event positioning ───────────────────────────────────────────────────────

interface PositionedEvent {
  event: CalendarEvent;
  x: number;
  endX: number | null;
  above: boolean;
  lane: number;
}

interface PositionedSessionEvent {
  event: CalendarEvent;
  x: number; // display x (may be pushed right to avoid overlap)
  naturalX: number; // true date position (used for width calc)
  endX: number | null;
}

// Max lanes that fit without overflowing: above goes up toward y=0, below must
// not cross the session strip at SESSION_STRIP_Y.
const MAX_ABOVE_LANE = Math.floor((axisY - 20) / LANE_HEIGHT); // ~4
const MAX_BELOW_LANE = Math.floor(
  (SESSION_STRIP_Y - SESSION_STRIP_HEIGHT - axisY - 20) / LANE_HEIGHT,
); // ~2

const positionedRegularEvents = computed((): PositionedEvent[] => {
  const list = (events.value ?? [])
    .filter((e) => {
      if (e.event_type === "session") return false;
      const frac = eventToFrac(e);
      return frac >= startFrac.value - 0.01 && frac <= endFrac.value + 0.01;
    })
    .sort((a, b) => eventToFrac(a) - eventToFrac(b));

  const aboveLanes: [number, number][][] = [];
  const belowLanes: [number, number][][] = [];
  const labelPx = 130;

  function firstFreeLane(
    lanes: [number, number][][],
    max: number,
    x: number,
  ): number | null {
    for (let l = 1; l <= max; l++) {
      if (!lanes[l]) return l;
      if (!lanes[l].some(([s, e]) => x < e + 8 && x + labelPx > s)) return l;
    }
    return null;
  }

  return list.map((event, i) => {
    const x = fractionalYearToX(eventToFrac(event));
    const ef = endFracForEvent(event);
    const endX = ef !== null ? fractionalYearToX(ef) : null;

    const preferAbove = i % 2 === 0;
    const aboveLane = firstFreeLane(aboveLanes, MAX_ABOVE_LANE, x);
    const belowLane = firstFreeLane(belowLanes, MAX_BELOW_LANE, x);

    let above: boolean;
    let lane: number;

    if (preferAbove) {
      if (aboveLane !== null) {
        above = true;
        lane = aboveLane;
      } else if (belowLane !== null) {
        above = false;
        lane = belowLane;
      } else {
        above = true;
        lane = MAX_ABOVE_LANE;
      }
    } else {
      if (belowLane !== null) {
        above = false;
        lane = belowLane;
      } else if (aboveLane !== null) {
        above = true;
        lane = aboveLane;
      } else {
        above = false;
        lane = MAX_BELOW_LANE;
      }
    }

    const lanesArr = above ? aboveLanes : belowLanes;
    if (!lanesArr[lane]) lanesArr[lane] = [];
    lanesArr[lane].push([x, endX ?? x + labelPx]);

    return { event, x, endX, above, lane };
  });
});

const positionedSessionEvents = computed((): PositionedSessionEvent[] => {
  const sorted = (events.value ?? [])
    .filter((e) => {
      if (e.event_type !== "session") return false;
      const frac = eventToFrac(e);
      return frac >= startFrac.value - 0.01 && frac <= endFrac.value + 0.01;
    })
    .sort((a, b) => {
      const fracDiff = eventToFrac(a) - eventToFrac(b);
      if (fracDiff !== 0) return fracDiff;
      // Same start date: shorter sessions first so they stay at naturalX
      const aEnd = endFracForEvent(a) ?? eventToFrac(a);
      const bEnd = endFracForEvent(b) ?? eventToFrac(b);
      if (aEnd !== bEnd) return aEnd - bEnd;
      // Same duration: natural sort on title ("Session 5" before "Session 6")
      return a.title.localeCompare(b.title, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

  let rightEdge = -Infinity;
  return sorted.map((event) => {
    const naturalX = fractionalYearToX(eventToFrac(event));
    const ef = endFracForEvent(event);
    const endX = ef !== null ? fractionalYearToX(ef) : null;
    const barWidth = Math.max(8, (endX ?? naturalX) - naturalX);
    const x = Math.max(naturalX, rightEdge);
    rightEdge = x + barWidth + 1;
    return { event, x, naturalX, endX };
  });
});

// ── Events list ─────────────────────────────────────────────────────────────

const visibleEvents = computed(() =>
  (events.value ?? [])
    .filter((e) => {
      const frac = eventToFrac(e);
      return frac >= startFrac.value - 0.01 && frac <= endFrac.value + 0.01;
    })
    .sort((a, b) => eventToFrac(a) - eventToFrac(b)),
);

function formatEventDate(event: CalendarEvent): string {
  if (event.festival_day) return event.festival_day;
  const m = event.harptos_month
    ? calendar.adapter.months.find((mo) => mo.num === event.harptos_month)
    : null;
  const monthName = m?.name ?? "";
  if (event.harptos_day && monthName) {
    const week = Math.ceil(event.harptos_day / calendar.adapter.weekSize);
    const label = calendar.adapter.weekRowNames?.[week - 1] ?? `Tenday ${week}`;
    return `${monthName} ${event.harptos_day} (${label}), ${event.harptos_year}`;
  }
  if (monthName) return `${monthName} ${event.harptos_year}`;
  return `${event.harptos_year}`;
}

// ── Navigation ──────────────────────────────────────────────────────────────

function shiftBack() {
  if (isWeekZoom.value) {
    if (currentTenday.value > 1) {
      currentTenday.value--;
    } else {
      calendar.prevMonth();
      currentTenday.value = tendaysPerMonth.value;
    }
  } else if (zoomMode.value === "days") {
    calendar.prevMonth();
    currentTenday.value = 1;
  } else if (zoomMode.value === "months") {
    calendar.goToYear(calendar.currentYear - 1);
  } else {
    calendar.goToYear(calendar.currentYear - Math.round(zoomYears.value));
  }
}

function shiftForward() {
  if (isWeekZoom.value) {
    if (currentTenday.value < tendaysPerMonth.value) {
      currentTenday.value++;
    } else {
      calendar.nextMonth();
      currentTenday.value = 1;
    }
  } else if (zoomMode.value === "days") {
    calendar.nextMonth();
    currentTenday.value = 1;
  } else if (zoomMode.value === "months") {
    calendar.goToYear(calendar.currentYear + 1);
  } else {
    calendar.goToYear(calendar.currentYear + Math.round(zoomYears.value));
  }
}

function setZoom(z: number) {
  calendar.setTimelineZoom(z);
  currentTenday.value = 1; // reset tenday position when changing zoom
}

function jumpToYear(year: number) {
  if (year) {
    calendar.goToYear(year);
  }
}
</script>
