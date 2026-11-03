import { describe, expect, it } from "vitest";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import { terrainZonesOf } from "./useEncounterRoom";

function zone(id: string, cells: string[], cost: number | undefined, role: "zone" | "space" = "zone"): LocationMapRegion {
  return { id, region_role: role, cells, zone_payload: { movement_cost: cost } } as unknown as LocationMapRegion;
}

const calibration = { cells_per_image_width: 10, origin_cell_x: 2, origin_cell_y: 0 } as never;

// #1125: difficult ground counts for a whole-map fight too, not only inside a focus room.
describe("terrainZonesOf", () => {
  const rubble = zone("rubble", ["5,1", "6,1"], 2);
  const faraway = zone("faraway", ["20,20"], 2);
  const plain = zone("plain", ["5,2"], 1);
  const room = zone("room", ["5,3"], 2, "space");
  const all = [rubble, faraway, plain, room];

  it("a whole-map fight prices every costly zone, in battle cells, and skips ordinary ground and rooms", () => {
    const zones = terrainZonesOf(all, { focusCells: [], calibration });
    expect(zones.map((z) => z.region.id)).toEqual(["rubble", "faraway"]);
    // Region cell 5,1 sits at battle cell 3,1 with the calibration origin at x 2.
    expect(zones[0].battleCells).toEqual(["3,1", "4,1"]);
  });

  it("a room fight keeps only the zones that touch the room", () => {
    const zones = terrainZonesOf(all, { focusCells: ["3,1"], calibration });
    expect(zones.map((z) => z.region.id)).toEqual(["rubble"]);
  });

  it("no surface, no zones", () => {
    expect(terrainZonesOf(all, null)).toEqual([]);
  });
});
