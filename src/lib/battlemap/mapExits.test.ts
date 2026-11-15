import { describe, expect, it } from "vitest";
import type { CellKey } from "../../types/dungeonMap.types.ts";
import type { GridCalibration } from "../../types/location.types.ts";
import { edgeExits, entranceExits, type ExitRegion } from "./mapExits.ts";

const calibration = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 0, origin_cell_y: 0 } as GridCalibration;
const zone = (kind: ExitRegion["zone_kind"], cells: CellKey[], label: string | null): ExitRegion => ({ region_role: "zone", zone_kind: kind, label, cells });

describe("entranceExits", () => {
  it("two Entrance zones over one square say the name, whichever comes first", () => {
    // Bug it fails on: keeping the first zone's null label, so "the gate" the DM named is lost under an unnamed overlap.
    const out = entranceExits([zone("entrance", ["2,2"], null), zone("entrance", ["2,2", "3,2"], "North gate")], calibration);
    expect(out).toEqual([{ cell: "2,2", label: "North gate", kind: "entrance" }, { cell: "3,2", label: "North gate", kind: "entrance" }]);
  });

  it("a blank name is no name", () => {
    // Bug it fails on: reading "  " as a label, which the reply would then quote.
    expect(entranceExits([zone("entrance", ["1,1"], "  ")], calibration)[0].label).toBeNull();
  });

  it("only zones of kind entrance count, and a space never does", () => {
    // Bug it fails on: any zone (or any region) as a way off.
    const space: ExitRegion = { region_role: "space", zone_kind: null, label: "Hall", cells: ["1,1"] };
    expect(entranceExits([zone("hazard", ["1,1"], null), space], calibration)).toEqual([]);
  });
});

describe("edgeExits", () => {
  it("is the border of the bounds, and a 1-row map is all border", () => {
    // Bug it fails on: an interior cell on the border list, or an off-by-one that drops the last column. 3 by 3: 8 cells, not the middle.
    const three = edgeExits({ minX: 0, minY: 0, maxX: 2, maxY: 2 }, true).map((e) => e.cell);
    expect(three).toHaveLength(8);
    expect(three).not.toContain("1,1");
    expect(three).toContain("2,2");
    expect(edgeExits({ minX: 0, minY: 0, maxX: 4, maxY: 0 }, true)).toHaveLength(5);
  });

  it("drops the bottom row when the picture's height is unknown", () => {
    // Bug it fails on: a guessed bottom bound taken for the edge of the world. 3 by 3 with unknown rows: left and right
    // columns (3 each) and the top row between them (1): 7 cells, and (1,2) is not among them.
    const cells = edgeExits({ minX: 0, minY: 0, maxX: 2, maxY: 2 }, false).map((e) => e.cell);
    expect(cells).toHaveLength(7);
    expect(cells).not.toContain("1,2");
  });
});
