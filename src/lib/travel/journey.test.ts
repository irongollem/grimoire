import { describe, expect, it } from "vitest";
import { journeyByRoad, passingText, roadPlaceOf } from "./journey";
import type { Road } from "./roads";

const road = (id: string, a: string, b: string, distance: number, over: Partial<Road> = {}): Road => ({ id, from_location_id: a, to_location_id: b, distance, unit: "mi", name: "", going: "road", ...over });
// The inn's common room is inside the inn, which is inside Harbour.
const parents: Record<string, string | null> = { "common-room": "inn", inn: "harbour", harbour: null, brightwater: null, farholt: null, island: null };
const parentOf = (id: string): string | null => parents[id] ?? null;
const nameOf = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1);
const coast = [road("coast", "harbour", "brightwater", 40), road("ford", "farholt", "brightwater", 15)];

describe("roadPlaceOf", () => {
  // Bug caught: a party standing in a room of an inn told no road leads anywhere, because the room has no road.
  it("puts someone inside a place on that place's roads", () => {
    expect(roadPlaceOf("common-room", parentOf, coast)).toBe("harbour");
    expect(roadPlaceOf("harbour", parentOf, coast)).toBe("harbour");
    expect(roadPlaceOf("island", parentOf, coast)).toBeNull();
  });

  // Bug caught: a place whose parent chain loops (bad data) hanging the page.
  it("stops on a parent chain that loops", () => {
    expect(roadPlaceOf("a", (id) => (id === "a" ? "b" : "a"), coast)).toBeNull();
  });
});

describe("journeyByRoad", () => {
  // 40 + 15 = 55 miles. PHB "Travel Pace": 24 miles a day at a normal pace, so 2 days (48) and 7 miles more,
  // which at 3 miles an hour is 2 hours 20: 3 hours once the part hour is rounded up, as the app writes time.
  it("is the shortest way by road, with the places it passes and the time at the pace", () => {
    const journey = journeyByRoad({ fromId: "common-room", toId: "farholt", roads: coast, parentOf, nameOf, paceId: "normal" })!;
    expect(journey.summary).toMatchObject({ distance: 55, unit: "mi", from: { id: "harbour", name: "Harbour" }, to: { id: "farholt", name: "Farholt" } });
    expect(journey.summary.time).toMatchObject({ days: 2, hours: 3, calendarDays: 3 });
    expect(journey.passing).toEqual(["Brightwater"]);
  });

  // Bug caught: "no road" shown as a journey of no distance, or a journey offered to the place the party is in.
  it("is nothing when no chain of roads joins the two, or they are the same place for the road", () => {
    expect(journeyByRoad({ fromId: "harbour", toId: "island", roads: coast, parentOf, nameOf, paceId: "normal" })).toBeNull();
    expect(journeyByRoad({ fromId: "common-room", toId: "harbour", roads: coast, parentOf, nameOf, paceId: "normal" })).toBeNull();
  });

  // Bug caught: a campaign that measures in kilometres shown its journey in miles.
  it("is written in kilometres when every road of the way is", () => {
    const metric = [road("a", "harbour", "brightwater", 30, { unit: "km" }), road("b", "brightwater", "farholt", 20, { unit: "km" })];
    expect(journeyByRoad({ fromId: "harbour", toId: "farholt", roads: metric, parentOf, nameOf, paceId: "fast" })?.summary).toMatchObject({ unit: "km" });
    expect(journeyByRoad({ fromId: "harbour", toId: "farholt", roads: metric, parentOf, nameOf, paceId: "fast" })?.summary.distance).toBeCloseTo(50, 6);
    const mixed = [metric[0], road("b", "brightwater", "farholt", 20)];
    expect(journeyByRoad({ fromId: "harbour", toId: "farholt", roads: mixed, parentOf, nameOf, paceId: "fast" })?.summary.unit).toBe("mi");
  });
});

describe("passingText", () => {
  it("names the places a road passes", () => {
    expect(passingText([])).toBe("");
    expect(passingText(["Brightwater"])).toBe("by way of Brightwater");
    expect(passingText(["Brightwater", "the Ford", "Millbrook"])).toBe("by way of Brightwater, the Ford and Millbrook");
  });
});
