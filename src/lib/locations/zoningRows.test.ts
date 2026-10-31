// What a Zoning line says (#1125 frames 18-19). Expected words come from the frames' captions:
// "found", "found · renamed", "bound", "terrain · difficult"; an unnamed room reads "Room N".
import { describe, expect, it } from "vitest";
import type { DerivedSpace } from "@/cartographer/structure.types";
import type { ZoningEntry } from "@/lib/locations/foundRooms";
import { entryId, foundRegionOf, foundSpaceKey, roomTitle, zoningState } from "@/lib/locations/zoningRows";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

const space: DerivedSpace = { key: "s:0,0", cells: ["0,0"], signature: "sig", outline: [[0, 0], [1, 0], [1, 1]], name: null, nameSource: null };

function region(over: Partial<LocationMapRegion> = {}): LocationMapRegion {
  return {
    id: "r1", user_id: "u", site_location_id: "site", space_location_id: null, cells: ["0,0"], label: null, sort_order: null,
    region_role: "space", zone_kind: null, zone_payload: {}, derived_from: "dm", cell_signature: null, vertices: null,
    created_at: "", updated_at: "", ...over,
  };
}
const row = (over: Partial<LocationMapRegion>, extra: Partial<Extract<ZoningEntry, { kind: "region" }>> = {}): ZoningEntry => ({
  kind: "region", region: region(over), space: null, found: false, changed: false, ...extra,
});

describe("zoningState", () => {
  it("a room only the walls know reads found", () => {
    expect(zoningState({ kind: "found", space })).toBe("found");
  });

  it("a written room the DM never touched still reads found, and says when the walls have moved", () => {
    const untouched = row({ derived_from: "floodfill", cell_signature: "sig" }, { found: true });
    expect(zoningState(untouched)).toBe("found");
    expect(zoningState(row({ derived_from: "floodfill", cell_signature: "old" }, { found: true, changed: true }))).toBe("found · walls moved");
  });

  it("a found room the DM renamed keeps saying where it came from", () => {
    expect(zoningState(row({ derived_from: "dm", cell_signature: "sig", label: "Crypt" }))).toBe("found · renamed");
  });

  it("a bound room reads bound, even one that came from the walls", () => {
    expect(zoningState(row({ space_location_id: "loc", derived_from: "dm", cell_signature: "sig" }))).toBe("bound");
  });

  it("a room drawn by hand and not yet bound says so", () => {
    expect(zoningState(row({}))).toBe("not bound yet");
  });

  it("a zone names its kind and what is special about it, without repeating the kind", () => {
    const terrain = row({ region_role: "zone", zone_kind: "terrain", zone_payload: { movement_cost: 2 } });
    expect(zoningState(terrain)).toBe("terrain · difficult");
    expect(zoningState(row({ region_role: "zone", zone_kind: "marker" }))).toBe("marker");
  });
});

describe("roomTitle", () => {
  it("an unnamed room reads Room N by its place among the rooms", () => {
    expect(roomTitle({ kind: "found", space }, 3, null)).toEqual({ text: "Room 3", named: false });
  });

  it("the walls' own name (an annotation) counts as named", () => {
    expect(roomTitle({ kind: "found", space: { ...space, name: "Nave" } }, 3, null)).toEqual({ text: "Nave", named: true });
  });

  it("a bound room is titled by its place, not by an old label", () => {
    expect(roomTitle(row({ label: "old" }), 1, "Reliquary")).toEqual({ text: "Reliquary", named: true });
  });
});

describe("found room ids", () => {
  it("a found room's canvas id is told apart from a row's and maps back to its walls", () => {
    const dressed = foundRegionOf(space, "site");
    expect(dressed.id).toBe(entryId({ kind: "found", space }));
    expect(foundSpaceKey(dressed.id)).toBe("s:0,0");
    expect(foundSpaceKey("a-real-uuid")).toBeNull();
    expect(dressed.derived_from).toBe("floodfill");
  });
});
