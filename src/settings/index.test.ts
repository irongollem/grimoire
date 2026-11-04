import { describe, expect, it } from "vitest";
import { createDefaultCustomCalendarDef } from "./types";
import { CALENDAR_REGISTRY, getCalendarAdapter, heroSettingFor } from "./index";

describe("getCalendarAdapter", () => {
  // Bug it fails on: a missing / null / unknown calendar fell back to Faerun, so an empty
  // campaign was a Forgotten Realms campaign (Harptos, year 1495 DR).
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an unknown id", "no-such"],
    ["an inherited object key", "constructor"],
  ])("reads %s as the blank calendar, not Faerun", (_label, id) => {
    const adapter = getCalendarAdapter(id);
    expect(adapter.months).toHaveLength(12);
    expect(adapter.months.every((m) => m.days === 30)).toBe(true);
    expect(adapter.epochName).toBe("AY");
    expect(adapter.defaultYear).toBe(1);
    expect(adapter.intercalaryDays).toEqual([]);
  });

  it("reads 'custom' without a definition as the blank calendar", () => {
    expect(getCalendarAdapter("custom", null).epochName).toBe("AY");
    expect(getCalendarAdapter("custom").months).toHaveLength(12);
  });

  it("keeps the blank calendar out of the registry a DM can pick from", () => {
    expect(Object.keys(CALENDAR_REGISTRY)).not.toContain("blank");
  });

  it("still returns a chosen built-in calendar", () => {
    expect(getCalendarAdapter("faerun")).toBe(CALENDAR_REGISTRY["faerun"]);
    expect(getCalendarAdapter("faerun").epochName).toBe("DR");
    expect(getCalendarAdapter("gregorian").id).toBe("gregorian");
  });

  it("still builds a custom calendar from its definition", () => {
    const def = { ...createDefaultCustomCalendarDef(), epochName: "XY" };
    expect(getCalendarAdapter("custom", def).epochName).toBe("XY");
  });
});

describe("heroSettingFor", () => {
  // Bug it fails on: a new Hall of Heroes entry was always filed under Faerun.
  it("uses the campaign's own setting pack", () => {
    expect(heroSettingFor("eberron")).toBe("eberron");
  });

  it.each([null, undefined, "gregorian", "custom", "no-such"])("falls to homebrew for %s", (id) => {
    expect(heroSettingFor(id)).toBe("homebrew");
  });
});
