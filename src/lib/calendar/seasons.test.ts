import { describe, expect, it } from "vitest";
import { listCalendarAdapters } from "@/settings";
import { FAERUN_CALENDAR } from "@/settings/faerun.calendar";
import { gregorianAdapter } from "@/settings/gregorian.calendar";
import { calendarDefToAdapter } from "@/settings/types";
import { daysInMonth } from "./dayMath";
import { seasonOn, seasonStartsInMonth } from "./seasons";

const faerun = calendarDefToAdapter("faerun", FAERUN_CALENDAR);

describe("seasonOn", () => {
  it("is null with no seasons or an unplaceable date", () => {
    expect(seasonOn({ ...faerun, seasons: [] }, 1495, 1, 1, null)).toBeNull();
    expect(seasonOn(faerun, 1495, 13, 1, null)).toBeNull();
    expect(seasonOn(faerun, 1495, null, null, "Shieldmeet")).toBeNull();
  });

  it("starts a season on its start day (day 1) and counts from there", () => {
    const s = seasonOn(faerun, 1495, 3, 19, null)!;
    expect(s.season.name).toBe("Spring");
    expect(s.dayOfSeason).toBe(1);
    expect(seasonOn(faerun, 1495, 3, 18, null)!.season.name).toBe("Winter");
    expect(seasonOn(faerun, 1495, 4, 1, null)!.dayOfSeason).toBe(13);
  });

  it("counts festival days into the season", () => {
    // Greengrass sits after Tarsakh, inside Spring: Ches 19..30 is 12 days, Tarsakh 30 more, Greengrass the next.
    const s = seasonOn(faerun, 1495, null, null, "Greengrass")!;
    expect(s.season.name).toBe("Spring");
    expect(s.dayOfSeason).toBe(12 + 30 + 1);
  });

  it("carries winter across the year boundary", () => {
    const s = seasonOn(faerun, 1495, 1, 1, null)!;
    expect(s.season.name).toBe("Winter");
    // Nightal 20 .. Nightal 30 = 11 days, then Hammer 1 -> Midwinter is not a day yet: day 12.
    expect(s.dayOfSeason).toBe(12);
  });

  it("does not depend on list order", () => {
    const shuffled = { ...faerun, seasons: [...faerun.seasons].reverse() };
    expect(seasonOn(shuffled, 1495, 7, 1, null)).toEqual(seasonOn(faerun, 1495, 7, 1, null));
  });

  it("clamps a start day past the month's end", () => {
    const a = { ...faerun, seasons: [{ name: "Late", startsOn: { month: 1, day: 99 } }] };
    expect(seasonOn(a, 1495, 1, 30, null)!.dayOfSeason).toBe(1);
  });

  it("skips a start whose month or day is not an integer (bad JSON)", () => {
    const bad = [
      { name: "NullDay", startsOn: { month: 3, day: null as unknown as number } },
      { name: "EmptyMonth", startsOn: { month: "" as unknown as number, day: 1 } },
      { name: "Good", startsOn: { month: 6, day: 1 } },
    ];
    const a = { ...faerun, seasons: bad };
    const got = seasonOn(a, 1495, 7, 1, null)!;
    expect(got.season.name).toBe("Good");
    expect(Number.isFinite(got.dayOfSeason)).toBe(true);
    expect(seasonStartsInMonth(a, 1495, 3)).toEqual([]);
    expect(seasonStartsInMonth(a, 1495, 6).map((x) => x.season.name)).toEqual(["Good"]);
  });

  it("has no season when none of the starts can be placed, rather than throwing", () => {
    const a = { ...faerun, seasons: [{ name: "Lost", startsOn: { month: 99, day: 1 } }] };
    expect(seasonOn(a, 1495, 1, 1, null)).toBeNull();
  });

  it("ignores a start in a month the calendar lacks, even when it lists last", () => {
    const a = { ...faerun, seasons: [{ name: "Good", startsOn: { month: 6, day: 1 } }, { name: "Lost", startsOn: { month: 99, day: 1 } }] };
    // Before Good starts this year, last year's Good is still running.
    expect(seasonOn(a, 1495, 2, 1, null)!.season.name).toBe("Good");
  });

  it("uses the real February length for a Gregorian start", () => {
    const a = { ...gregorianAdapter, seasons: [{ name: "X", startsOn: { month: 2, day: 29 } }] };
    expect(seasonOn(a, 2023, 2, 28, null)!.dayOfSeason).toBe(1); // clamped to 28 in a common year
    expect(seasonOn(a, 2024, 2, 29, null)!.dayOfSeason).toBe(1);
  });
});

describe("seasonStartsInMonth", () => {
  it("lists starts in the month by day", () => {
    expect(seasonStartsInMonth(faerun, 1495, 3).map((x) => [x.day, x.season.name])).toEqual([[19, "Spring"]]);
    expect(seasonStartsInMonth(faerun, 1495, 2)).toEqual([]);
  });

  it("lists nothing for a month the calendar lacks", () => {
    const a = { ...faerun, seasons: [{ name: "Lost", startsOn: { month: 99, day: 1 } }] };
    expect(seasonStartsInMonth(a, 1495, 99)).toEqual([]);
  });

  it("sorts several starts in one month", () => {
    const a = {
      ...faerun,
      seasons: [
        { name: "B", startsOn: { month: 1, day: 20 } },
        { name: "A", startsOn: { month: 1, day: 5 } },
      ],
    };
    expect(seasonStartsInMonth(a, 1495, 1).map((x) => x.season.name)).toEqual(["A", "B"]);
  });
});

describe("built-in calendars", () => {
  it("every season start is a placeable date", () => {
    for (const a of listCalendarAdapters()) {
      for (const s of a.seasons) {
        expect(s.startsOn.month, `${a.id}/${s.name}`).toBeGreaterThanOrEqual(1);
        expect(s.startsOn.month, `${a.id}/${s.name}`).toBeLessThanOrEqual(a.months.length);
        expect(s.startsOn.day).toBeLessThanOrEqual(daysInMonth(a, a.defaultYear, s.startsOn.month));
        expect(seasonOn(a, a.defaultYear, s.startsOn.month, s.startsOn.day, null)!.dayOfSeason).toBe(1);
      }
    }
  });
});
