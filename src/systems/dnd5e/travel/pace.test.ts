import { describe, expect, it } from "vitest";
import { calendarDays, travelTime, travelTimeText } from "./pace";

describe("travelTime", () => {
  // PHB 2014 and 2024 "Travel Pace": slow 18, normal 24, fast 30 miles in a day of 8 hours.
  it.each([
    ["slow", 18],
    ["normal", 24],
    ["fast", 30],
  ] as const)("covers a day's distance in exactly a day at a %s pace", (pace, miles) => {
    expect(travelTime(miles, pace)).toEqual({ days: 1, hours: 0 });
  });

  // 55 miles at a normal pace: two days (48 miles) and 7 miles more, at 3 miles an hour: 2 hours 20, to the half hour 2½.
  it("counts the last, unfinished day in hours", () => {
    expect(travelTime(55, "normal")).toEqual({ days: 2, hours: 2.5 });
  });

  // PHB "Difficult Terrain": half speed, so twice the time. 24 miles of difficult going at a normal pace is 2 days.
  it("takes twice as long over difficult going", () => {
    expect(travelTime(24, "normal", { difficult: true })).toEqual({ days: 2, hours: 0 });
  });

  // Bug caught: a short walk rounded down to no time, or the hours rounding up to a ninth hour of an 8-hour day.
  it("never rounds a real distance to nothing, nor a day past its end", () => {
    expect(travelTime(0.2, "normal")).toEqual({ days: 0, hours: 0.5 });
    expect(travelTime(23.9, "normal")).toEqual({ days: 1, hours: 0 });
    expect(travelTime(0, "fast")).toEqual({ days: 0, hours: 0 });
    expect(travelTime(-5, "fast")).toEqual({ days: 0, hours: 0 });
  });
});

describe("calendarDays", () => {
  // Bug caught: a journey of two days and a morning moving the calendar on by two days only.
  it("counts every started day", () => {
    expect(calendarDays({ days: 2, hours: 2.5 })).toBe(3);
    expect(calendarDays({ days: 2, hours: 0 })).toBe(2);
    expect(calendarDays({ days: 0, hours: 0 })).toBe(0);
  });
});

describe("travelTimeText", () => {
  it("reads as a person would say it", () => {
    expect(travelTimeText({ days: 2, hours: 2.5 })).toBe("2 days and 2½ hours");
    expect(travelTimeText({ days: 1, hours: 0 })).toBe("1 day");
    expect(travelTimeText({ days: 0, hours: 1 })).toBe("1 hour");
    expect(travelTimeText({ days: 0, hours: 0.5 })).toBe("half an hour");
    expect(travelTimeText({ days: 0, hours: 0 })).toBe("no time at all");
  });
});
