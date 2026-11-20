import { describe, expect, it } from "vitest";
import {
  formatTravelTime,
  fromMiles,
  getTravelPace,
  journeyTime,
  legHours,
  ON_FOOT,
  toMiles,
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

  // PHB 2014 "Travel Pace": fast 4 mph / 30 mi, normal 3 / 24, slow 2 / 18.
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

describe("difficult going and vessels", () => {
  const road = { going: "road" as const, difficult: false };

  // PHB "Travel Pace": 24 miles a day at a normal pace; difficult terrain halves the distance a day covers.
  // Bug caught: difficult going ignored, or applied twice, or applied as +50% instead of halving.
  it("takes a day for 24 miles and two for 24 difficult miles at a normal pace", () => {
    expect(journeyTime([{ miles: 24, ...road }], "normal").calendarDays).toBe(1);
    expect(journeyTime([{ miles: 24, ...road, difficult: true }], "normal")).toMatchObject({ days: 2, hours: 0, calendarDays: 2 });
  });

  // Bug caught: the difficult stretch's doubling spread over the whole journey, or lost in the sum.
  it("doubles only the difficult leg of a journey", () => {
    // 12 plain miles = 4 hours, 12 difficult miles = 8 hours: 12 travel hours, 1 day 4 hours.
    const time = journeyTime([{ miles: 12, ...road }, { miles: 12, ...road, difficult: true }], "normal");
    expect(time).toMatchObject({ totalHours: 12, days: 1, hours: 4 });
  });

  // PHB "Mounts and Vehicles": a galley goes 4 mph. 96 miles is 24 hours under way: a day when it sails through the
  // night; 32 miles is 8 hours, a travel day, when it does not.
  // Bug caught: a vessel's night sailing not tripling its day, or its speed read as miles a day.
  it("works a vessel by the hour, a travel day of sailing or a round-the-clock one", () => {
    const galley = { vessel: "galley" as const, throughTheNight: true };
    expect(journeyTime([{ miles: 96, going: "sea", difficult: false }], "normal", galley)).toMatchObject({ totalHours: 8, days: 1, hours: 0, calendarDays: 1 });
    expect(journeyTime([{ miles: 32, going: "sea", difficult: false }], "normal", { ...galley, throughTheNight: false })).toMatchObject({ totalHours: 8, days: 1, calendarDays: 1 });
    expect(journeyTime([{ miles: 96, going: "sea", difficult: false }], "normal", { ...galley, throughTheNight: false }).calendarDays).toBe(3);
  });

  // Bug caught: a vessel carrying the party over land legs, or a water leg with no vessel chosen being sailed.
  it("sails only the water legs, and walks them at the pace when no vessel is chosen", () => {
    const galley = { vessel: "galley" as const, throughTheNight: false };
    expect(legHours({ miles: 24, going: "road", difficult: false }, "normal", galley)).toBe(8);
    expect(legHours({ miles: 24, going: "river", difficult: false }, "normal", ON_FOOT)).toBe(8);
    expect(legHours({ miles: 24, going: "river", difficult: false }, "normal", galley)).toBe(6);
  });

  // Bug caught: difficult going slowing a ship, which the book never says.
  it("does not slow a vessel for difficult going", () => {
    const boat = { vessel: "rowboat" as const, throughTheNight: false };
    expect(legHours({ miles: 12, going: "river", difficult: true }, "normal", boat)).toBe(legHours({ miles: 12, going: "river", difficult: false }, "normal", boat));
  });
});
