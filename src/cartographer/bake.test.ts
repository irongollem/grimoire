import { describe, it, expect } from "vitest";
import { computeBakedDimensions } from "./bake";
import type { DungeonMap } from "@/types/dungeonMap.types";

function emptyMap(): DungeonMap {
  return {
    id: "test",
    user_id: "u",
    name: "Test",
    description: null,
    layers: { floor: {}, solidBlock: {}, object: {}, annotation: {} },
    metadata: {},
    default_pack_id: null,
    tags: [],
    notes: null,
    created_at: "",
    updated_at: "",
  };
}

describe("computeBakedDimensions", () => {
  it("returns padding-only dimensions when the map is empty", () => {
    // No painted cells: bbox collapses to (0,0)→(0,0) = 1×1 cell, plus 3 cells
    // of padding on each side = 7×7.
    expect(computeBakedDimensions(emptyMap())).toEqual({ cols: 7, rows: 7 });
  });

  it("expands the bbox to include every painted layer", () => {
    const map = emptyMap();
    map.layers.floor["5,3"] = { floor: { pack_id: "p", pack_version: 1, variant: 0 } };
    map.layers.solidBlock["7,4"] = { pack_id: "p", pack_version: 1, variant: 0 };
    map.layers.object["2,6"] = { pack_id: "p", pack_version: 1, variant: 0, category: "objectChest" };
    // bbox (2,3)→(7,6) = 6 cols × 4 rows, plus 6 cells of padding total.
    expect(computeBakedDimensions(map)).toEqual({ cols: 12, rows: 10 });
  });

  it("handles negative coordinates (infinite-canvas origin)", () => {
    const map = emptyMap();
    map.layers.floor["-2,-3"] = { floor: { pack_id: "p", pack_version: 1, variant: 0 } };
    map.layers.floor["1,2"] = { floor: { pack_id: "p", pack_version: 1, variant: 0 } };
    // bbox (-2,-3)→(1,2) = 4 cols × 6 rows + 6 cells of padding.
    expect(computeBakedDimensions(map)).toEqual({ cols: 10, rows: 12 });
  });

  it("respects a custom paddingCells argument", () => {
    const map = emptyMap();
    map.layers.floor["0,0"] = { floor: { pack_id: "p", pack_version: 1, variant: 0 } };
    expect(computeBakedDimensions(map, 0)).toEqual({ cols: 1, rows: 1 });
    expect(computeBakedDimensions(map, 5)).toEqual({ cols: 11, rows: 11 });
  });
});
