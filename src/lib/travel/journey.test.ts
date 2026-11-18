import { describe, expect, it } from "vitest";
import { journeyByRoad, passingText, roadPlaceOf, roadTableIds, travellersOf } from "./journey";
import type { Road } from "./roads";

const road = (id: string, a: string, b: string, distance: number, over: Partial<Road> = {}): Road => ({ id, from_location_id: a, to_location_id: b, distance, unit: "mi", name: "", going: "road", roll_table_id: null, ...over });
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

describe("roadTableIds", () => {
  // Bug caught: a table offered for a road the journey does not take, or the same table offered once per stretch.
  it("is the tables of the roads the journey takes, in order, each once", () => {
    const roads = [
      road("r1", "a", "b", 10, { roll_table_id: "coast" }),
      road("r2", "b", "c", 10),
      road("r3", "c", "d", 10, { roll_table_id: "coast" }),
      road("r4", "d", "e", 10, { roll_table_id: "hills" }),
      road("r9", "x", "y", 10, { roll_table_id: "elsewhere" }),
    ];
    expect(roadTableIds({ roadIds: ["r1", "r2", "r3", "r4"] }, roads)).toEqual(["coast", "hills"]);
    expect(roadTableIds({ roadIds: [] }, roads)).toEqual([]);
  });
});

describe("travellersOf", () => {
  const withVillage: Record<string, string | null> = { ...parents, village: "harbour" };
  const parentIn = (id: string): string | null => withVillage[id] ?? null;
  const village = [...coast, road("lane", "village", "farholt", 5)];

  // Bug caught: a member with no place of their own (following the party) left out, so a party of followers set
  // out with nobody and the calendar event and the food line counted no travellers.
  it("counts a member who follows the party as standing where the party is", () => {
    const members = [{ id: "a", current_location_id: null }, { id: "b", current_location_id: "farholt" }];
    expect(travellersOf({ origin: "harbour", members, partyAt: "harbour", parentOf, roads: coast })).toEqual(["a"]);
  });

  // Bug caught: a party standing in a room of the town the road leaves told nobody sets out, because the room is
  // not the road's end.
  it("counts someone inside the place the journey starts from", () => {
    const members = [{ id: "a", current_location_id: null }, { id: "b", current_location_id: "inn" }];
    expect(travellersOf({ origin: "harbour", members, partyAt: "common-room", parentOf, roads: coast })).toEqual(["a", "b"]);
  });

  // Bug caught: a member in a village with roads of its own counted as setting out from the town around it.
  it("does not count someone at a place inside the start that has roads of its own", () => {
    const members = [{ id: "a", current_location_id: "village" }, { id: "b", current_location_id: "inn" }];
    expect(travellersOf({ origin: "harbour", members, partyAt: "harbour", parentOf: parentIn, roads: village })).toEqual(["b"]);
    // Across a map no roads stop the walk up: the village lies under the town's pin.
    expect(travellersOf({ origin: "harbour", members, partyAt: "harbour", parentOf: parentIn, roads: [] })).toEqual(["a", "b"]);
  });

  it("counts nobody when nobody knows where the party is", () => {
    expect(travellersOf({ origin: "harbour", members: [{ id: "a", current_location_id: null }], partyAt: null, parentOf, roads: coast })).toEqual([]);
  });
});
