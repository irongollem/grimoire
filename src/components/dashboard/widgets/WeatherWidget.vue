<template>
  <DashboardWidget
    title="Weather"
    :empty="!source || !today"
    :empty-text="emptyText"
  >
    <div v-if="source && today" class="flex flex-col gap-3 px-4 py-3">
      <div class="flex items-center gap-3">
        <WeatherGlyph :weather="today.weather" class="h-9 w-9 shrink-0 text-muted-foreground" />
        <div class="min-w-0">
          <p class="text-heading-sm font-semibold text-foreground">
            {{ TEMPERATURE_LABELS[today.weather.temperature] }}
          </p>
          <p class="text-caption text-muted-foreground">{{ describeWeather(today.weather) }}</p>
        </div>
      </div>

      <p class="truncate text-eyebrow uppercase text-muted-foreground">
        {{ source.placeName ?? "Campaign climate" }} · {{ CLIMATE_LABELS[source.climate] }}
      </p>

      <CalendarSkyLine
        :year="campaign.todayYear"
        :month="campaign.todayMonth"
        :day="campaign.todayDay"
      />

      <ol v-if="forecast.length" class="grid grid-flow-col auto-cols-fr gap-1 border-t border-border pt-3">
        <li
          v-for="(d, i) in forecast"
          :key="`${d.date.year}-${d.date.month}-${d.date.day}`"
          class="flex min-w-0 flex-col items-center gap-1 text-center"
        >
          <span class="max-w-full truncate text-label uppercase text-muted-foreground">{{ dayLabel(d.date, i) }}</span>
          <WeatherGlyph :weather="d.weather" class="h-4 w-4 text-muted-foreground" />
          <span class="max-w-full truncate text-caption text-foreground">{{ TEMPERATURE_LABELS[d.weather.temperature] }}</span>
        </li>
      </ol>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import CalendarSkyLine from "@/components/calendar/CalendarSkyLine.vue";
import WeatherGlyph from "@/components/calendar/WeatherGlyph.vue";
import { useTodayWeather, useWeatherForecast, useWeatherSource } from "@/composables/calendar/useTodayWeather";
import type { CalendarDate } from "@/lib/calendar/dayMath";
import { CLIMATE_LABELS, TEMPERATURE_LABELS, describeWeather } from "@/lib/calendar/weather";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";
import DashboardWidget from "../DashboardWidget.vue";

/**
 * Today's sky where the party is, and the next five days of it (#1088). All
 * of it is computed locally from the calendar, so there is nothing to poll or
 * to ring for: the party moving or the date advancing changes the campaign row,
 * which the campaign store already carries. The place, seed and climate come
 * from `useWeatherSource`, the same resolution the Session widget and the
 * calendar use, so the three cannot disagree.
 */
const campaign = useCampaignStore();
const calendar = useCalendarStore();
const source = useWeatherSource();
const today = useTodayWeather();
const forecast = useWeatherForecast(5);

const emptyText = computed(() => {
  if (!source.value) return "No campaign selected.";
  return source.value.climate === "underground" ? "No sky underground." : "No weather for this date.";
});

/** "Tomorrow", then the day and a short month; the strip is five narrow columns. */
function dayLabel(date: CalendarDate, index: number): string {
  if (index === 0) return "Tomorrow";
  const month = calendar.adapter.months[date.month - 1]?.name ?? "";
  return `${date.day} ${month.slice(0, 3)}`;
}
</script>
