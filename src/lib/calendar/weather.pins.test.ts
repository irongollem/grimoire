import { describe, expect, it } from "vitest";
import { gregorianAdapter } from "@/settings/gregorian.calendar";
import { SEASON_KINDS, type Climate } from "@/types/calendar.types";
import { addDays, type CalendarDate } from "./dayMath";
import {
  PRECIPITATION_LABELS,
  TEMPERATURES,
  WIND_LABELS,
  allowedPrecipitation,
  allowedTemperatures,
  channelsFor,
  coerceWeather,
  weatherFromChannels,
  weatherOn,
  type Precipitation,
  type Weather,
  type WeatherClimate,
  type WeatherPin,
} from "./weather";

const adapter = gregorianAdapter;
const SEED = "c1:campaign";
const climates = ["polar", "cold", "temperate", "warm", "tropical", "arid"] as const satisfies readonly WeatherClimate[];
const winds = Object.keys(WIND_LABELS) as Weather["wind"][];
const precipitations = Object.keys(PRECIPITATION_LABELS) as Precipitation[];

const at = (date: CalendarDate, climate: Climate, pins: readonly WeatherPin[] = [], seed = SEED) =>
  weatherOn(adapter, climate, seed, date.year, date.month, date.day, null, pins)!;
const tempIndex = (w: Weather) => TEMPERATURES.indexOf(w.temperature);

describe("channelsFor", () => {
  it("reads back as exactly the weather asked for, for every climate, season and reachable weather", () => {
    let checked = 0;
    for (const climate of climates) {
      for (const kind of SEASON_KINDS) {
        for (const temperature of TEMPERATURES) {
          for (const precipitation of precipitations) {
            for (const wind of winds) {
              for (const fog of [false, true]) {
                const asked: Weather = { temperature, precipitation, wind, fog };
                // Only weather the climate can produce is promised; the rest is coerced to it.
                if (JSON.stringify(coerceWeather(climate, asked)) !== JSON.stringify(asked)) continue;
                expect(weatherFromChannels(climate, kind, channelsFor(climate, kind, asked))).toEqual(asked);
                checked++;
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe("coerceWeather", () => {
  const base: Weather = { temperature: "mild", precipitation: "none", wind: "calm", fog: false };

  it("keeps dust to arid, snow to the cold, and rain to the not-cold", () => {
    expect(coerceWeather("temperate", { ...base, temperature: "hot", precipitation: "dust", wind: "strong" }).precipitation).toBe("none");
    expect(coerceWeather("arid", { ...base, temperature: "hot", precipitation: "dust", wind: "strong" }).precipitation).toBe("dust");
    expect(coerceWeather("temperate", { ...base, precipitation: "snow" }).precipitation).toBe("none");
    expect(coerceWeather("temperate", { ...base, temperature: "cold", precipitation: "rain" }).precipitation).toBe("none");
    expect(allowedPrecipitation("temperate", "cold")).toEqual(["none", "snow", "blizzard"]);
    expect(allowedPrecipitation("arid", "hot")).toContain("dust");
    expect(allowedPrecipitation("temperate", "hot")).not.toContain("dust");
  });

  it("gives a blizzard its wind, caps polar air and drops fog that cannot form", () => {
    expect(coerceWeather("cold", { ...base, temperature: "freezing", precipitation: "blizzard" }).wind).toBe("strong");
    expect(allowedTemperatures("polar")).toEqual(["freezing", "cold", "cool"]);
    expect(coerceWeather("polar", { ...base, temperature: "hot" }).temperature).toBe("cool");
    expect(coerceWeather("tropical", { ...base, fog: true }).fog).toBe(false);
    expect(coerceWeather("temperate", { ...base, fog: true }).fog).toBe(true);
  });
});

describe("weatherOn with pins", () => {
  const day: CalendarDate = { year: 12, month: 1, day: 20 };
  const storm: Weather = { temperature: "freezing", precipitation: "blizzard", wind: "gale", fog: false };
  const pin = (over: Partial<WeatherPin> = {}, date = day): WeatherPin =>
    ({ source: null, ...date, kind: "set", weather: storm, ...over }) as WeatherPin;

  it("returns the pinned weather exactly on the pin day, even against the climate", () => {
    expect(at(day, "temperate", [pin()])).toEqual(storm);
    expect(at(day, "tropical", [pin()])).toEqual(storm);
  });

  it("eases back to the pattern: monotonically closer, and identical after four days", () => {
    for (const climate of ["temperate", "cold", "warm"] as const) {
      const natural = (n: number) => tempIndex(at(addDays(adapter, day, n), climate));
      const pinned = (n: number) => tempIndex(at(addDays(adapter, day, n), climate, [pin()]));
      const gap = [1, 2, 3].map((n) => Math.abs(pinned(n) - natural(n)));
      expect(gap[0]).toBeGreaterThanOrEqual(gap[1]);
      expect(gap[1]).toBeGreaterThanOrEqual(gap[2]);
      for (let n = 4; n <= 12; n++) {
        const date = addDays(adapter, day, n);
        expect(at(date, climate, [pin()])).toEqual(at(date, climate));
      }
    }
    // The first days after still carry the storm's cold in a mild climate.
    expect(tempIndex(at(addDays(adapter, day, 1), "warm", [pin()]))).toBeLessThan(tempIndex(at(addDays(adapter, day, 1), "warm")));
  });

  it("leaves days before the pin alone", () => {
    for (let n = 1; n <= 10; n++) {
      const date = addDays(adapter, day, -n);
      expect(at(date, "temperate", [pin()])).toEqual(at(date, "temperate"));
    }
  });

  it("lets a later pin replace an earlier one from its own day on", () => {
    const calm: Weather = { temperature: "warm", precipitation: "none", wind: "calm", fog: false };
    const later = addDays(adapter, day, 1);
    const pins = [pin(), pin({ weather: calm }, later)];
    expect(at(day, "temperate", pins)).toEqual(storm);
    expect(at(later, "temperate", pins)).toEqual(calm);
    // Order in the array does not matter, dates do.
    expect(at(later, "temperate", [...pins].reverse())).toEqual(calm);
  });

  it("rerolls from its date only", () => {
    const reroll = pin({ kind: "reroll", salt: "k3x9" } as Partial<WeatherPin>);
    let changed = 0;
    for (let n = -20; n <= 30; n++) {
      const date = addDays(adapter, day, n);
      const same = JSON.stringify(at(date, "temperate", [reroll])) === JSON.stringify(at(date, "temperate"));
      if (n < 0) expect(same).toBe(true);
      else if (!same) changed++;
    }
    expect(changed).toBeGreaterThan(5);
    // Two rerolls on the same day with different salts give different skies.
    const other = pin({ kind: "reroll", salt: "zzzz" } as Partial<WeatherPin>);
    const sky = (p: WeatherPin) => Array.from({ length: 30 }, (_, n) => at(addDays(adapter, day, n + 1), "temperate", [p]));
    expect(sky(reroll)).not.toEqual(sky(other));
  });

  it("is deterministic, and ignores a pin the calendar cannot place", () => {
    const pins = [pin(), pin({ kind: "reroll", salt: "a1" } as Partial<WeatherPin>, { year: 12, month: 2, day: 3 })];
    expect(at(day, "cold", pins)).toEqual(at(day, "cold", pins));
    const bad = pin({}, { year: 12, month: 13, day: 1 });
    expect(at(day, "cold", [bad])).toEqual(at(day, "cold"));
  });

  it("has no weather underground whatever is pinned", () => {
    expect(weatherOn(adapter, "underground", SEED, 12, 1, 20, null, [pin()])).toBeNull();
  });
});
