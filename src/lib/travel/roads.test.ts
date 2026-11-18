import { describe, expect, it } from "vitest";
import { distanceText, otherEnd, roadsFrom, roadText, toMiles, type Road } from "./roads";

const road = (id: string, a: string, b: string, distance: number, over: Partial<Road> = {}): Road => ({ id, from_location_id: a, to_location_id: b, distance, unit: "mi", name: "", going: "road", ...over });

describe("roadsFrom", () => {
  // Bug caught: a road entered from the other town's end missing from this town's entry (a road reads from both
  // ends), or a road between two other places listed here.
  it("lists the roads that touch a place, whichever end they were entered from, nearest first", () => {
    const roads = [road("r1", "harbour", "farholt", 60), road("r2", "brightwater", "harbour", 40), road("r3", "brightwater", "farholt", 20)];
    expect(roadsFrom("harbour", roads).map((r) => [r.road.id, r.otherId])).toEqual([["r2", "brightwater"], ["r1", "farholt"]]);
    expect(otherEnd(roads[2], "harbour")).toBeNull();
  });

  // Bug caught: 60 km sorted after 40 miles, though it is the shorter road.
  it("compares a road in kilometres by its real length", () => {
    const roads = [road("r1", "a", "b", 40), road("r2", "a", "c", 60, { unit: "km" })];
    expect(roadsFrom("a", roads).map((r) => r.road.id)).toEqual(["r2", "r1"]);
    // 1 mile is 1.609344 km (the international mile).
    expect(toMiles(1.609344, "km")).toBeCloseTo(1, 9);
  });
});

describe("roadText", () => {
  // Bug caught: "1 miles", or a nameless road reading "40 miles by ".
  it("reads as a book writes it", () => {
    expect(roadText({ distance: 40, unit: "mi", name: "the coast road", going: "road" })).toBe("40 miles by the coast road");
    expect(roadText({ distance: 12, unit: "mi", name: " ", going: "track" })).toBe("12 miles by track");
    expect(distanceText(1, "mi")).toBe("1 mile");
    expect(distanceText(12.5, "km")).toBe("12.5 km");
  });
});
