import { describe, expect, it } from "vitest";
import type { GridCalibration } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import { roomCellsAt } from "./roomFog";

const calibration = { cells_per_image_width: 20, origin_x_pct: 0, origin_y_pct: 0, grid_opacity: 0.4, origin_cell_x: 10, origin_cell_y: 10 } as GridCalibration;
const region = (id: string, cells: string[], role: "space" | "zone" = "space") => ({ id, cells, region_role: role }) as unknown as LocationMapRegion;

describe("roomCellsAt", () => {
  // The Cartographer's cells are offset from the picture's by the calibration origin: 12,11 is battle cell 2,1.
  it("reveals the cells of the room under the point, in battle cells, and no other room's", () => {
    const rooms = [region("a", ["10,10", "11,10"]), region("b", ["12,11", "13,11"])];
    const hit = roomCellsAt(rooms, calibration, { x: 2.4, y: 1.9 });
    expect([...(hit ?? [])].sort()).toEqual(["2,1", "3,1"]);
  });

  it("is null on bare floor between rooms", () => {
    expect(roomCellsAt([region("a", ["10,10"])], calibration, { x: 7.5, y: 7.5 })).toBeNull();
  });

  // A zone (difficult ground, a hazard) is not a room: one click must not "reveal the zone".
  it("ignores a zone that covers the point", () => {
    expect(roomCellsAt([region("z", ["10,10"], "zone")], calibration, { x: 0.5, y: 0.5 })).toBeNull();
  });
});
