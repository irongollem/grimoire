import { describe, expect, it } from "vitest";
import { otherEnd, roadsFrom, roadText, type Road } from "./roads";

const road = (id: string, a: string, b: string, distance: number, over: Partial<Road> = {}): Road => ({ id, from_location_id: a, to_location_id: b, distance, unit: "mi", name: "", going: "road", terrain: "road", roll_table_id: null, ...over });

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
  });
});

describe("roadText", () => {
  // Bug caught: a nameless road reading "40 mi by ", or a road's name left out of its line.
  it("reads as a book writes it, in the app's one way of writing a distance", () => {
    expect(roadText({ distance: 40, unit: "mi", name: "the coast road", going: "road", terrain: "road" })).toBe("40 mi by the coast road");
    expect(roadText({ distance: 12, unit: "km", name: " ", going: "track", terrain: "road" })).toBe("12 km by track");
  });

  // Bug caught: a difficult road listed like any other, so the DM adding it sees no sign it was kept.
  it("says when the going is difficult", () => {
    expect(roadText({ distance: 12, unit: "mi", name: "the marsh path", going: "track", terrain: "difficult" })).toBe("12 mi by the marsh path, difficult going");
    expect(roadText({ distance: 30, unit: "mi", name: "", going: "track", terrain: "snow" })).toBe("30 mi by track, snow");
  });

  // Bug caught: the campaign's own word for a ground ignored, so a DM who renamed snow "deep drift" read "snow".
  it("names the ground by the campaign's word for it, and a ground of its own that no preset knows", () => {
    const names: Record<string, string> = { snow: "Deep drift", bog: "Bog" };
    const nameOf = (key: string): string | null => names[key] ?? null;
    expect(roadText({ distance: 30, unit: "mi", name: "", going: "track", terrain: "snow" }, nameOf)).toBe("30 mi by track, deep drift");
    expect(roadText({ distance: 8, unit: "mi", name: "", going: "track", terrain: "bog" }, nameOf)).toBe("8 mi by track, bog");
    expect(roadText({ distance: 8, unit: "mi", name: "", going: "road", terrain: "road" }, nameOf)).toBe("8 mi by road");
  });
});
