import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DungeonMap } from "@/types/dungeonMap.types";
import type { MapImageLayer } from "@/lib/locations/mapStack";

const fakeGeometry = { effWidth: 100, effHeight: 100, offsetX: 0, offsetY: 0, cellsPerImageWidth: 9, originXPct: 0, originYPct: 0 };

const mocks = vi.hoisted(() => ({
  bakeMapForAI: vi.fn(),
  bakeMap: vi.fn(),
}));

vi.mock("./bake", async () => {
  const actual = await vi.importActual<typeof import("./bake")>("./bake");
  return {
    ...actual,
    bakeMapForAI: mocks.bakeMapForAI,
    bakeMap: mocks.bakeMap,
  };
});

import { liveDrawingCalibration, styledPictureCalibration, bakeAiStyleInput } from "./aiStyleInput";

function emptyMap(): DungeonMap {
  return {
    id: "test",
    user_id: "u",
    campaign_id: null,
    name: "Test",
    description: null,
    layers: { floor: {}, solidBlock: {}, object: {}, annotation: {} },
    metadata: {},
    default_pack_id: null,
    tags: [],
    notes: null,
    created_at: "",
    rev: 1,
    updated_at: "",
  };
}

describe("liveDrawingCalibration", () => {
  it("mirrors computeBakedDimensions, as a GridCalibration with a zero-percent origin", () => {
    const map = emptyMap();
    map.layers.floor["5,3"] = { floor: { pack_id: "p", pack_version: 1, variant: 0 } };
    map.layers.floor["7,4"] = { floor: { pack_id: "p", pack_version: 1, variant: 0 } };
    // Painted bbox (5,3)->(7,4) = 3 cols x 2 rows, +3 cells padding per side
    // (the default) = 9 cols x 8 rows; origin at (5-3, 3-3) = (2, 0).
    expect(liveDrawingCalibration(map)).toEqual({
      cells_per_image_width: 9,
      origin_x_pct: 0,
      origin_y_pct: 0,
      origin_cell_x: 2,
      origin_cell_y: 0,
    });
  });

  it("respects a custom paddingCells argument, same as computeBakedDimensions", () => {
    const map = emptyMap();
    map.layers.floor["0,0"] = { floor: { pack_id: "p", pack_version: 1, variant: 0 } };
    expect(liveDrawingCalibration(map, 0)).toEqual({
      cells_per_image_width: 1,
      origin_x_pct: 0,
      origin_y_pct: 0,
      origin_cell_x: 0,
      origin_cell_y: 0,
    });
  });
});

describe("styledPictureCalibration", () => {
  it("takes cells/origin-pct from the padding geometry and cell coordinates from the map's own bake", () => {
    const map = emptyMap();
    map.layers.floor["5,3"] = { floor: { pack_id: "p", pack_version: 1, variant: 0 } };
    map.layers.floor["7,4"] = { floor: { pack_id: "p", pack_version: 1, variant: 0 } };
    const geometry = { effWidth: 2000, effHeight: 1000, offsetX: 0, offsetY: 500, cellsPerImageWidth: 9, originXPct: 0, originYPct: 0.25 };
    expect(styledPictureCalibration(map, geometry)).toEqual({
      cells_per_image_width: 9,
      origin_x_pct: 0,
      origin_y_pct: 0.25,
      origin_cell_x: 2, // from liveDrawingCalibration, unaffected by padding
      origin_cell_y: 0,
      grid_opacity: expect.any(Number),
    });
  });
});

describe("bakeAiStyleInput", () => {
  beforeEach(() => {
    mocks.bakeMapForAI.mockClear();
    mocks.bakeMapForAI.mockResolvedValue({ blob: new Blob(["ai"], { type: "image/png" }), geometry: fakeGeometry });
    mocks.bakeMap.mockClear();
  });

  it("falls back to bakeMapForAI, untouched, when there is no Picture", async () => {
    const map = emptyMap();
    const runtimes = new Map();
    const glyphs = {};
    const result = await bakeAiStyleInput(map, runtimes, null, glyphs);
    expect(mocks.bakeMapForAI).toHaveBeenCalledWith(map, runtimes, {}, glyphs, "openai");
    expect(mocks.bakeMap).not.toHaveBeenCalled();
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.geometry).toBe(fakeGeometry);
  });

  it("falls back to bakeMapForAI when the Picture has no calibration to place it by", async () => {
    const map = emptyMap();
    const picture: MapImageLayer = { kind: "picture", url: "https://cdn.example/scan.webp", calibration: null };
    await bakeAiStyleInput(map, new Map(), picture, {});
    expect(mocks.bakeMapForAI).toHaveBeenCalled();
    expect(mocks.bakeMap).not.toHaveBeenCalled();
  });

  // The compositing branch (a calibrated Picture) draws through
  // OffscreenCanvas/fetch/createImageBitmap, which — like the rest of
  // bake.ts's canvas rendering — isn't exercised by unit tests; see
  // bake.test.ts, which stops at the pure `computeBakedDimensions`,
  // `padToAspect`/`padToStyleAspect` and `chooseStyleImageSize`. The branch
  // selection above, the geometry it feeds `placePicture` (already covered
  // by mapStack.test.ts), and the fitting step's own geometry are what's
  // tested here and in bake.test.ts.
});
