import { describe, it, expect } from "vitest";
import { directRoomPlacement, resolvePlacedInRooms } from "./placedIn";
import type { LocationPlacementWithLocation } from "@/composables/locations/useLocationPlacements";
import type { Location } from "@/types/location.types";

function location(over: Partial<Location> = {}): Location {
  return {
    id: "room-1",
    user_id: "u",
    campaign_id: "campaign-1",
    parent_id: null,
    name: "Nave of Ash",
    location_type: "room",
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

function placement(over: Partial<LocationPlacementWithLocation> = {}): LocationPlacementWithLocation {
  return {
    id: "placement-1",
    user_id: "u",
    location_id: "room-1",
    trap_id: "trap-1",
    dungeon_feature_id: null,
    roll_table_id: null,
    loot_table_id: null,
    note: null,
    sort_order: null,
    source_cell_key: null,
    created_at: "",
    updated_at: "",
    location: { id: "room-1", name: "Nave of Ash", location_type: "room" },
    ...over,
  };
}

describe("resolvePlacedInRooms", () => {
  it("names the room's direct parent as the site", () => {
    const locations = new Map([
      ["room-1", location({ id: "room-1", parent_id: "site-1", name: "Nave of Ash" })],
      ["site-1", location({ id: "site-1", name: "Ashmouth Undercroft", location_type: "dungeon" })],
    ]);
    const rows = resolvePlacedInRooms([placement()], locations);
    expect(rows).toEqual([{ key: "placement-1", siteName: "Ashmouth Undercroft", roomName: "Nave of Ash", cell: null }]);
  });

  it("carries the cell through when the placement has one", () => {
    const locations = new Map([["room-1", location({ id: "room-1", parent_id: null })]]);
    const rows = resolvePlacedInRooms([placement({ source_cell_key: "7,2" })], locations);
    expect(rows[0].cell).toBe("7,2");
  });

  it("has no site name for a room with no parent", () => {
    const locations = new Map([["room-1", location({ id: "room-1", parent_id: null })]]);
    const rows = resolvePlacedInRooms([placement()], locations);
    expect(rows[0].siteName).toBeNull();
  });

  it("falls back to the placement's own embedded location name if the room is missing from the index", () => {
    const rows = resolvePlacedInRooms([placement({ location_id: "gone", location: { id: "gone", name: "Ghost Room", location_type: "room" } })], new Map());
    expect(rows[0].roomName).toBe("Ghost Room");
  });
});

describe("directRoomPlacement", () => {
  it("names the room's parent as the site and carries no cell", () => {
    const locations = new Map([
      ["room-1", location({ id: "room-1", parent_id: "site-1", name: "Cellar" })],
      ["site-1", location({ id: "site-1", name: "Bell & Cinder", location_type: "tavern" })],
    ]);
    expect(directRoomPlacement("room-1", locations)).toEqual({
      key: "room-1",
      siteName: "Bell & Cinder",
      roomName: "Cellar",
      cell: null,
    });
  });

  it("falls back to ??? for a room missing from the index", () => {
    expect(directRoomPlacement("gone", new Map())).toEqual({
      key: "gone",
      siteName: null,
      roomName: "???",
      cell: null,
    });
  });
});
