import { describe, expect, it } from "vitest";
import { gregorianAdapter } from "@/settings/gregorian.calendar";
import { daysInMonth } from "./dayMath";
import {
  TEMPERATURES,
  climateAt,
  describeWeather,
  weatherOn,
  type ClimatePlace,
  type Weather,
} from "./weather";
import type { Climate } from "@/types/calendar.types";

const adapter = gregorianAdapter;

/** Every day of one year, in order. */
function yearOf(climate: Climate, seed = "c1:campaign", year = 12): Weather[] {
  const out: Weather[] = [];
  for (let m = 1; m <= adapter.months.length; m++) {
    for (let d = 1; d <= daysInMonth(adapter, year, m); d++) {
      const w = weatherOn(adapter, climate, seed, year, m, d, null);
      if (w) out.push(w);
    }
  }
  return out;
}

describe("weatherOn", () => {
  it("is deterministic and depends on the seed", () => {
    expect(yearOf("temperate")).toEqual(yearOf("temperate"));
    expect(yearOf("temperate", "other:campaign")).not.toEqual(yearOf("temperate"));
  });

  it("has no weather underground or on a date it cannot place", () => {
    expect(weatherOn(adapter, "underground", "s", 12, 6, 1, null)).toBeNull();
    expect(weatherOn(adapter, "temperate", "s", 12, 13, 1, null)).toBeNull();
    expect(weatherOn(adapter, "temperate", "s", 12, null, null, "Nope")).toBeNull();
  });

  it("keeps polar air at cool or colder", () => {
    for (const w of yearOf("polar")) expect(TEMPERATURES.indexOf(w.temperature)).toBeLessThanOrEqual(2);
  });

  it("rarely rains in the desert", () => {
    const days = yearOf("arid");
    const wet = days.filter((w) => ["drizzle", "rain", "downpour"].includes(w.precipitation));
    expect(wet.length / days.length).toBeLessThan(0.08);
  });

  it("drifts: neighbouring days are within a step of each other almost always", () => {
    for (const climate of ["temperate", "cold", "tropical"] as const) {
      const days = yearOf(climate);
      let close = 0;
      for (let i = 1; i < days.length; i++) {
        const gap = Math.abs(TEMPERATURES.indexOf(days[i].temperature) - TEMPERATURES.indexOf(days[i - 1].temperature));
        if (gap <= 1) close++;
      }
      expect(close / (days.length - 1)).toBeGreaterThanOrEqual(0.85);
    }
  });

  it("snows only when it is freezing or cold, and rains otherwise", () => {
    for (const climate of ["polar", "cold", "temperate", "warm"] as const) {
      for (const w of yearOf(climate)) {
        const cold = w.temperature === "freezing" || w.temperature === "cold";
        if (w.precipitation === "snow" || w.precipitation === "blizzard") expect(cold).toBe(true);
        if (["drizzle", "rain", "downpour"].includes(w.precipitation)) expect(cold).toBe(false);
      }
    }
  });

  it("has a real winter and summer in a temperate year", () => {
    const days = yearOf("temperate");
    const mean = (from: number, to: number) =>
      days.slice(from, to).reduce((n, w) => n + TEMPERATURES.indexOf(w.temperature), 0) / (to - from);
    expect(mean(172, 244)).toBeGreaterThan(mean(0, 60) + 1.5);
    expect(days.some((w) => w.precipitation === "snow")).toBe(true);
    expect(days.some((w) => w.precipitation === "rain" || w.precipitation === "drizzle")).toBe(true);
  });

  it("brings dust to the desert and downpours to the tropics", () => {
    expect(yearOf("arid").some((w) => w.precipitation === "dust")).toBe(true);
    expect(yearOf("tropical").some((w) => w.precipitation === "downpour")).toBe(true);
  });
});

describe("describeWeather", () => {
  it("reads as a short sentence-case line", () => {
    expect(describeWeather({ temperature: "cold", precipitation: "snow", wind: "strong", fog: false })).toBe(
      "Cold, snow, strong wind",
    );
    expect(describeWeather({ temperature: "mild", precipitation: "none", wind: "calm", fog: true })).toBe(
      "Mild, fog, calm",
    );
  });
});

describe("climateAt", () => {
  const place = (id: string, parent_id: string | null, climate: Climate | null): [string, ClimatePlace] => [
    id,
    { id, parent_id, climate },
  ];
  const places = new Map([
    place("world", null, null),
    place("north", "world", "polar"),
    place("keep", "north", null),
    place("hall", "keep", "underground"),
    place("a", "b", null),
    place("b", "a", null),
  ]);

  it("takes the nearest ancestor naming a climate", () => {
    expect(climateAt(places, "keep", "temperate")).toEqual({ climate: "polar", sourceId: "north" });
    expect(climateAt(places, "hall", "temperate")).toEqual({ climate: "underground", sourceId: "hall" });
  });

  it("falls back to the campaign for no place, an unknown place or a bare chain", () => {
    expect(climateAt(places, null, "warm")).toEqual({ climate: "warm", sourceId: null });
    expect(climateAt(places, "ghost", "warm")).toEqual({ climate: "warm", sourceId: null });
    expect(climateAt(places, "world", "warm")).toEqual({ climate: "warm", sourceId: null });
  });

  it("survives a cycle", () => {
    expect(climateAt(places, "a", "arid")).toEqual({ climate: "arid", sourceId: null });
  });
});
