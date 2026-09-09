import { describe, it, expect } from "vitest";
import { planCloneLevel } from "./cloneLevel";
import type { Location } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { LocationDoor } from "@/types/locationDoor.types";

function loc(over: Partial<Location> = {}): Location {
  return {
    id: "id",
    user_id: "u",
    campaign_id: "camp",
    parent_id: null,
    name: "place",
    location_type: "dungeon",
    description: null,
    notes: null,
    tags: [],
    image_url: null,
    map_url: null,
    map_pins: [],
    is_map_shared: false,
    player_visible_to: [],
    player_summary: null,
    is_description_shared: false,
    is_npcs_shared: false,
    is_inventory_shared: false,
    npc_owner_id: null,
    related_location_ids: [],
    source_map_id: null,
    is_battle_map: false,
    grid_calibration: null,
    era_start: null,
    era_end: null,
    audio_theme: null,
    sort_order: null,
    map_published_rev: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function region(over: Partial<LocationMapRegion> = {}): LocationMapRegion {
  return {
    id: "reg",
    user_id: "u",
    site_location_id: "site",
    space_location_id: null,
    cells: ["0,0"],
    label: null,
    sort_order: null,
    region_role: "space",
    zone_kind: null,
    zone_payload: {},
    derived_from: "dm",
    cell_signature: "sig",
    vertices: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function door(over: Partial<LocationDoor> = {}): LocationDoor {
  return {
    id: "door",
    user_id: "u",
    from_location_id: "room-1",
    to_location_id: "room-2",
    label: "",
    is_one_way: false,
    starts_locked: false,
    lock_note: null,
    is_secret: false,
    sort_order: null,
    door_kind: "door",
    source_edge_key: "0,0:N",
    dungeon_feature_id: "feature-1",
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("planCloneLevel", () => {
  const site = loc({ id: "site", name: "Undercroft", parent_id: "region-1", map_url: "/map.webp", source_map_id: "map-1" });
  const room1 = loc({ id: "room-1", name: "Nave", parent_id: "site", location_type: "room" });
  const room2 = loc({ id: "room-2", name: "Cell", parent_id: "site", location_type: "room" });

  it("names the copy and carries the floor plan fields", () => {
    const plan = planCloneLevel({ site, rooms: [room1, room2], regions: [], doors: [] });
    expect(plan.siteInsert.name).toBe("Undercroft (copy)");
    expect(plan.siteInsert.parent_id).toBe("region-1");
    expect(plan.siteInsert.map_url).toBe("/map.webp");
    expect(plan.siteInsert.source_map_id).toBe("map-1");
    expect(plan.siteInsert.map_published_rev).toBeUndefined();
  });

  it("plans one room per source room, keyed by source id", () => {
    const plan = planCloneLevel({ site, rooms: [room1, room2], regions: [], doors: [] });
    expect(plan.rooms.map((r) => r.sourceId)).toEqual(["room-1", "room-2"]);
    expect(plan.rooms[0].insert.name).toBe("Nave");
  });

  it("carries a region's geometry but drops its cell_signature", () => {
    const plan = planCloneLevel({
      site,
      rooms: [room1],
      regions: [region({ space_location_id: "room-1" })],
      doors: [],
    });
    expect(plan.regions).toHaveLength(1);
    expect(plan.regions[0].spaceSourceId).toBe("room-1");
    expect(plan.regions[0].insert.cells).toEqual(["0,0"]);
    expect(plan.regions[0].insert.cell_signature).toBeNull();
  });

  it("drops a region bound to a room outside this level (a nested site)", () => {
    const plan = planCloneLevel({
      site,
      rooms: [room1],
      regions: [region({ space_location_id: "some-other-site" })],
      doors: [],
    });
    expect(plan.regions[0].spaceSourceId).toBeNull();
  });

  it("excludes a region belonging to a different site", () => {
    const plan = planCloneLevel({
      site,
      rooms: [room1],
      regions: [region({ site_location_id: "different-site" })],
      doors: [],
    });
    expect(plan.regions).toHaveLength(0);
  });

  it("plans a door between two of this level's rooms, dropping publish/feature provenance", () => {
    const plan = planCloneLevel({ site, rooms: [room1, room2], regions: [], doors: [door()] });
    expect(plan.doors).toHaveLength(1);
    expect(plan.doors[0].fromSourceId).toBe("room-1");
    expect(plan.doors[0].toSourceId).toBe("room-2");
    expect(plan.doors[0].insert.source_edge_key).toBeNull();
    expect(plan.doors[0].insert.dungeon_feature_id).toBeNull();
  });

  it("drops a door reaching outside this level's rooms (a vertical way to another level)", () => {
    const plan = planCloneLevel({
      site,
      rooms: [room1],
      regions: [],
      doors: [door({ to_location_id: "level-2-stair-room" })],
    });
    expect(plan.doors).toHaveLength(0);
  });
});
