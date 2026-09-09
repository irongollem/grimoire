import { describe, it, expect } from "vitest";
import { bindableSpaceIdsBySite, deriveReadinessBySite } from "./useSiteBeatGaps";
import type { Location } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { LocationDoor } from "@/types/locationDoor.types";

function location(over: Partial<Location> & { id: string }): Location {
  return {
    parent_id: null, location_type: "room", name: over.id, map_url: null, grid_calibration: null,
    ...over,
  } as Location;
}

function region(over: Partial<LocationMapRegion> & { id: string; site_location_id: string }): LocationMapRegion {
  return { region_role: "space", cells: ["0,0"], space_location_id: null, zone_kind: null, ...over } as LocationMapRegion;
}

function door(over: Partial<LocationDoor> & { id: string; from_location_id: string }): LocationDoor {
  return { to_location_id: "elsewhere", is_one_way: false, starts_locked: false, ...over } as LocationDoor;
}

describe("bindableSpaceIdsBySite", () => {
  it("collects only a site's own rooms and nested sites, per site", () => {
    const locations = [
      location({ id: "site-a", location_type: "dungeon" }),
      location({ id: "site-a-room-1", parent_id: "site-a", location_type: "room" }),
      location({ id: "site-a-nested", parent_id: "site-a", location_type: "building" }),
      location({ id: "site-a-npc-owned-thing", parent_id: "site-a", location_type: "town" }),
      location({ id: "site-b", location_type: "building" }),
      location({ id: "site-b-room-1", parent_id: "site-b", location_type: "room" }),
    ];
    const result = bindableSpaceIdsBySite(["site-a", "site-b"], locations);
    expect(result.get("site-a")).toEqual(["site-a-room-1", "site-a-nested"]);
    expect(result.get("site-b")).toEqual(["site-b-room-1"]);
  });
});

describe("deriveReadinessBySite", () => {
  it("slices campaign-wide regions and doors down to each site's own", () => {
    const locations = [
      location({ id: "site-a", location_type: "dungeon", map_url: "map-a.png", grid_calibration: {} as never }),
      location({ id: "site-a-room-1", parent_id: "site-a" }),
      location({ id: "site-b", location_type: "building" }),
      location({ id: "site-b-room-1", parent_id: "site-b" }),
    ];
    const regions = [
      region({ id: "r1", site_location_id: "site-a", space_location_id: "site-a-room-1" }),
      region({ id: "r2", site_location_id: "site-b", space_location_id: null }),
    ];
    const doors = [
      door({ id: "d1", from_location_id: "site-a-room-1" }),
    ];
    const result = deriveReadinessBySite(["site-a", "site-b"], locations, regions, doors);

    expect(result["site-a"]).toMatchObject({ mapped: true, bound: true, waysOut: true, unboundSpaces: 0 });
    expect(result["site-b"]).toMatchObject({ mapped: false, bound: false, waysOut: false, unboundSpaces: 1 });
  });

  it("skips a site id with no matching location rather than fabricating an unready result", () => {
    const result = deriveReadinessBySite(["ghost-site"], [], [], []);
    expect(result).toEqual({});
  });
});
