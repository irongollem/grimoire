import { describe, it, expect } from "vitest";
import { createDefaultCustomCalendarDef, type SettingCalendarDef } from "@/settings/types";
import { customCalendarProblem } from "./customCalendar";

function cal(patch: Partial<SettingCalendarDef> = {}): SettingCalendarDef {
  return { ...createDefaultCustomCalendarDef(), ...patch };
}

describe("customCalendarProblem", () => {
  it("passes the default calendar, and one with a sound moon and season", () => {
    expect(customCalendarProblem(cal())).toBeNull();
    expect(
      customCalendarProblem(
        cal({
          moons: [{ name: "Pale", cycleDays: 28, fullOn: { year: 1, month: 2, day: 30 } }],
          seasons: [{ name: "Wet", startsOn: { month: 12, day: 30 } }],
        }),
      ),
    ).toBeNull();
  });

  it("refuses a moon anchored on a day its month does not have", () => {
    const moons = [{ name: "Pale", cycleDays: 28, fullOn: { year: 1, month: 2, day: 31 } }];
    expect(customCalendarProblem(cal({ moons }))).toBe("The full-moon day of Pale is not a day in this calendar.");
  });

  it("refuses a moon anchored on a festival the calendar lacks, and accepts one it has", () => {
    const moons = [{ name: "Pale", cycleDays: 28, fullOn: { year: 1, festival: "Midwinter" } }];
    expect(customCalendarProblem(cal({ moons }))).not.toBeNull();
    const intercalaryDays = [{ name: "Midwinter", afterMonth: 1, description: "" }];
    expect(customCalendarProblem(cal({ moons, intercalaryDays }))).toBeNull();
  });

  it("refuses cleared number fields, which read back as null", () => {
    const blank = null as unknown as number;
    expect(customCalendarProblem(cal({ moons: [{ name: "Pale", cycleDays: blank, fullOn: { year: 1, month: 1, day: 1 } }] }))).toBe(
      "Every moon needs a cycle longer than 0 days.",
    );
    expect(customCalendarProblem(cal({ moons: [{ name: "Pale", cycleDays: 28, fullOn: { year: blank, month: 1, day: 1 } }] }))).not.toBeNull();
    expect(customCalendarProblem(cal({ seasons: [{ name: "Wet", startsOn: { month: 1, day: blank } }] }))).toBe(
      "The start of Wet is not a day in this calendar.",
    );
  });

  it("refuses a season starting past its month's end", () => {
    expect(customCalendarProblem(cal({ seasons: [{ name: "Wet", startsOn: { month: 1, day: 31 } }] }))).not.toBeNull();
  });
});
