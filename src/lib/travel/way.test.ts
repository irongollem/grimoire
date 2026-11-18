import { describe, expect, it } from "vitest";
import { placesPassed, shortestWay } from "./way";
import type { Road } from "./roads";

const road = (id: string, a: string, b: string, distance: number, over: Partial<Road> = {}): Road => ({ id, from_location_id: a, to_location_id: b, distance, unit: "mi", name: "", going: "road", ...over });

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
