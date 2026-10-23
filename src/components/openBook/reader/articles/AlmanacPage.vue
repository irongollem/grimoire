<script setup lang="ts">
/**
 * The Chronicle's opener: the campaign calendar's current month as a grid, event days in red letters, and below
 * it (or beside it, once paginated) the sessions that have passed. Months step within the range of dates the
 * book holds. A calendar the snapshot does not name draws the timeline alone.
 */
import { computed, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import type { BookModel } from "@/lib/openBook/bookModel";
import {
  calendarAdapterFor,
  festivalsOf,
  formatCalendarDate,
  markedDays,
  monthGrid,
  monthRange,
  stepMonth,
  type MonthRef,
} from "@/lib/openBook/articleData";
import "./bookArticles.css";

const { model } = defineProps<{ model: BookModel }>();

const route = useRoute();
const snapshot = computed(() => model.snapshot);
const adapter = computed(() => calendarAdapterFor(snapshot.value.calendar));
const range = computed(() => monthRange(snapshot.value.events, snapshot.value.sessions, snapshot.value.calendar.current));

const start = computed<MonthRef | null>(() => {
  const { year, month } = snapshot.value.calendar.current;
  if (year !== null && month !== null) return { year, month };
  return range.value?.last ?? null;
});
const chosen = ref<MonthRef | null>(null);
const view = computed(() => chosen.value ?? start.value);

const key = (m: MonthRef) => m.year * 1000 + m.month;
const prev = computed(() => {
  const a = adapter.value;
  const v = view.value;
  const r = range.value;
  if (!a || !v || !r) return null;
  const to = stepMonth(a, v, -1);
  return key(to) >= key(r.first) ? to : null;
});
const next = computed(() => {
  const a = adapter.value;
  const v = view.value;
  const r = range.value;
  if (!a || !v || !r) return null;
  const to = stepMonth(a, v, 1);
  return key(to) <= key(r.last) ? to : null;
});

const grid = computed(() => (adapter.value && view.value ? monthGrid(adapter.value, view.value) : null));
const marks = computed(() =>
  adapter.value && view.value ? markedDays(adapter.value, view.value, snapshot.value.events, snapshot.value.sessions) : new Map(),
);
const festivals = computed(() => (view.value ? festivalsOf(snapshot.value.events, view.value.year) : []));
const monthName = (m: MonthRef | null) => (m && adapter.value ? (adapter.value.months[m.month - 1]?.name ?? null) : null);
const today = computed(() => snapshot.value.calendar.current);
const isToday = (day: number) =>
  view.value !== null && today.value.year === view.value.year && today.value.month === view.value.month && today.value.day === day;

const passed = computed(() => {
  const sessions = new Map(snapshot.value.sessions.map((s) => [s.id, s]));
  return model.chapters
    .filter((c) => c.chapter === "chronicle")
    .flatMap((c) => c.entries)
    .map((entry) => {
      const session = sessions.get(entry.id);
      return { entry, when: session ? formatCalendarDate(session.date, adapter.value) : null };
    })
    .reverse();
});

/** "23 Ches, Year 1492 DR" sets on two lines, the day and month over the year. */
const lines = (text: string | null) => (text ? text.split(", ") : []);

function target(entryId: string) {
  const raw = route.params.slug;
  return { name: "open-book-entry", params: { slug: Array.isArray(raw) ? raw[0] : raw, chapter: "chronicle", entryId } };
}
</script>

<template>
  <section class="book-almanac">
    <div v-if="grid && view" class="book-calendar">
      <span class="book-eyebrow">Almanac</span>
      <div class="book-almanac-nav">
        <button type="button" class="book-step" :disabled="!prev" @click="chosen = prev">
          {{ prev ? `‹ ${monthName(prev)}` : "" }}
        </button>
        <h2 class="book-almanac-month">
          {{ monthName(view) ?? `Month ${view.month}` }}
          <small>Year {{ view.year }} {{ adapter?.epochName }}</small>
        </h2>
        <button type="button" class="book-step" :disabled="!next" @click="chosen = next">
          {{ next ? `${monthName(next)} ›` : "" }}
        </button>
      </div>
      <div class="book-cal" :style="{ gridTemplateColumns: `repeat(${grid.columnCount}, minmax(0, 1fr))` }">
        <span v-for="label in grid.columns" :key="label" class="book-cal-wk">{{ label }}</span>
        <span v-for="n in grid.leading" :key="`gap-${n}`" class="book-cal-d" aria-hidden="true" />
        <template v-for="day in grid.days" :key="day">
          <RouterLink
            v-if="marks.get(day)?.sessionId"
            :class="['book-cal-d', 'is-red', isToday(day) && 'is-today']"
            :to="target(marks.get(day)!.sessionId!)"
          >
            {{ day }}<span v-for="title in marks.get(day)!.titles" :key="title" class="book-cal-ev">{{ title }}</span>
          </RouterLink>
          <span v-else :class="['book-cal-d', marks.has(day) && 'is-red', isToday(day) && 'is-today']">
            {{ day }}<span v-for="title in marks.get(day)?.titles ?? []" :key="title" class="book-cal-ev">{{ title }}</span>
          </span>
        </template>
      </div>
      <p v-if="festivals.length > 0" class="book-note">
        Between the months of Year {{ view.year }}: {{ festivals.map((f) => f.festival_day).join(", ") }}.
      </p>
      <p class="book-note">Red-letter days are sessions and the feasts the party knows of.</p>
    </div>

    <div class="book-timeline">
      <h2>What has passed</h2>
      <p v-if="passed.length === 0" class="book-note">Nothing has been written yet.</p>
      <div v-for="{ entry, when } in passed" :key="entry.id" class="book-entry">
        <div class="book-entry-when">
          <span class="book-rubric"><span v-for="line in lines(when ?? entry.subtitle)" :key="line">{{ line }}</span></span>
        </div>
        <div class="book-entry-what">
          <h3><RouterLink :to="target(entry.id)">{{ entry.title }}</RouterLink></h3>
          <span v-if="when && entry.subtitle" class="book-eyebrow">{{ entry.subtitle }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
