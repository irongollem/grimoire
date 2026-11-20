import { describe, expect, it } from "vitest";
import { placesPassed, shortestWay, stopsOf, stopsOfTimed } from "./way";
import type { Road } from "./roads";

const road = (id: string, a: string, b: string, distance: number, over: Partial<Road> = {}): Road => ({ id, from_location_id: a, to_location_id: b, distance, unit: "mi", name: "", going: "road", difficult: false, roll_table_id: null, ...over });

// Harbour to Farholt: 60 miles direct by the pass, or 40 + 15 by way of Brightwater.
const coast = [road("pass", "harbour", "farholt", 60), road("coast", "harbour", "brightwater", 40), road("ford", "farholt", "brightwater", 15)];

describe("shortestWay", () => {
  // Bug caught: the direct road always taken, though the way round is shorter.
  it("goes by whichever places make the way shortest, and names them", () => {
    const way = shortestWay("harbour", "farholt", coast)!;
    expect(way.miles).toBe(55);
    expect(way.legs.map((leg) => `${leg.from}>${leg.to}`)).toEqual(["harbour>brightwater", "brightwater>farholt"]);
    expect(placesPassed(way)).toEqual(["brightwater"]);
  });

  // Bug caught: a road only usable from the end it was entered at.
  it("travels a road from either end", () => {
    expect(shortestWay("farholt", "harbour", coast)?.miles).toBe(55);
    expect(shortestWay("brightwater", "harbour", coast)?.legs.map((leg) => leg.roadId)).toEqual(["coast"]);
  });

  // Bug caught: two roads between the same towns treated as one, with the longer one winning by being entered last.
  it("takes the shorter of two roads between the same places", () => {
    const two = [road("long", "a", "b", 30), road("short", "a", "b", 20), road("longer", "a", "b", 40)];
    expect(shortestWay("a", "b", two)).toMatchObject({ miles: 20, legs: [{ roadId: "short" }] });
  });

  // Bug caught: kilometres added to miles as if they were the same.
  it("adds roads in different units by their real length", () => {
    const mixed = [road("r1", "a", "b", 10), road("r2", "b", "c", 16.09344, { unit: "km" })];
    expect(shortestWay("a", "c", mixed)?.miles).toBeCloseTo(20, 6);
  });

  // Bug caught: "no road" reported as a journey of no miles.
  it("says there is no way when no chain of roads joins two places", () => {
    expect(shortestWay("harbour", "island", coast)).toBeNull();
    expect(shortestWay("harbour", "island", [...coast, road("lonely", "island", "rock", 5)])).toBeNull();
    expect(shortestWay("harbour", "harbour", coast)).toEqual({ miles: 0, legs: [] });
  });

  // Bug caught: the answer changing with the order the roads were entered in.
  it("prefers the way with fewer legs between two of the same length", () => {
    const tie = [road("a-m", "a", "m", 10), road("m-b", "m", "b", 10), road("direct", "a", "b", 20)];
    expect(shortestWay("a", "b", tie)?.legs.map((leg) => leg.roadId)).toEqual(["direct"]);
    expect(shortestWay("a", "b", [...tie].reverse())?.legs.map((leg) => leg.roadId)).toEqual(["direct"]);
  });
});

describe("stopsOf", () => {
  const way = { miles: 60, legs: [
    { roadId: "r1", from: "a", to: "b", miles: 24, name: "", going: "road" as const, difficult: false },
    { roadId: "r2", from: "b", to: "c", miles: 36, name: "", going: "road" as const, difficult: false },
  ] };

  // PHB 2014 "Travel Pace": 24 miles a day at a normal pace. 60 miles: nights after 24 and 48; the town at 24.
  // Bug caught: the party camping a stone's throw short of the town it reached that evening.
  it("orders the places passed and the nights, a place reached at day's end before that night", () => {
    expect(stopsOf(way, 24)).toEqual([{ kind: "place", placeId: "b" }, { kind: "night", night: 1 }, { kind: "night", night: 2 }]);
  });

  // Bug caught: a night counted after the last day's march, on arrival.
  it("has no night for the day the journey ends on", () => {
    expect(stopsOf({ miles: 48, legs: [{ roadId: "r", from: "a", to: "b", miles: 48, name: "", going: "road" as const, difficult: false }] }, 24)).toEqual([{ kind: "night", night: 1 }]);
    expect(stopsOf({ miles: 20, legs: [{ roadId: "r", from: "a", to: "b", miles: 20, name: "", going: "road" as const, difficult: false }] }, 24)).toEqual([]);
  });
});

describe("stopsOfTimed", () => {
  const leg = (id: string, from: string, to: string, miles: number, difficult = false) => ({ roadId: id, from, to, miles, name: "", going: "road" as const, difficult });

  // 24 difficult miles at a normal pace is two travel days: a night after the first 8 hours at 12 miles in, not at 24.
  // Bug caught: nights still placed by raw miles, so a marsh crossing showed one night too few.
  it("places nights by travel time, so difficult miles count double", () => {
    const way = { miles: 24, legs: [leg("r", "a", "b", 24, true)] };
    expect(stopsOfTimed(way, (l) => (l.miles / 24) * 8 * (l.difficult ? 2 : 1))).toEqual([{ kind: "night", night: 1 }]);
    expect(stopsOf(way, 24)).toEqual([]);
  });

  // Bug caught: a town reached exactly at the day's end ordered after that night, or a night after the last stretch.
  it("keeps a place reached at day's end before that night and none on arrival", () => {
    const way = { miles: 48, legs: [leg("r1", "a", "b", 24), leg("r2", "b", "c", 24)] };
    expect(stopsOfTimed(way, (l) => l.miles / 3)).toEqual([{ kind: "place", placeId: "b" }, { kind: "night", night: 1 }]);
  });
});
