import { describe, it, expect } from "vitest";
import { createDefaultCustomCalendarDef, type SettingCalendarDef } from "@/settings/types";
import { customCalendarProblem, withoutMonth } from "./customCalendar";

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

describe("customCalendarProblem: what a DM must fix", () => {
  const month = (name: string, days: number) => ({ name, days });
  const base = createDefaultCustomCalendarDef();
  const moon = { name: "Pale", cycleDays: 28, fullOn: { year: 1, month: 1, day: 1 } };

  it.each([
    ["a blank calendar name", { name: "  " }, "Calendar name is required."],
    ["a blank epoch", { epochName: " " }, "Epoch is required (e.g. \"AY\")."],
    ["no months", { months: [] }, "At least one month is required."],
    ["a month with no name", { months: [month(" ", 30)] }, "Every month needs a name."],
    ["a month of no days", { months: [month("A", 0)] }, "Every month needs at least 1 day."],
    ["a month of half a day", { months: [month("A", 1.5)] }, "Every month needs at least 1 day."],
    ["a moon with no name", { moons: [{ ...moon, name: " " }] }, "Every moon needs a name."],
    ["a moon with a cycle of 0 days", { moons: [{ ...moon, cycleDays: 0 }] }, "Every moon needs a cycle longer than 0 days."],
    ["a season with no name", { seasons: [{ name: "", startsOn: { month: 1, day: 1 } }] }, "Every season needs a name."],
    ["a season starting on day 0", { seasons: [{ name: "Wet", startsOn: { month: 1, day: 0 } }] }, "The start of Wet is not a day in this calendar."],
  ] satisfies [string, Partial<SettingCalendarDef>, string][])("refuses %s", (_label, patch, message) => {
    expect(customCalendarProblem({ ...base, ...patch })).toBe(message);
  });

  it("accepts a one-day month, a moon cycle that is not a whole number, and a season on a month's last day", () => {
    const def = {
      ...base,
      months: [month("A", 1), month("B", 30)],
      moons: [{ ...moon, cycleDays: 29.53 }],
      seasons: [{ name: "Late", startsOn: { month: 2, day: 30 } }],
    };
    expect(customCalendarProblem(def)).toBeNull();
  });
});

describe("customCalendarProblem: season starts", () => {
  it("refuses two seasons on the same day, which would leave one unreachable", () => {
    const seasons = [
      { name: "Wet", startsOn: { month: 1, day: 1 } },
      { name: "Dry", startsOn: { month: 1, day: 1 } },
    ];
    expect(customCalendarProblem(cal({ seasons }))).toBe("Dry starts on the same day as another season.");
  });
});

describe("withoutMonth", () => {
  const four = (): SettingCalendarDef =>
    cal({
      months: [
        { name: "A", days: 30 },
        { name: "B", days: 20 },
        { name: "C", days: 30 },
        { name: "D", days: 30 },
      ],
      intercalaryDays: [
        { name: "AfterB", afterMonth: 2, description: "" },
        { name: "AfterC", afterMonth: 3, description: "" },
      ],
      moons: [
        { name: "OnC", cycleDays: 28, fullOn: { year: 1, month: 3, day: 25 } },
        { name: "OnB", cycleDays: 28, fullOn: { year: 1, month: 2, day: 20 } },
        { name: "OnFest", cycleDays: 28, fullOn: { year: 1, festival: "AfterC" } },
      ],
      seasons: [
        { name: "InD", startsOn: { month: 4, day: 30 } },
        { name: "InB", startsOn: { month: 2, day: 10 } },
      ],
    });

  it("renumbers references after the removed month, so they keep naming the same month", () => {
    const next = withoutMonth(four(), 1); // remove B
    expect(next.months.map((m) => m.name)).toEqual(["A", "C", "D"]);
    expect(next.moons![0]!.fullOn).toEqual({ year: 1, month: 2, day: 25 }); // still C
    expect(next.seasons![0]!.startsOn).toEqual({ month: 3, day: 30 }); // still D
    expect(next.intercalaryDays[1]!.afterMonth).toBe(2); // still after C
  });

  it("moves a reference to the removed month onto the month before it, day clamped", () => {
    const next = withoutMonth(four(), 2); // remove C (30 days); B has 20
    expect(next.moons![0]!.fullOn).toEqual({ year: 1, month: 2, day: 20 });
    const first = withoutMonth(four(), 0); // remove A: its references go to the new first month
    expect(first.months[0]!.name).toBe("B");
  });

  it("returns the calendar unchanged for a month index it does not have", () => {
    const def = four();
    expect(withoutMonth(def, 4)).toBe(def);
    expect(withoutMonth(def, -1)).toBe(def);
  });

  it("leaves festival anchors alone and is a sound calendar afterwards", () => {
    const next = withoutMonth(four(), 1);
    expect(next.moons![2]!.fullOn).toEqual({ year: 1, festival: "AfterC" });
    expect(customCalendarProblem(next)).toBeNull();
  });
});
