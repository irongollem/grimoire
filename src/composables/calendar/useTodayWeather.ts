import { computed, type ComputedRef } from "vue";
import { useAllLocations, useSharedLocations } from "@/composables/locations/useLocations";
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

/**
 * Today's weather where the party is (#1086): the campaign's date, the climate
 * of `current_location_id` (its own, else the nearest ancestor naming one, else
 * the campaign's), computed locally from the calendar, so there is nothing to
 * poll. The place list is the one the Atlas tree already holds; a player reads
 * the shared places instead, and a place they cannot see simply does not
 * resolve, which falls back to the campaign climate and fetches nothing extra.
 * Null for an underground climate or a date the calendar cannot place.
 */
export function useTodayWeather(options: { player?: boolean } = {}): ComputedRef<TodayWeather | null> {
  const campaign = useCampaignStore();
  const calendar = useCalendarStore();
  // Static per call site: a screen is either the DM's or the player's.
  const places = options.player ? useSharedLocations() : useAllLocations();

  const index = computed(() => {
    const map = new Map<string, ClimatePlace>();
    for (const p of places.data.value ?? []) {
      map.set(p.id, { id: p.id, parent_id: p.parent_id, climate: p.climate });
    }
    return map;
  });

  return computed(() => {
    const active = campaign.activeCampaign;
    if (!active) return null;
    const { climate, sourceId } = climateAt(index.value, active.current_location_id ?? null, active.climate);
    const weather = weatherOn(
      calendar.adapter,
      climate,
      `${active.id}:${sourceId ?? "campaign"}`,
      campaign.todayYear,
      campaign.todayMonth,
      campaign.todayDay,
      null,
    );
    return weather ? { weather, climate, sourceId } : null;
  });
}
