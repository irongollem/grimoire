import { describe, expect, it } from "vitest";
import { FAERUN_CALENDAR } from "@/settings/faerun.calendar";
import { DRAGONLANCE_CALENDAR } from "@/settings/dragonlance.calendar";
import { gregorianAdapter } from "@/settings/gregorian.calendar";
import { calendarDefToAdapter } from "@/settings/types";
import { listCalendarAdapters } from "@/settings";
import { buildYearIndex, daysInMonth, ordinalWithinYear } from "./dayMath";
import { MOON_PHASES, moonsForMonth, moonsOn, moonsOnOrdinal } from "./moons";

const faerun = calendarDefToAdapter("faerun", FAERUN_CALENDAR);
const dragonlance = calendarDefToAdapter("dragonlance", DRAGONLANCE_CALENDAR);

describe("moonsOn", () => {
  it("is full on its anchor day and new half a cycle later", () => {
    const [s] = moonsOn(dragonlance, 351, 1, 1, null).filter((m) => m.moon.name === "Lunitari");
    expect(s!.age).toBeCloseTo(0.5);
    expect(s!.phase).toBe("full");
    expect(s!.peak).toBe("full");
    const [n] = moonsOn(dragonlance, 351, 1, 15, null).filter((m) => m.moon.name === "Lunitari");
    expect(n!.phase).toBe("new");
    expect(n!.peak).toBe("new");
  });

  it("works for dates before the anchor", () => {
    const [s] = moonsOn(dragonlance, 340, 5, 3, null);
    expect(s!.age).toBeGreaterThanOrEqual(0);
    expect(s!.age).toBeLessThan(1);
    expect(MOON_PHASES).toContain(s!.phase);
  });

  it("aligns all three Krynn moons every 504 days", () => {
    const [a, b, c] = moonsOn(dragonlance, 351, 1, 1, null);
    expect([a, b, c].every((m) => m!.peak === "full")).toBe(true);
    const year = buildYearIndex(dragonlance, 351).totalDays; // 336 days
    const later = moonsOnOrdinal(dragonlance, 352, 1 + (504 - year));
    expect(later.every((m) => m.peak === "full")).toBe(true);
    expect(moonsOnOrdinal(dragonlance, 352, 2 + (504 - year)).every((m) => m.peak === "full")).toBe(false);
  });

  it("places festival days and returns [] for unplaceable dates", () => {
    expect(moonsOn(faerun, 1495, null, null, "Midwinter")).toHaveLength(1);
    expect(moonsOn(faerun, 1495, null, null, "Shieldmeet")).toEqual([]); // not a leap year
    expect(moonsOn(faerun, 1495, 13, 1, null)).toEqual([]);
    expect(moonsOn(faerun, 1495, null, null, null)).toEqual([]);
  });

  it("gives exactly one full and one new peak day per cycle", () => {
    const moon = faerun.moons[0]!;
    const cycles = 3;
    const span = Math.floor(moon.cycleDays * cycles); // 91 days from a peak day
    let full = 0;
    let fresh = 0;
    // Start at the anchor's year, month 2 (clear of the anchor itself) for 3 whole cycles.
    const start = ordinalWithinYear(faerun, 1372, 1, 30, null)!;
    for (let i = 0; i < span; i++) {
      // Within 1372 (a leap year, 366 days) the span fits well inside the year.
      const s = moonsOnOrdinal(faerun, 1372, start + i)[0]!;
      if (s.peak === "full") full++;
      if (s.peak === "new") fresh++;
    }
    expect(full).toBe(3);
    expect(fresh).toBe(3);
  });

  it("skips moons with a bad cycle or an unplaceable anchor instead of throwing", () => {
    const bad = {
      ...faerun,
      moons: [
        { name: "Zero", cycleDays: 0, fullOn: { year: 1, month: 1, day: 1 } },
        { name: "NaN", cycleDays: Number.NaN, fullOn: { year: 1, month: 1, day: 1 } },
        { name: "Lost", cycleDays: 10, fullOn: { year: 1, month: 99, day: 1 } },
        { name: "Fine", cycleDays: 10, fullOn: { year: 1495, month: 1, day: 1 } },
      ],
    };
    expect(moonsOn(bad, 1495, 1, 1, null).map((m) => m.moon.name)).toEqual(["Fine"]);
    expect(moonsForMonth(bad, 1495, 1)[0]!.map((m) => m.moon.name)).toEqual(["Fine"]);
  });
});

describe("moonsForMonth", () => {
  function expectMatchesDayByDay(adapter: typeof faerun, year: number, month: number) {
    const grid = moonsForMonth(adapter, year, month);
    expect(grid).toHaveLength(daysInMonth(adapter, year, month));
    grid.forEach((cell, i) => {
      expect(cell).toEqual(moonsOn(adapter, year, month, i + 1, null));
    });
  }

  it("matches moonsOn across Shieldmeet in a leap year", () => {
    expectMatchesDayByDay(faerun, 1496, 7);
    expectMatchesDayByDay(faerun, 1496, 8);
  });

  it("matches moonsOn for Gregorian February in a leap year", () => {
    expect(daysInMonth(gregorianAdapter, 2024, 2)).toBe(29);
    expectMatchesDayByDay(gregorianAdapter, 2024, 2);
  });

  it("returns empty cells for a month the calendar lacks", () => {
    expect(moonsForMonth(faerun, 1495, 13)).toEqual([]);
  });

  it("puts a real full moon on 21 January 2000 and 19 January 2019 (Gregorian)", () => {
    expect(moonsOn(gregorianAdapter, 2000, 1, 21, null)[0]!.peak).toBe("full");
    expect(moonsOn(gregorianAdapter, 2019, 1, 21, null)[0]!.peak).toBe("full");
  });
});

describe("built-in calendars", () => {
  it("every moon anchor is a placeable date", () => {
    for (const a of listCalendarAdapters()) {
      for (const m of a.moons) {
        expect(
          ordinalWithinYear(a, m.fullOn.year, m.fullOn.month, m.fullOn.day, null),
          `${a.id}/${m.name}`,
        ).toBeDefined();
        expect(m.fullOn.day).toBeLessThanOrEqual(daysInMonth(a, m.fullOn.year, m.fullOn.month));
        expect(m.cycleDays).toBeGreaterThan(0);
      }
    }
  });
});
