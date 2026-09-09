import { describe, it, expect } from "vitest";
import { resolveBattleMapGate } from "@/composables/encounters/useCombatExploration";
import type { GridCalibration, Location } from "@/types/location.types";
import type { BattleSurface } from "@/lib/battlemap/roomBridge";

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: "loc-1",
    user_id: "user-1",
    campaign_id: "campaign-1",
    parent_id: null,
    name: "Test Location",
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
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeCalibration(overrides: Partial<GridCalibration> = {}): GridCalibration {
  return {
    cells_per_image_width: 20,
    origin_x_pct: 0,
    origin_y_pct: 0,
    origin_cell_x: 0,
    origin_cell_y: 0,
    ...overrides,
  };
}

function makeSurface(overrides: Partial<BattleSurface> = {}): BattleSurface {
  return {
    mapLocation: makeLocation({ location_type: "dungeon", map_url: "map.png", is_battle_map: true }),
    focusRoomId: null,
    focusCells: [],
    calibration: makeCalibration(),
    ...overrides,
  };
}

describe("resolveBattleMapGate", () => {
  it("blocks with a link-it message when the encounter has no location at all", () => {
    const gate = resolveBattleMapGate({ hasLocationId: false, location: null, surface: null });
    expect(gate.canOpen).toBe(false);
    expect(gate.reason).toBe("Link this encounter to a location to use the battle map");
  });

  it("blocks silently while the location is still loading", () => {
    const gate = resolveBattleMapGate({ hasLocationId: true, location: null, surface: null });
    expect(gate.canOpen).toBe(false);
    expect(gate.reason).toBe("");
  });

  it("says 'no map of its own' for a room with no map and no calibrated site", () => {
    const room = makeLocation({ location_type: "room", map_url: null });
    const gate = resolveBattleMapGate({ hasLocationId: true, location: room, surface: null });
    expect(gate.canOpen).toBe(false);
    expect(gate.reason).toBe("This room has no map of its own, and its site isn't calibrated either");
  });

  it("says 'needs calibrating' — not 'no map of its own' — for a room that HAS a map but no calibration", () => {
    const room = makeLocation({ location_type: "room", map_url: "room-map.png", grid_calibration: null });
    const gate = resolveBattleMapGate({ hasLocationId: true, location: room, surface: null });
    expect(gate.canOpen).toBe(false);
    expect(gate.reason).toBe("This room's map needs calibrating first");
  });

  it("says 'no map' for a plain (non-room) location with no map", () => {
    const loc = makeLocation({ location_type: "dungeon", map_url: null });
    const gate = resolveBattleMapGate({ hasLocationId: true, location: loc, surface: null });
    expect(gate.canOpen).toBe(false);
    expect(gate.reason).toBe("The linked location has no map");
  });

  it("says 'calibrate' for a plain (non-room) location with a map but no calibration", () => {
    const loc = makeLocation({ location_type: "dungeon", map_url: "map.png", grid_calibration: null });
    const gate = resolveBattleMapGate({ hasLocationId: true, location: loc, surface: null });
    expect(gate.canOpen).toBe(false);
    expect(gate.reason).toBe("Calibrate the location's map first");
  });

  it("blocks a resolved, non-room surface that isn't flagged as a battle map", () => {
    const loc = makeLocation({ location_type: "dungeon", map_url: "map.png" });
    const surface = makeSurface({ focusRoomId: null, mapLocation: { ...loc, is_battle_map: false } });
    const gate = resolveBattleMapGate({ hasLocationId: true, location: loc, surface });
    expect(gate.canOpen).toBe(false);
    expect(gate.reason).toBe('Toggle "Battle map" on the location to enable the VTT');
  });

  it("opens a resolved, non-room surface flagged as a battle map", () => {
    const loc = makeLocation({ location_type: "dungeon", map_url: "map.png" });
    const surface = makeSurface({ focusRoomId: null, mapLocation: { ...loc, is_battle_map: true } });
    const gate = resolveBattleMapGate({ hasLocationId: true, location: loc, surface });
    expect(gate).toEqual({ canOpen: true, reason: "" });
  });

  it("opens a room riding its site's publish regardless of the site's is_battle_map flag", () => {
    const room = makeLocation({ location_type: "room", map_url: null });
    const surface = makeSurface({
      focusRoomId: room.id,
      mapLocation: { ...makeLocation({ location_type: "dungeon" }), is_battle_map: false },
    });
    const gate = resolveBattleMapGate({ hasLocationId: true, location: room, surface });
    expect(gate).toEqual({ canOpen: true, reason: "" });
  });
});
