<template>
  <component :is="icon" aria-hidden="true" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  IconSun,
  IconWeatherBlizzard,
  IconWeatherDrizzle,
  IconWeatherFog,
  IconWeatherRain,
  IconWeatherSnow,
  IconWind,
} from "@/lib/icons";
import type { Weather } from "@/lib/calendar/weather";

/**
 * One glyph for a day's weather (#1088): what falls wins, then fog, then a
 * hard wind, else the sun. Size and colour come from the caller's classes.
 */
const { weather } = defineProps<{ weather: Weather }>();

const icon = computed(() => {
  switch (weather.precipitation) {
    case "blizzard": return IconWeatherBlizzard;
    case "snow": return IconWeatherSnow;
    case "drizzle": return IconWeatherDrizzle;
    case "rain":
    case "downpour": return IconWeatherRain;
    case "dust": return IconWind;
    default: break;
  }
  if (weather.fog) return IconWeatherFog;
  if (weather.wind === "strong" || weather.wind === "gale") return IconWind;
  return IconSun;
});
</script>
