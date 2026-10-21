import type { CalendarAdapter } from "@/types/calendar.types";
import { daysFromTo, type CalendarDate } from "./dayMath";
import type { WeatherPin } from "./weather";

/**
 * Keeping `campaigns.weather_pins` small and correct (#1086). A pin is one
 * entry per climate source per dated day, and the array lives on the campaign
 * row, so it is bounded by dropping what no longer changes the sky.
 */

/** In-world days a pin is kept after its date. A `set` pin has eased back to
 *  the pattern within four, so sixty is a generous record for the DM to see. */
export const PIN_KEEP_DAYS = 60;

const sameDay = (a: CalendarDate, b: CalendarDate) => a.year === b.year && a.month === b.month && a.day === b.day;

/** The pin a source has on a dated day, if any. */
export function pinOn(pins: readonly WeatherPin[], source: string | null, date: CalendarDate): WeatherPin | undefined {
  return pins.find((p) => p.source === source && sameDay(p, date));
}

/**
 * `pins` with `next` written in: it replaces that source's pin for the same
 * day, and the source's pins older than `PIN_KEEP_DAYS` before `today` are
 * dropped. The one exception is the source's latest `reroll`, kept however old:
 * it switches the seed for every later day, so dropping it would silently turn
 * today back into the original pattern. Other sources' pins are untouched.
 */
export function withPin(
  adapter: CalendarAdapter,
  pins: readonly WeatherPin[],
  next: WeatherPin,
  today: CalendarDate,
): WeatherPin[] {
  const mine = (p: WeatherPin) => p.source === next.source;
  const kept = pins.filter((p) => !(mine(p) && sameDay(p, next)));
  const rerolls = [...kept, next].filter((p) => mine(p) && p.kind === "reroll");
  const latestReroll = rerolls.sort((a, b) => daysFromTo(adapter, a, b) ?? 0)[0];

  const fresh = kept.filter((p) => {
    if (!mine(p) || p === latestReroll) return true;
    const age = daysFromTo(adapter, p, today);
    // A pin the calendar cannot place cannot affect any day; drop it.
    return age !== undefined && age <= PIN_KEEP_DAYS;
  });
  return [...fresh, next];
}

/** `pins` without that source's pin on the given day ("back to the pattern"). */
export function withoutPin(pins: readonly WeatherPin[], source: string | null, date: CalendarDate): WeatherPin[] {
  return pins.filter((p) => !(p.source === source && sameDay(p, date)));
}
