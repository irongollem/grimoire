import { computed, type ComputedRef } from "vue";
import { useUpdateCampaign } from "@/composables/campaign/useCampaigns";
import type { CalendarDate } from "@/lib/calendar/dayMath";
import { coerceWeather, type Weather, type WeatherPin } from "@/lib/calendar/weather";
import { pinOn, withPin, withoutPin } from "@/lib/calendar/weatherPins";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";
import { useWeatherSource } from "./useTodayWeather";

/** A short random string; the only randomness weather has, and it is stored in the pin. */
function newSalt(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * The DM's writes to the weather (#1086): pin today's sky, reroll the pattern
 * from today, or go back to the pattern. Each rewrites `campaigns.weather_pins`
 * for the party's current climate source and nothing else, and every client
 * (the dashboard, the calendar, the player's Hearth) picks it up from the
 * campaign row, so no one has to be told.
 */
export function useWeatherPins(): {
  /** The pin on today's date for the party's climate source, if the DM made one. */
  todayPin: ComputedRef<WeatherPin | undefined>;
  pending: ComputedRef<boolean>;
  setToday: (weather: Weather) => Promise<void>;
  rerollToday: () => Promise<void>;
  clearToday: () => Promise<void>;
} {
  const campaign = useCampaignStore();
  const calendar = useCalendarStore();
  const source = useWeatherSource();
  const update = useUpdateCampaign();

  const today = (): CalendarDate => ({ year: campaign.todayYear, month: campaign.todayMonth, day: campaign.todayDay });
  const todayPin = computed(() => {
    const s = source.value;
    return s ? pinOn(campaign.activeCampaign?.weather_pins ?? [], s.sourceId, today()) : undefined;
  });

  /** Reads the campaign's pins at click time, so a stale panel cannot undo a newer pin. */
  async function write(change: (pins: readonly WeatherPin[], sourceId: string | null) => WeatherPin[]) {
    const s = source.value;
    const active = campaign.activeCampaign;
    if (!s || !active) return;
    const weather_pins = change(active.weather_pins ?? [], s.sourceId);
    const updated = await update.mutateAsync({ id: active.id, update: { weather_pins } });
    campaign.switchToCampaign(updated);
  }

  return {
    todayPin,
    pending: computed(() => update.isPending.value),
    setToday: (weather) => {
      const climate = source.value?.climate ?? "temperate";
      return write((pins, id) =>
        withPin(calendar.adapter, pins, { source: id, ...today(), kind: "set", weather: coerceWeather(climate, weather) }, today()),
      );
    },
    rerollToday: () =>
      write((pins, id) =>
        withPin(calendar.adapter, pins, { source: id, ...today(), kind: "reroll", salt: newSalt() }, today()),
      ),
    clearToday: () => write((pins, id) => withoutPin(pins, id, today())),
  };
}
