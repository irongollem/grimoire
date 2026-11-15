import { describe, expect, it } from "vitest";
import { doorPlaceOf, regionSiteOf, type FightMapLocation } from "./fightMap.ts";

function place(id: string, location_type: FightMapLocation["location_type"], over: Partial<FightMapLocation> = {}): FightMapLocation {
  return {
    id,
    location_type,
    parent_id: null,
    map_url: null,
    grid_calibration: null,
    map_layer_url: null,
    map_layer_stand_url: null,
    map_layer_stand_live_url: null,
    map_layer_calibration: null,
    plan_size: null,
    map_live: null,
    ...over,
  };
}

const calibration = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 };
const mapped = (id: string, type: FightMapLocation["location_type"]) =>
  place(id, type, { map_layer_url: `${id}.png`, map_layer_calibration: calibration });

describe("which place's regions a fight reads", () => {
  it("a room reads its parent site's regions, not its own (it has none)", () => {
    // Bug: reading the room's own id, so a room fight priced no difficult ground.
    expect(regionSiteOf(place("r1", "room"), place("site", "dungeon"))).toBe("site");
  });

  it("a room whose parent could not be read for this campaign reads nothing", () => {
    // Bug: falling back to the parent_id column, which would read another campaign's regions.
    expect(regionSiteOf(place("r1", "room", { parent_id: "elsewhere" }), null)).toBeNull();
  });

  it("a site reads its own regions", () => {
    expect(regionSiteOf(place("site", "dungeon"), null)).toBe("site");
  });
});

describe("which place's door states a fight reads", () => {
  it("a room on its parent's plan reads the parent's map_memory row", () => {
    // Bug: reading the room's row, which never exists, so doors the DM opened looked shut to the server.
    expect(doorPlaceOf(place("r1", "room"), mapped("site", "dungeon"))).toBe("site");
  });

  it("a place with its own map reads its own row", () => {
    expect(doorPlaceOf(mapped("site", "dungeon"), null)).toBe("site");
  });

  it("a fight with no calibrated map reads no doors", () => {
    expect(doorPlaceOf(place("r1", "room"), place("site", "dungeon"))).toBeNull();
  });
});
