import type { CalendarAdapter, Climate } from "@/types/calendar.types";
import { addDays, type CalendarDate } from "./dayMath";
import { weatherOn, type Weather } from "./weather";

export interface ForecastDay {
  date: CalendarDate;
  weather: Weather;
}

/**
 * The weather on each of the next `days` dated days after `from`, under one
 * climate and seed (#1088). Today is not included; the caller has it already.
 * Every day goes through `weatherOn`, so a forecast day is exactly the weather
 * that day will show when the party gets there. `addDays` rolls an offset that
 * lands on an intercalary day (Shieldmeet) forward to the next dated day, so
 * the strip never repeats a date: a day that rolled onto one already listed is
 * skipped and the forecast simply takes the next offset. Empty for an
 * underground climate.
 */
export function weatherForecast(
  adapter: CalendarAdapter,
  climate: Climate,
  seed: string,
  from: CalendarDate,
  days = 5,
): ForecastDay[] {
  const out: ForecastDay[] = [];
  let last = from;
  // Bounded: each offset is a distinct day, a roll-off costs at most a few.
  for (let offset = 1; out.length < days && offset <= days + 8; offset++) {
    const date = addDays(adapter, from, offset);
    if (date.year === last.year && date.month === last.month && date.day === last.day) continue;
    const weather = weatherOn(adapter, climate, seed, date.year, date.month, date.day, null);
    if (!weather) return [];
    out.push({ date, weather });
    last = date;
  }
  return out;
}
