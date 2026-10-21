import { computed, type ComputedRef } from "vue";
import { useAllLocations, useSharedLocations } from "@/composables/locations/useLocations";
import { weatherForecast, type ForecastDay } from "@/lib/calendar/forecast";
import { climateAt, weatherOn, type ClimatePlace, type Weather } from "@/lib/calendar/weather";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";
import type { Climate } from "@/types/calendar.types";

export interface TodayWeather {
  weather: Weather;
  climate: Climate;
  /** The place whose climate this is; null when it is the campaign's. */
  sourceId: string | null;
}

export interface WeatherSource {
  climate: Climate;
  /** The place that named the climate; null when it is the campaign's. */
  sourceId: string | null;
  /** That place's name, when it resolves in the list the caller can read. */
  placeName: string | null;
  /** What the weather is seeded on, so today and the forecast cannot disagree. */
  seed: string;
}

/**
 * Where the party's sky comes from (#1086): the climate of
 * `current_location_id` (its own, else the nearest ancestor naming one, else
 * the campaign's) and the seed that climate source implies. The one place this
 * is worked out, shared by today's weather and the forecast. The place list is
 * the one the Atlas tree already holds; a player reads the shared places
 * instead, and a place they cannot see simply does not resolve, which falls
 * back to the campaign climate and fetches nothing extra.
 */
export function useWeatherSource(options: { player?: boolean } = {}): ComputedRef<WeatherSource | null> {
  const campaign = useCampaignStore();
  // Static per call site: a screen is either the DM's or the player's.
  const places = options.player ? useSharedLocations() : useAllLocations();

  const index = computed(() => {
    const map = new Map<string, ClimatePlace & { name: string }>();
    for (const p of places.data.value ?? []) {
      map.set(p.id, { id: p.id, parent_id: p.parent_id, climate: p.climate, name: p.name });
    }
    return map;
  });

  return computed(() => {
    const active = campaign.activeCampaign;
    if (!active) return null;
    const { climate, sourceId } = climateAt(index.value, active.current_location_id ?? null, active.climate);
    return {
      climate,
      sourceId,
      placeName: sourceId === null ? null : (index.value.get(sourceId)?.name ?? null),
      seed: `${active.id}:${sourceId ?? "campaign"}`,
    };
  });
}

/**
 * Today's weather where the party is: the campaign's date at that place,
 * computed locally from the calendar, so there is nothing to poll. Null for an
 * underground climate or a date the calendar cannot place.
 */
export function useTodayWeather(options: { player?: boolean } = {}): ComputedRef<TodayWeather | null> {
  const campaign = useCampaignStore();
  const calendar = useCalendarStore();
  const source = useWeatherSource(options);

  return computed(() => {
    const s = source.value;
    if (!s) return null;
    const weather = weatherOn(calendar.adapter, s.climate, s.seed, campaign.todayYear, campaign.todayMonth, campaign.todayDay, null);
    return weather ? { weather, climate: s.climate, sourceId: s.sourceId } : null;
  });
}

/** The next `days` dated days at the same place and seed as `useTodayWeather`. */
export function useWeatherForecast(days = 5, options: { player?: boolean } = {}): ComputedRef<ForecastDay[]> {
  const campaign = useCampaignStore();
  const calendar = useCalendarStore();
  const source = useWeatherSource(options);

  return computed(() => {
    const s = source.value;
    if (!s) return [];
    const from = { year: campaign.todayYear, month: campaign.todayMonth, day: campaign.todayDay };
    return weatherForecast(calendar.adapter, s.climate, s.seed, from, days);
  });
}
