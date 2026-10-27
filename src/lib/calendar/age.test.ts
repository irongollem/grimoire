import { describe, expect, it } from "vitest";
import type { CalendarAdapter } from "@/types/calendar.types";
import { ageOn, deathOf, displayAge, displayBirth, displayDeath, formatBirthDate } from "./age";

const ADAPTER: CalendarAdapter = {
  id: "test",
  name: "Test",
  epochName: "TE",
  defaultYear: 1000,
  months: [
    { num: 1, name: "First", days: 30 },
    { num: 2, name: "Second", days: 30 },
  ],
  intercalaryDays: [{ name: "Leap Day", afterMonth: 1, description: "", isLeapOnly: true }],
  weekSize: 10,
  moons: [],
  seasons: [],
  isLeapYear: (y) => y % 4 === 0,
  formatDate: (y, m, d) => (m !== null && d !== null ? `${d} M${m} ${y} TE` : `${y} TE`),
};

const today = { year: 1448, month: 2, day: 10 };

describe("ageOn", () => {
  it("counts whole years, subtracting when the birthday is still to come", () => {
    expect(ageOn(ADAPTER, { year: 1400, month: 2, day: 10 }, today)).toBe(48);
    expect(ageOn(ADAPTER, { year: 1400, month: 2, day: 11 }, today)).toBe(47);
    expect(ageOn(ADAPTER, { year: 1400, month: 1, day: 30 }, today)).toBe(48);
  });
  it("uses the year difference when only a year is known", () => {
    expect(ageOn(ADAPTER, { year: 1400, month: null, day: null }, today)).toBe(48);
  });
  it("is null when today precedes the birth", () => {
    expect(ageOn(ADAPTER, { year: 1449, month: null, day: null }, today)).toBeNull();
    expect(ageOn(ADAPTER, { year: 1448, month: 2, day: 11 }, today)).toBeNull();
  });
  it("is 0 in the birth year after the birthday", () => {
    expect(ageOn(ADAPTER, { year: 1448, month: 1, day: 1 }, today)).toBe(0);
  });
  it("is null for unusable data", () => {
    expect(ageOn(ADAPTER, { year: 1400.5, month: null, day: null }, today)).toBeNull();
    expect(ageOn(ADAPTER, { year: 1400, month: 9, day: 1 }, today)).toBeNull();
  });
  it("is null when today's own month is not in the calendar, or the birthday is not a whole day", () => {
    expect(ageOn(ADAPTER, { year: 1400, month: 1, day: 1 }, { year: 1448, month: 9, day: 1 })).toBeNull();
    expect(ageOn(ADAPTER, { year: 1400, month: 1, day: 5.5 }, today)).toBeNull();
  });
  it("is not thrown by a leap year's extra day", () => {
    // Leap Day sits after month 1, shifting month 2 by one on both sides.
    expect(ageOn(ADAPTER, { year: 1400, month: 2, day: 10 }, { year: 1448, month: 2, day: 10 })).toBe(48);
  });
});

describe("formatBirthDate", () => {
  it("shows the full date or just the year", () => {
    expect(formatBirthDate(ADAPTER, { year: 1400, month: 2, day: 5 })).toBe("5 M2 1400 TE");
    expect(formatBirthDate(ADAPTER, { year: 1400, month: null, day: null })).toBe("1400 TE");
  });
});

describe("displayAge", () => {
  it("prefers the date over the free text", () => {
    expect(displayAge(ADAPTER, { age: "ancient", born_year: 1400 }, today)).toBe("48");
  });
  it("falls back to the free text without a birth year or a usable one", () => {
    expect(displayAge(ADAPTER, { age: "ancient" }, today)).toBe("ancient");
    expect(displayAge(ADAPTER, { age: "ancient", born_year: 1500 }, today)).toBe("ancient");
    expect(displayAge(ADAPTER, { age: "  " }, today)).toBeNull();
    expect(displayAge(ADAPTER, {}, today)).toBeNull();
  });
  it("shows a newborn as 0, not as the free text", () => {
    expect(displayAge(ADAPTER, { age: "infant", born_year: 1448, born_month: 1, born_day: 1 }, today)).toBe("0");
  });
  it("ignores a month without a day", () => {
    expect(displayAge(ADAPTER, { born_year: 1400, born_month: 2, born_day: null }, today)).toBe("48");
  });
});

describe("displayBirth", () => {
  it("is null without a birth year", () => {
    expect(displayBirth(ADAPTER, { age: "x" })).toBeNull();
    expect(displayBirth(ADAPTER, { born_year: 1400, born_month: 1, born_day: 2 })).toBe("2 M1 1400 TE");
  });
});

describe("a dead row", () => {
  const dead = { status: "dead", born_year: 1400 };
  it("is aged to its death date, not to today", () => {
    expect(displayAge(ADAPTER, { ...dead, died_year: 1430, died_month: 2, died_day: 10 }, today)).toBe("30");
    expect(displayAge(ADAPTER, { ...dead, born_month: 2, born_day: 11, died_year: 1430, died_month: 2, died_day: 10 }, today)).toBe("29");
  });
  it("uses the year difference when only the death year is known", () => {
    expect(displayAge(ADAPTER, { ...dead, born_month: 2, born_day: 11, died_year: 1430 }, today)).toBe("30");
  });
  it("is never aged against today without a death date", () => {
    expect(displayAge(ADAPTER, dead, today)).toBeNull();
    expect(displayAge(ADAPTER, { ...dead, age: "ancient" }, today)).toBe("ancient");
  });
  it("ignores a death date while the row is alive", () => {
    expect(displayAge(ADAPTER, { status: "alive", born_year: 1400, died_year: 1430 }, today)).toBe("48");
  });
  it("falls back to the free text when the death precedes the birth", () => {
    expect(displayAge(ADAPTER, { ...dead, age: "unknown", died_year: 1390 }, today)).toBe("unknown");
  });
  it("shows the death date only for a dead row", () => {
    expect(displayDeath(ADAPTER, { ...dead, died_year: 1430, died_month: 2, died_day: 5 })).toBe("5 M2 1430 TE");
    expect(displayDeath(ADAPTER, { status: "alive", died_year: 1430 })).toBeNull();
    expect(displayDeath(ADAPTER, dead)).toBeNull();
    expect(deathOf({ died_year: 1430, died_month: 2 })).toEqual({ year: 1430, month: null, day: null });
  });
});
