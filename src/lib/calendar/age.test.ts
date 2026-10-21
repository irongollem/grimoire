import { describe, expect, it } from "vitest";
import type { CalendarAdapter } from "@/types/calendar.types";
import { ageOn, displayAge, displayBirth, formatBirthDate } from "./age";

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
