import { describe, expect, it } from "vitest";
import { createDefaultCustomCalendarDef } from "../../../../src/settings/types";
import { dateTextFor, todaySection, todayText } from "./today";

const blank = createDefaultCustomCalendarDef();
const custom = { ...blank, months: [{ name: "Frostmoot", days: 20 }, { name: "Highsun", days: 20 }] };

describe("todayText", () => {
  // Bug caught: the Narrator was never told the date (or was told "Day 0" when a campaign had none).
  it("words the date the way the campaign's own calendar does", () => {
    expect(todayText({ current_year: 1492, current_month: 3, current_day: 7, calendar_id: "gregorian" })).toBe("7 March, 1492 AD");
  });

  it("reads a campaign with no calendar chosen as the blank calendar, and a custom one by its definition", () => {
    expect(todayText({ current_year: 5, current_month: 1, current_day: 2, calendar_id: null })).toMatch(/\b5\b/);
    expect(todayText({ current_year: 5, current_month: 2, current_day: 2, calendar_id: "custom", custom_calendar: custom })).toContain("Highsun");
  });

  it("is null when any part of the date is missing, never a made-up day", () => {
    expect(todayText({ current_year: 1492, current_month: null, current_day: 7, calendar_id: "gregorian" })).toBeNull();
    expect(todayText({ calendar_id: "gregorian" })).toBeNull();
    expect(todayText(null)).toBeNull();
  });
});

describe("dateTextFor", () => {
  it("words any day by the same calendar, for a delayed payoff's due day", () => {
    expect(dateTextFor({ calendar_id: "gregorian" })(1492, 12, 25)).toBe("25 December, 1492 AD");
  });
});

describe("todaySection", () => {
  it("states the date, and is absent with none", () => {
    expect(todaySection("7 March, 1492 AD")).toBe("## Today\n\nToday is 7 March, 1492 AD.");
    expect(todaySection(null)).toBe("");
    expect(todaySection("  ")).toBe("");
    expect(todaySection(undefined)).toBe("");
  });
});
