import { describe, expect, it } from "vitest";
import type { MapPin } from "@/types/location.types";
import { mapRoadLines } from "./mapRoads";
import type { Road } from "./roads";

const pin = (id: string, x: number, y: number): MapPin => ({
  child_location_id: id,
  child_name: id,
  child_type: "city",
  child_image_url: null,
  x,
  y,
  visible_to_players: true,
});
const road = (id: string, from: string, to: string, over: Partial<Road> = {}): Road => ({
  id,
  from_location_id: from,
  to_location_id: to,
  distance: 40,
  unit: "mi",
  name: "the coast road",
  going: "road",
  roll_table_id: null,
  terrain: "road",
  ...over,
});
const parents: Record<string, string> = { hamlet: "town", cellar: "hamlet" };
const parentOf = (id: string) => parents[id] ?? null;

describe("mapRoadLines", () => {
  it("draws a road between its two own pins, labelled as the entry reads it", () => {
    const lines = mapRoadLines({ pins: [pin("a", 0.1, 0.2), pin("b", 0.7, 0.8)], roads: [road("r", "a", "b")], parentOf });
    expect(lines).toEqual([
      { roadId: "r", from: { x: 0.1, y: 0.2 }, to: { x: 0.7, y: 0.8 }, label: "40 mi by the coast road", labelAt: 0.5 },
    ]);
  });

  it("ends a road at the pin of the nearest place its end lies inside", () => {
    const lines = mapRoadLines({ pins: [pin("a", 0.1, 0.1), pin("town", 0.5, 0.5)], roads: [road("r", "a", "cellar")], parentOf });
    expect(lines[0]?.to).toEqual({ x: 0.5, y: 0.5 });
  });

  it("prefers the nearer pin over a farther ancestor's", () => {
    const lines = mapRoadLines({
      pins: [pin("a", 0.1, 0.1), pin("town", 0.5, 0.5), pin("hamlet", 0.6, 0.6)],
      roads: [road("r", "a", "cellar")],
      parentOf,
    });
    expect(lines[0]?.to).toEqual({ x: 0.6, y: 0.6 });
  });

  it("skips a road when an end has no pin on this map", () => {
    expect(mapRoadLines({ pins: [pin("a", 0.1, 0.1)], roads: [road("r", "a", "elsewhere")], parentOf })).toEqual([]);
  });

  it("skips a road whose two ends are under one pin", () => {
    expect(mapRoadLines({ pins: [pin("town", 0.5, 0.5)], roads: [road("r", "hamlet", "cellar")], parentOf })).toEqual([]);
  });

  it("terminates on a parent cycle", () => {
    const cyclic = (id: string) => (id === "x" ? "y" : id === "y" ? "x" : null);
    expect(mapRoadLines({ pins: [pin("a", 0.1, 0.1)], roads: [road("r", "a", "x")], parentOf: cyclic })).toEqual([]);
  });

  it("keeps two roads between one pair and staggers their labels", () => {
    const lines = mapRoadLines({
      pins: [pin("a", 0, 0), pin("b", 1, 1)],
      roads: [road("r1", "a", "b"), road("r2", "b", "a", { name: "", going: "sea" })],
      parentOf,
    });
    expect(lines.map((l) => l.roadId)).toEqual(["r1", "r2"]);
    expect(lines[0]?.labelAt).not.toBe(lines[1]?.labelAt);
    expect(lines[1]?.label).toBe("40 mi by sea");
  });
});
