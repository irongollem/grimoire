import { describe, it, expect } from "vitest";
import {
  calendarDefToAdapter,
  createDefaultCustomCalendarDef,
  toCalendarAdapter,
} from "./types";
import type { SettingCalendarDef, DndSettingDef } from "./types";

const tendayDef: SettingCalendarDef = {
  name: "Custom Harptos",
  epochName: "DR",
  defaultYear: 1500,
  weekStyle: "tenday",
  weekRowNames: ["First Tenday", "Second Tenday", "Third Tenday"],
  months: [
    { name: "Hammer", days: 30 },
    { name: "Alturiak", days: 30 },
  ],
  intercalaryDays: [
    { name: "Midwinter", afterMonth: 1, description: "A festival day." },
    { name: "Shieldmeet", afterMonth: 1, description: "Leap day.", isLeapOnly: true },
  ],
  leapYearRule: "every4",
};

const weeklyDef: SettingCalendarDef = {
  name: "Custom Common",
  epochName: "AY",
  defaultYear: 100,
  weekStyle: "weekly",
  dayLabels: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
  months: [
    { name: "Firstmonth", alias: "Spring", days: 28 },
    { name: "Secondmonth", days: 31 },
  ],
  intercalaryDays: [],
  leapYearRule: "gregorian",
};

describe("calendarDefToAdapter", () => {
  it("preserves the supplied id and surfaces calendar metadata", () => {
    const a = calendarDefToAdapter("custom", tendayDef);
    expect(a.id).toBe("custom");
    expect(a.name).toBe("Custom Harptos");
    expect(a.epochName).toBe("DR");
    expect(a.defaultYear).toBe(1500);
  });

  it("maps months to CalendarMonth with 1-based num", () => {
    const a = calendarDefToAdapter("custom", tendayDef);
    expect(a.months).toEqual([
      { num: 1, name: "Hammer", alias: undefined, days: 30 },
      { num: 2, name: "Alturiak", alias: undefined, days: 30 },
    ]);
  });

  it("maps intercalary days and keeps leap-only flag", () => {
    const a = calendarDefToAdapter("custom", tendayDef);
    expect(a.intercalaryDays).toHaveLength(2);
    expect(a.intercalaryDays[1]?.isLeapOnly).toBe(true);
  });

  it("sets weekSize 10 for tenday and derives from dayLabels for weekly", () => {
    expect(calendarDefToAdapter("custom", tendayDef).weekSize).toBe(10);
    expect(calendarDefToAdapter("custom", weeklyDef).weekSize).toBe(7);
  });

  it("supports custom weekly week sizes from dayLabels.length", () => {
    const fiveDay: SettingCalendarDef = {
      ...weeklyDef,
      weekStyle: "weekly",
      dayLabels: ["A", "B", "C", "D", "E"],
    };
    const adapter = calendarDefToAdapter("custom", fiveDay);
    expect(adapter.weekSize).toBe(5);
    // formatDate should use 5-day weeks
    expect(adapter.formatDate(100, 1, 6, null)).toBe("Day 1 of Week 2, Firstmonth, 100 AY");
    expect(adapter.formatDate(100, 1, 11, null)).toBe("Day 1 of Week 3, Firstmonth, 100 AY");
  });

  it("falls back to a 7-day week when weekly has no dayLabels", () => {
    const noLabels: SettingCalendarDef = { ...weeklyDef, dayLabels: undefined };
    expect(calendarDefToAdapter("custom", noLabels).weekSize).toBe(7);
  });

  it("implements every4 leap rule", () => {
    const a = calendarDefToAdapter("custom", tendayDef);
    expect(a.isLeapYear(1500)).toBe(true);   // div by 4
    expect(a.isLeapYear(1501)).toBe(false);
    expect(a.isLeapYear(1600)).toBe(true);   // every4 doesn't care about centuries
  });

  it("implements gregorian leap rule", () => {
    const a = calendarDefToAdapter("custom", weeklyDef);
    expect(a.isLeapYear(2000)).toBe(true);   // div by 400
    expect(a.isLeapYear(1900)).toBe(false);  // century not div by 400
    expect(a.isLeapYear(2024)).toBe(true);   // div by 4
    expect(a.isLeapYear(2023)).toBe(false);
  });

  it("implements 'none' leap rule", () => {
    const def: SettingCalendarDef = { ...weeklyDef, leapYearRule: "none" };
    const a = calendarDefToAdapter("custom", def);
    expect(a.isLeapYear(2000)).toBe(false);
    expect(a.isLeapYear(2024)).toBe(false);
  });

  it("only attaches weekdayOffset for weekly-offset calendars", () => {
    expect(calendarDefToAdapter("custom", tendayDef).weekdayOffset).toBeUndefined();
    expect(calendarDefToAdapter("custom", weeklyDef).weekdayOffset).toBeUndefined();

    const offsetDef: SettingCalendarDef = { ...weeklyDef, weekStyle: "weekly-offset" };
    expect(calendarDefToAdapter("custom", offsetDef).weekdayOffset).toBeTypeOf("function");
  });

  it("formats dates with epoch and festival day", () => {
    const a = calendarDefToAdapter("custom", tendayDef);
    expect(a.formatDate(1500, null, null, "Midwinter")).toBe("Midwinter, 1500 DR");
    expect(a.formatDate(1500, null, null, null)).toBe("1500 DR");
  });

  it("formats tenday dates using weekRowNames", () => {
    const a = calendarDefToAdapter("custom", tendayDef);
    expect(a.formatDate(1500, 1, 5, null)).toBe("Day 5 of First Tenday, Hammer, 1500 DR");
    expect(a.formatDate(1500, 1, 15, null)).toBe("Day 5 of Second Tenday, Hammer, 1500 DR");
  });

  it("formats weekly dates with week + dayInWeek", () => {
    const a = calendarDefToAdapter("custom", weeklyDef);
    expect(a.formatDate(100, 1, 8, null)).toBe("Day 1 of Week 2, Firstmonth, 100 AY");
  });
});

describe("createDefaultCustomCalendarDef", () => {
  it("produces a valid weekly-style starter", () => {
    const def = createDefaultCustomCalendarDef();
    expect(def.weekStyle).toBe("weekly");
    expect(def.months).toHaveLength(12);
    expect(def.months.every((m) => m.days === 30)).toBe(true);
    expect(def.intercalaryDays).toEqual([]);
    expect(def.leapYearRule).toBe("none");
    // Sanity: it should round-trip through the adapter without throwing.
    const adapter = calendarDefToAdapter("custom", def);
    expect(adapter.weekSize).toBe(7);
    expect(adapter.formatDate(1, 1, 1, null)).toBe("Day 1 of Week 1, Month 1, 1 AY");
  });
});

describe("toCalendarAdapter (legacy DndSettingDef wrapper)", () => {
  it("delegates to calendarDefToAdapter using the setting id", () => {
    const fakeSetting: DndSettingDef = {
      id: "fake",
      label: "Fake",
      defaultAiPrompt: "",
      calendar: tendayDef,
      locations: [],
      factions: [],
      heroes: [],
      pantheons: [],
      deities: [],
    };
    const a = toCalendarAdapter(fakeSetting);
    expect(a.id).toBe("fake");
    expect(a.weekSize).toBe(10);
  });
});
