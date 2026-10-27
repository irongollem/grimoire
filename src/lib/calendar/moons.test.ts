import { describe, expect, it } from "vitest";
import { FAERUN_CALENDAR } from "@/settings/faerun.calendar";
import { DRAGONLANCE_CALENDAR } from "@/settings/dragonlance.calendar";
import { gregorianAdapter } from "@/settings/gregorian.calendar";
import { calendarDefToAdapter } from "@/settings/types";
import { listCalendarAdapters } from "@/settings";
import { buildYearIndex, daysInMonth } from "./dayMath";
import { MOON_PHASES, moonAnchorOrdinal, moonsForMonth, moonsOn, moonsOnOrdinal } from "./moons";

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

  it("gives an odd whole-day cycle one new moon per cycle, not none", () => {
    // 29 days: the new moon lands exactly half a day from a whole day on both sides.
    const odd = { ...faerun, moons: [{ name: "Odd", cycleDays: 29, fullOn: { year: 1495, month: 1, day: 1 } }] };
    let fulls = 0;
    let news = 0;
    for (let day = 1; day <= 29; day++) {
      const peak = moonsOn(odd, 1495, 1, day, null)[0]!.peak;
      if (peak === "full") fulls++;
      if (peak === "new") news++;
    }
    // One full (the anchor, day 1) and one new (day 15) in the first 29 days.
    expect([fulls, news]).toEqual([1, 1]);
  });

  it("names a day by the nearest of the eight phases, so six days past full is the last quarter", () => {
    const cycle28 = { ...faerun, moons: [{ name: "Q", cycleDays: 28, fullOn: { year: 1495, month: 1, day: 1 } }] };
    const phaseOn = (day: number) => moonsOn(cycle28, 1495, 1, day, null)[0]!.phase;
    expect(phaseOn(1)).toBe("full");
    expect(phaseOn(7)).toBe("last_quarter"); // 6 days past full is 0.71 of the way round, nearer 0.75 than 0.625
    expect(phaseOn(6)).toBe("waning_gibbous");
    expect(phaseOn(15)).toBe("new");
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

describe("moonAnchorOrdinal", () => {
  it("places dated and festival anchors", () => {
    expect(moonAnchorOrdinal(faerun, { year: 1372, month: 1, day: 30 })).toBe(30);
    expect(moonAnchorOrdinal(faerun, { year: 1372, festival: "Midwinter" })).toBe(31);
  });

  it("rejects values that cannot be placed", () => {
    const bad = [
      { year: 1372, month: 1, day: 31 }, // past a 30-day month
      { year: 1372, month: 1, day: 0 },
      { year: 1372, month: 0, day: 1 },
      { year: 1372, month: 13, day: 1 },
      { year: 1372, month: 1, day: 1.5 },
      { year: 1372.5, month: 1, day: 1 },
      { year: null, month: 1, day: 1 },
      { year: 1372, month: null, day: 1 },
      { year: 1372, month: 1, day: "" },
      { year: 1495, festival: "Shieldmeet" }, // not a leap year
      { year: 1372, festival: "" },
      { year: 1372, festival: "Nope" },
    ] as unknown as Parameters<typeof moonAnchorOrdinal>[1][];
    for (const anchor of bad) expect(moonAnchorOrdinal(faerun, anchor), JSON.stringify(anchor)).toBeUndefined();
  });

  it("makes a moon with a bad anchor skip rather than shift", () => {
    const a = { ...faerun, moons: [{ name: "X", cycleDays: 10, fullOn: { year: 1372, month: 1, day: 31 } }] };
    expect(moonsOn(a, 1372, 1, 5, null)).toEqual([]);
  });
});

describe("peaks", () => {
  it("gives Selune exactly one full and one new peak per cycle over 50 cycles", () => {
    const moon = faerun.moons[0]!;
    const c = moon.cycleDays;
    const anchor = moonAnchorOrdinal(faerun, moon.fullOn)!;
    const days = Math.ceil(c * 50);
    const full = new Map<number, number>();
    const fresh = new Map<number, number>();
    let fullTotal = 0;
    let newTotal = 0;
    for (let d = 0; d < days; d++) {
      // Stay inside the anchor's year family by walking ordinals across years.
      let year = 1372;
      let ord = anchor + d;
      for (;;) {
        const len = buildYearIndex(faerun, year).totalDays;
        if (ord <= len) break;
        ord -= len;
        year++;
      }
      const s = moonsOnOrdinal(faerun, year, ord)[0]!;
      // Cycle window k covers days since full in [-c/2, c/2) around full k.
      if (s.peak === "full") {
        fullTotal++;
        const k = Math.round(d / c);
        full.set(k, (full.get(k) ?? 0) + 1);
      }
      if (s.peak === "new") {
        newTotal++;
        const k = Math.floor(d / c);
        fresh.set(k, (fresh.get(k) ?? 0) + 1);
      }
    }
    for (const n of full.values()) expect(n).toBe(1);
    for (const n of fresh.values()) expect(n).toBe(1);
    // days spans 50 cycles from a full: 51 fulls (k=0..50 counting the half-window at the end) at most, 50 news.
    expect(newTotal).toBe(50);
    expect(fullTotal).toBeGreaterThanOrEqual(50);
    expect(fullTotal).toBeLessThanOrEqual(51);
  });

  it("is full on Midwinter 1372 itself", () => {
    const [s] = moonsOn(faerun, 1372, null, null, "Midwinter");
    expect(s!.peak).toBe("full");
    expect(s!.phase).toBe("full");
  });

  it("labels a peak day with the peak, even on a short cycle", () => {
    const a = { ...faerun, moons: [{ name: "Quick", cycleDays: 6.5, fullOn: { year: 1495, month: 1, day: 1 } }] };
    let fulls = 0;
    let news = 0;
    for (let day = 1; day <= 30; day++) {
      const s = moonsOn(a, 1495, 1, day, null)[0]!;
      if (s.peak === "full") {
        fulls++;
        expect(s.phase).toBe("full");
      }
      if (s.peak === "new") {
        news++;
        expect(s.phase).toBe("new");
      }
    }
    expect(fulls).toBeGreaterThan(0);
    expect(news).toBeGreaterThan(0);
  });
});

describe("built-in calendars", () => {
  it("every moon anchor is a placeable date", () => {
    for (const a of listCalendarAdapters()) {
      for (const m of a.moons) {
        expect(moonAnchorOrdinal(a, m.fullOn), `${a.id}/${m.name}`).toBeDefined();
        expect(m.cycleDays).toBeGreaterThan(0);
      }
    }
  });
});
