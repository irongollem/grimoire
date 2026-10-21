<template>
  <div class="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3" role="group" aria-label="Change today's weather">
    <div class="grid gap-2" style="grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr))">
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow uppercase text-muted-foreground">Temperature</span>
        <AppSelect :model-value="draft.temperature" tone="card" size="body" block aria-label="Temperature" @update:model-value="change('temperature', $event as Temperature)">
          <option v-for="t in temperatures" :key="t" :value="t">{{ TEMPERATURE_LABELS[t] }}</option>
        </AppSelect>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow uppercase text-muted-foreground">Sky</span>
        <AppSelect :model-value="draft.precipitation" tone="card" size="body" block aria-label="Precipitation" @update:model-value="change('precipitation', $event as Precipitation)">
          <option v-for="p in precipitations" :key="p" :value="p">{{ PRECIPITATION_LABELS[p] }}</option>
        </AppSelect>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow uppercase text-muted-foreground">Wind</span>
        <AppSelect :model-value="draft.wind" tone="card" size="body" block aria-label="Wind" @update:model-value="change('wind', $event as Wind)">
          <option v-for="w in winds" :key="w" :value="w">{{ WIND_LABELS[w] }}</option>
        </AppSelect>
      </label>
    </div>

    <AppCheckbox
      :model-value="draft.fog"
      label="Fog"
      :disabled="!canFog"
      :hint="canFog ? undefined : 'Fog needs a calm, mild or cold day without a downpour, in a temperate or cold climate.'"
      @update:model-value="change('fog', $event)"
    />

    <p class="text-caption text-muted-foreground">
      The days after follow from what you set, easing back to the usual pattern over about three days.
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <AppButton variant="primary" size="caption" :disabled="pending" label="Set for today" @click="emit('set', normalised)" />
      <AppButton variant="outline" size="caption" :disabled="pending" label="Reroll from today" @click="emit('reroll')" />
      <AppButton v-if="hasPin" variant="ghost" size="caption" :disabled="pending" label="Back to the pattern" @click="emit('clear')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import {
  PRECIPITATION_LABELS,
  TEMPERATURE_LABELS,
  WIND_LABELS,
  allowedPrecipitation,
  allowedTemperatures,
  coerceWeather,
  fogPossible,
  type Precipitation,
  type Temperature,
  type Weather,
  type Wind,
} from "@/lib/calendar/weather";
import type { Climate } from "@/types/calendar.types";

/**
 * The DM's inline control for today's sky (#1086). It only offers weather the
 * climate can produce: no dust outside the desert, snow only when it is cold
 * enough to snow, a blizzard or dust storm only with a strong wind, fog only
 * where it can form. Every change goes through `coerceWeather`, so the pin it
 * emits is always one the generator can reproduce on the following days.
 * Presentational: the widget owns the writes.
 */
const props = defineProps<{
  /** Today's weather, which the form starts from. */
  weather: Weather;
  climate: Climate;
  /** Whether the DM already pinned today (shows "Back to the pattern"). */
  hasPin: boolean;
  pending: boolean;
}>();

const emit = defineEmits<{
  set: [weather: Weather];
  reroll: [];
  clear: [];
}>();

const draft = ref<Weather>(coerceWeather(props.climate, props.weather));
const normalised = computed(() => coerceWeather(props.climate, draft.value));

const temperatures = computed(() => allowedTemperatures(props.climate));
const precipitations = computed(() => allowedPrecipitation(props.climate, draft.value.temperature));
const winds = computed<readonly Wind[]>(() =>
  draft.value.precipitation === "blizzard" || draft.value.precipitation === "dust"
    ? ["strong", "gale"]
    : ["calm", "breeze", "strong", "gale"],
);
const canFog = computed(() => fogPossible(props.climate, draft.value));

function change<K extends keyof Weather>(key: K, value: Weather[K]) {
  draft.value = coerceWeather(props.climate, { ...draft.value, [key]: value });
}
</script>
