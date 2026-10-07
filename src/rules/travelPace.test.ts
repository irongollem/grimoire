import { describe, expect, it } from "vitest";
import {
  formatTravelTime,
  fromMiles,
  getTravelPace,
  toMiles,
  TRAVEL_HOURS_PER_DAY,
  TRAVEL_PACES,
  travelTime,
} from "@/rules/travelPace";

describe("travel pace table", () => {
  it("states each pace's effect as its own edition words it", () => {
    // 2014: only Fast and Slow carry an effect. 2024 rewrote all three as
    // advantage / disadvantage on checks (SRD 5.2 "Travel Pace").
    expect(getTravelPace("normal").effect).toEqual({ "2014": null, "2024": "Disadvantage on Dexterity (Stealth) checks." });
    expect(getTravelPace("fast").effect["2014"]).toContain("passive Wisdom (Perception)");
    expect(getTravelPace("fast").effect["2024"]).toContain("Disadvantage on Wisdom (Perception or Survival)");
    expect(getTravelPace("slow").effect["2024"]).toContain("Advantage");
  });

  it("lists slowest first", () => {
    expect(TRAVEL_PACES.map((p) => p.id)).toEqual(["slow", "normal", "fast"]);
    expect(TRAVEL_HOURS_PER_DAY).toBe(8);
  });

  it("matches the printed values", () => {
    expect(getTravelPace("fast")).toMatchObject({ milesPerHour: 4, milesPerDay: 30 });
    expect(getTravelPace("normal")).toMatchObject({ milesPerHour: 3, milesPerDay: 24 });
    expect(getTravelPace("slow")).toMatchObject({ milesPerHour: 2, milesPerDay: 18 });
  });
});

describe("unit conversion", () => {
  it("round-trips miles and kilometres", () => {
    expect(toMiles(1.609344, "km")).toBeCloseTo(1, 9);
    expect(fromMiles(10, "km")).toBeCloseTo(16.09344, 9);
    expect(toMiles(5, "mi")).toBe(5);
  });
});

describe("travelTime", () => {
  it("24 miles at a normal pace is exactly one day", () => {
    expect(travelTime(24, "mi", "normal")).toMatchObject({ days: 1, hours: 0, calendarDays: 1 });
  });

  it("splits into days and hours", () => {
    // 84 mi at 24 mi/day = 3.5 days = 3 days, 4 hours.
    expect(travelTime(84, "mi", "normal")).toMatchObject({ days: 3, hours: 4, calendarDays: 4 });
  });

  it("rounds a partial hour up", () => {
    // 25 mi at 24 mi/day = 8.33 h: 1 day, 1 hour.
    expect(travelTime(25, "mi", "normal")).toMatchObject({ days: 1, hours: 1, calendarDays: 2 });
  });

  it("a short trip is hours, within one calendar day", () => {
    expect(travelTime(6, "mi", "normal")).toMatchObject({ days: 0, hours: 2, calendarDays: 1 });
  });

  it("kilometres are converted before the pace applies", () => {
    const km = travelTime(48.28032, "km", "normal"); // 30 mi = 1.25 days
    expect(km).toMatchObject({ days: 1, hours: 2 });
  });

  it("the printed per-day figure is one day at every pace", () => {
    expect(travelTime(30, "mi", "fast")).toMatchObject({ days: 1, hours: 0 });
    expect(travelTime(18, "mi", "slow")).toMatchObject({ days: 1, hours: 0 });
  });

  it("a faster pace takes fewer hours", () => {
    expect(travelTime(24, "mi", "fast").totalHours).toBe(6.4);
    expect(travelTime(24, "mi", "slow").totalHours).toBeCloseTo(10.667, 3);
  });

  it("zero distance is no time at all", () => {
    expect(travelTime(0, "mi", "normal")).toMatchObject({ days: 0, hours: 0, calendarDays: 0 });
  });
});

describe("formatTravelTime", () => {
  it("reads naturally", () => {
    expect(formatTravelTime({ days: 2, hours: 3 })).toBe("2 days, 3 hours");
    expect(formatTravelTime({ days: 1, hours: 1 })).toBe("1 day, 1 hour");
    expect(formatTravelTime({ days: 0, hours: 5 })).toBe("5 hours");
    expect(formatTravelTime({ days: 3, hours: 0 })).toBe("3 days");
    expect(formatTravelTime({ days: 0, hours: 0 })).toBe("0 hours");
  });
});
