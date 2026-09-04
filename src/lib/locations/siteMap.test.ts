import { describe, it, expect } from "vitest";
import {
  DEFAULT_GRID_BOUNDS,
  GRID_PADDING_CELLS,
  cellAtPoint,
  collectUsedPackRefs,
  fitTilePx,
  layersBoundingBox,
  regionsBoundingBox,
  resolveGridBounds,
  toggleCell,
  MIN_TILE_PX,
  MAX_TILE_PX,
} from "./siteMap";
import { emptyLayers } from "@/types/dungeonMap.types";
import type { CellKey, DungeonMapLayers, PackRef } from "@/types/dungeonMap.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

function packRef(packId: string, packVersion = 1): PackRef {
  return { pack_id: packId, pack_version: packVersion, variant: 0 };
}

function region(id: string, cells: CellKey[], roomId: string | null = null): LocationMapRegion {
  return {
    id,
    user_id: "u",
    site_location_id: "site",
    room_location_id: roomId,
    cells,
    label: null,
    sort_order: null,
    created_at: "",
    updated_at: "",
  };
}

describe("layersBoundingBox", () => {
  it("returns null for an empty map", () => {
    expect(layersBoundingBox(emptyLayers())).toBeNull();
  });

  it("spans every painted layer, not just floor", () => {
    const layers: DungeonMapLayers = emptyLayers();
    layers.floor["2,2"] = { floor: packRef("stone") };
    // A wall-only cell with no floor tile still has to count — the doc is
    // explicit that a cell may carry walls without a floor.
    layers.solidBlock["-1,5"] = packRef("stone");
    const box = layersBoundingBox(layers);
    expect(box).toEqual({ minX: -1, minY: 2, maxX: 2, maxY: 5 });
  });
});

describe("regionsBoundingBox", () => {
  it("returns null when nothing has been traced", () => {
    expect(regionsBoundingBox([])).toBeNull();
    expect(regionsBoundingBox([region("a", [])])).toBeNull();
  });

  it("spans cells across multiple regions", () => {
    const box = regionsBoundingBox([region("a", ["0,0", "3,1"]), region("b", ["-2,4"])]);
    expect(box).toEqual({ minX: -2, minY: 0, maxX: 3, maxY: 4 });
  });
});

describe("resolveGridBounds", () => {
  it("falls back to the default grid when there is no map and nothing traced", () => {
    expect(resolveGridBounds(null, [])).toEqual(DEFAULT_GRID_BOUNDS);
  });

  it("pads the union of the map's painted extent and any traced regions", () => {
    const layers = emptyLayers();
    layers.floor["0,0"] = { floor: packRef("stone") };
    layers.floor["4,3"] = { floor: packRef("stone") };
    const bounds = resolveGridBounds(layers, [region("a", ["-1,-1"])]);
    expect(bounds).toEqual({
      minX: -1 - GRID_PADDING_CELLS,
      minY: -1 - GRID_PADDING_CELLS,
      maxX: 4 + GRID_PADDING_CELLS,
      maxY: 3 + GRID_PADDING_CELLS,
    });
  });
});

describe("cellAtPoint", () => {
  it("maps a pixel offset to the cell under it, honouring the grid origin", () => {
    const origin = { minX: -2, minY: 5 };
    expect(cellAtPoint(0, 0, 32, origin)).toBe("-2,5");
    expect(cellAtPoint(31, 31, 32, origin)).toBe("-2,5");
    expect(cellAtPoint(32, 0, 32, origin)).toBe("-1,5");
    expect(cellAtPoint(65, 40, 32, origin)).toBe("0,6");
  });
});

describe("toggleCell", () => {
  it("adds a cell that isn't in the set", () => {
    expect(toggleCell(["0,0"], "1,1")).toEqual(["0,0", "1,1"]);
  });

  it("removes a cell that is already in the set", () => {
    expect(toggleCell(["0,0", "1,1"], "0,0")).toEqual(["1,1"]);
  });

  it("never duplicates — toggling twice is a no-op", () => {
    const once = toggleCell([], "0,0");
    const twice = toggleCell(once, "0,0");
    expect(twice).toEqual([]);
  });
});

describe("collectUsedPackRefs", () => {
  it("returns nothing for an empty map", () => {
    expect(collectUsedPackRefs(emptyLayers())).toEqual([]);
  });

  it("dedupes across floor, walls, solid blocks and objects", () => {
    const layers = emptyLayers();
    layers.floor["0,0"] = { floor: packRef("stone"), wallN: { ...packRef("stone"), type: "wall" } };
    layers.floor["1,0"] = { floor: packRef("stone") };
    layers.solidBlock["2,2"] = packRef("icy-cave", 2);
    layers.object["3,3"] = { ...packRef("stone"), category: "rubble" };
    const refs = collectUsedPackRefs(layers);
    expect(refs).toHaveLength(2);
    expect(refs).toContainEqual({ pack_id: "stone", pack_version: 1 });
    expect(refs).toContainEqual({ pack_id: "icy-cave", pack_version: 2 });
  });
});

describe("fitTilePx", () => {
  it("clamps to the minimum when the container is too small for the grid", () => {
    expect(fitTilePx(50, 20)).toBe(MIN_TILE_PX);
  });

  it("clamps to the maximum when the container is huge relative to the grid", () => {
    expect(fitTilePx(4000, 5)).toBe(MAX_TILE_PX);
  });

  it("fits the container width otherwise", () => {
    expect(fitTilePx(320, 16)).toBe(20);
  });

  it("falls back to the minimum for a degenerate grid", () => {
    expect(fitTilePx(320, 0)).toBe(MIN_TILE_PX);
    expect(fitTilePx(0, 10)).toBe(MIN_TILE_PX);
  });
});
