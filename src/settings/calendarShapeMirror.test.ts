import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { CALENDAR_REGISTRY, listSettings } from "@/settings";
import { gregorianAdapter } from "@/settings/gregorian.calendar";

/**
 * The database does in-world date arithmetic of its own, so it can fire a
 * delayed quest consequence on the date change (`private.calendar_shape`, #1016).
 * It holds the built-in calendars' shapes as data; this file holds that data
 * equal to the TypeScript registry, so neither side can change a month length,
 * a festival or a leap rule alone. Same arrangement as
 * `campaignSyncTables.test.ts`.
 *
 * supabase/tests/calendar_day_math.test.sql checks the database half.
 */
const DAY_MATH_TEST = resolve(process.cwd(), "supabase/tests/calendar_day_math.test.sql");

interface CalendarShape {
  months: number[];
  intercalary: { after: number; leap_only: boolean }[];
  leap_rule: string;
  leap_month: number | null;
}

function pgTapShapes(): Record<string, CalendarShape> {
  const sql = readFileSync(DAY_MATH_TEST, "utf8");
  const block = /insert into expected_calendar_shapes \([a-z_, ]+\) values([\s\S]*?);/.exec(sql);
  if (!block) throw new Error("could not find the expected_calendar_shapes list in calendar_day_math.test.sql");
  const shapes: Record<string, CalendarShape> = {};
  // The JSON never contains a single quote, so the first one after the shape's
  // opening quote closes it.
  for (const m of block[1].matchAll(/\('([a-z_]+)',\s*'([^']*)'\)/g)) {
    shapes[m[1]] = JSON.parse(m[2]) as CalendarShape;
  }
  return shapes;
}

function registryShapes(): Record<string, CalendarShape> {
  const leapRules = new Map(listSettings().map((s) => [s.id, s.calendar.leapYearRule]));
  const shapes: Record<string, CalendarShape> = {};
  for (const id of Object.keys(CALENDAR_REGISTRY).sort()) {
    const adapter = CALENDAR_REGISTRY[id]!;
    const isGregorian = id === "gregorian";
    const leapRule = isGregorian ? "gregorian" : leapRules.get(id);
    if (leapRule === undefined) throw new Error(`no leap rule for built-in calendar ${id}`);
    shapes[id] = {
      months: adapter.months.map((month) => month.days),
      intercalary: adapter.intercalaryDays.map((d) => ({ after: d.afterMonth, leap_only: !!d.isLeapOnly })),
      leap_rule: leapRule,
      leap_month: isGregorian ? 2 : null,
    };
  }
  return shapes;
}

describe("calendar shapes held by the database", () => {
  it("match the built-in calendars in the TypeScript registry", () => {
    const fromSql = pgTapShapes();
    const fromRegistry = registryShapes();
    expect(Object.keys(fromSql).sort()).toEqual(Object.keys(fromRegistry).sort());
    expect(fromSql).toEqual(fromRegistry);
  });

  it("describe the Gregorian calendar faithfully as leap_month 2 plus the gregorian rule", () => {
    const feb = (year: number) => gregorianAdapter.daysInMonth?.(year, 2);
    expect(feb(2024)).toBe(29);
    expect(feb(2000)).toBe(29);
    expect(feb(2023)).toBe(28);
    expect(feb(1900)).toBe(28);
  });
});
