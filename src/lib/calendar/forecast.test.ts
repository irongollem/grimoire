import { describe, expect, it } from "vitest";
import { gregorianAdapter } from "@/settings/gregorian.calendar";
import type { CalendarAdapter } from "@/types/calendar.types";
import { addDays } from "./dayMath";
import { weatherForecast } from "./forecast";
import { weatherOn } from "./weather";

const from = { year: 12, month: 3, day: 10 };

describe("weatherForecast", () => {
  it("is deterministic, the requested length, and matches weatherOn day by day", () => {
    const a = weatherForecast(gregorianAdapter, "temperate", "c1:campaign", from, 5);
    expect(a).toEqual(weatherForecast(gregorianAdapter, "temperate", "c1:campaign", from, 5));
    expect(a).toHaveLength(5);
    a.forEach((d, i) => {
      expect(d.date).toEqual(addDays(gregorianAdapter, from, i + 1));
      expect(d.weather).toEqual(weatherOn(gregorianAdapter, "temperate", "c1:campaign", d.date.year, d.date.month, d.date.day, null));
    });
  });

  it("is empty underground", () => {
    expect(weatherForecast(gregorianAdapter, "underground", "c1:campaign", from)).toEqual([]);
  });

  it("never repeats a date when an offset rolls off a festival day", () => {
    const festive: CalendarAdapter = {
      ...gregorianAdapter,
      id: "festive",
      months: [
        { num: 1, name: "First", days: 30 },
        { num: 2, name: "Second", days: 30 },
      ],
      intercalaryDays: [
        { name: "Founding", afterMonth: 1, description: "" },
        { name: "Midyear", afterMonth: 1, description: "" },
      ],
      daysInMonth: undefined,
      seasons: [],
    };
    const out = weatherForecast(festive, "temperate", "c1:campaign", { year: 12, month: 1, day: 29 }, 5);
    expect(out).toHaveLength(5);
    const keys = out.map((d) => `${d.date.year}-${d.date.month}-${d.date.day}`);
    expect(keys[0]).toBe("12-1-30");
    expect(keys[1]).toBe("12-2-1");
    expect(new Set(keys).size).toBe(5);
  });
});
