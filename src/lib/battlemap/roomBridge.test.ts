import { describe, it, expect } from "vitest";
import {
  battleCellToRegionCell,
  regionCellToBattleCell,
  resolveBattleSurface,
  roomsRevealedInCombat,
  seedFogMask,
  seedTokenPositions,
} from "@/lib/battlemap/roomBridge";
import type { GridCalibration, Location } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { RunCombatant } from "@/types/encounter.types";

function makeCalibration(overrides: Partial<GridCalibration> = {}): GridCalibration {
  return {
    cells_per_image_width: 20,
    origin_x_pct: 0,
    origin_y_pct: 0,
    origin_cell_x: -2,
    origin_cell_y: -2,
    ...overrides,
  };
}

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

function makeRegion(overrides: Partial<LocationMapRegion> = {}): LocationMapRegion {
  return {
    id: "region-1",
    user_id: "user-1",
    site_location_id: "site-1",
    space_location_id: "room-1",
    cells: [],
    label: null,
    sort_order: null,
    region_role: "space",
    zone_kind: null,
    zone_payload: {},
    derived_from: "dm",
    cell_signature: null,
    vertices: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeCombatant(overrides: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: "p-1",
    type: "player",
    name: "Test Combatant",
    faction_id: "party",
    initiative: null,
    hp: 10,
    max_hp: 10,
    ac: "15",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    ...overrides,
  };
}

describe("regionCellToBattleCell / battleCellToRegionCell", () => {
  it("offsets by the calibration's origin cell", () => {
    const calibration = makeCalibration({ origin_cell_x: -2, origin_cell_y: -3 });
    expect(regionCellToBattleCell("0,0", calibration)).toBe("2,3");
    expect(regionCellToBattleCell("5,7", calibration)).toBe("7,10");
  });

  it("defaults the origin cell to (0,0) when unset", () => {
    const calibration = makeCalibration({ origin_cell_x: undefined, origin_cell_y: undefined });
    expect(regionCellToBattleCell("4,4", calibration)).toBe("4,4");
  });

  it("round-trips through both directions", () => {
    const calibration = makeCalibration({ origin_cell_x: -2, origin_cell_y: 3 });
    for (const cell of ["0,0", "5,7", "-1,-1"] as const) {
      expect(battleCellToRegionCell(regionCellToBattleCell(cell, calibration), calibration)).toBe(cell);
    }
  });
});

describe("resolveBattleSurface", () => {
  it("returns null with no encounter location", () => {
    expect(resolveBattleSurface({ encounterLocation: null, parent: null, regions: [] })).toBeNull();
  });

  it("uses the encounter's own map when it has one calibrated", () => {
    const calibration = makeCalibration();
    const location = makeLocation({
      id: "loc-1",
      location_type: "dungeon",
      map_url: "https://example.test/map.webp",
      grid_calibration: calibration,
    });
    const surface = resolveBattleSurface({ encounterLocation: location, parent: null, regions: [] });
    expect(surface).toEqual({
      mapLocation: location,
      focusRoomId: null,
      focusCells: [],
      calibration,
    });
  });

  it("a room with no map of its own opens on its site's plan, focused on its traced cells", () => {
    const calibration = makeCalibration({ origin_cell_x: -2, origin_cell_y: -2 });
    const room = makeLocation({ id: "room-1", location_type: "room", parent_id: "site-1" });
    const site = makeLocation({
      id: "site-1",
      location_type: "dungeon",
      map_url: "https://example.test/site.webp",
      grid_calibration: calibration,
    });
    const region = makeRegion({
      site_location_id: "site-1",
      space_location_id: "room-1",
      cells: ["0,0", "1,0", "0,1"],
    });
    const surface = resolveBattleSurface({ encounterLocation: room, parent: site, regions: [region] });
    expect(surface).not.toBeNull();
    expect(surface?.mapLocation).toBe(site);
    expect(surface?.focusRoomId).toBe("room-1");
    // origin_cell (-2,-2): battle cell = region cell - origin_cell = region cell + 2.
    expect(surface?.focusCells.sort()).toEqual(["2,2", "3,2", "2,3"].sort());
  });

  it("returns null for a room with no map and no calibrated parent", () => {
    const room = makeLocation({ id: "room-1", location_type: "room", parent_id: "site-1" });
    const site = makeLocation({ id: "site-1", location_type: "dungeon", map_url: null, grid_calibration: null });
    expect(resolveBattleSurface({ encounterLocation: room, parent: site, regions: [] })).toBeNull();
  });

  it("returns null for a non-room location with no map of its own", () => {
    const location = makeLocation({ id: "loc-1", location_type: "dungeon", map_url: null });
    expect(resolveBattleSurface({ encounterLocation: location, parent: null, regions: [] })).toBeNull();
  });
});

describe("seedTokenPositions", () => {
  it("leaves combatants alone when there are no focus cells", () => {
    const combatants = [makeCombatant()];
    expect(seedTokenPositions(combatants, [], { footprintOf: () => 1 })).toBe(combatants);
  });

  it("places unpositioned player combatants row-major on free cells", () => {
    const combatants = [
      makeCombatant({ instance_id: "p-1" }),
      makeCombatant({ instance_id: "p-2" }),
    ];
    const focusCells: `${number},${number}`[] = ["1,0", "0,0", "0,1", "1,1"];
    const result = seedTokenPositions(combatants, focusCells, { footprintOf: () => 1 });
    expect(result[0].position).toEqual({ x: 0, y: 0 });
    expect(result[1].position).toEqual({ x: 1, y: 0 });
  });

  it("never places a monster combatant", () => {
    const combatants = [makeCombatant({ type: "monster", instance_id: "m-1" })];
    const result = seedTokenPositions(combatants, ["0,0"], { footprintOf: () => 1 });
    expect(result[0].position).toBeUndefined();
  });

  it("leaves an already-positioned combatant untouched (idempotent re-seed)", () => {
    const combatants = [makeCombatant({ position: { x: 9, y: 9 } })];
    const result = seedTokenPositions(combatants, ["0,0"], { footprintOf: () => 1 });
    expect(result[0].position).toEqual({ x: 9, y: 9 });
  });

  it("is footprint-aware and never overlaps a larger token onto an occupied cell", () => {
    const combatants = [
      makeCombatant({ instance_id: "p-large", footprint: 2 }),
      makeCombatant({ instance_id: "p-small", footprint: 1 }),
    ];
    const focusCells: `${number},${number}`[] = ["0,0", "1,0", "0,1", "1,1", "2,0"];
    const result = seedTokenPositions(combatants, focusCells, { footprintOf: (c) => c.footprint ?? 1 });
    // The 2x2 token claims (0,0)-(1,1); the next token must land outside that block.
    expect(result[0].position).toEqual({ x: 0, y: 0 });
    expect(result[1].position).toEqual({ x: 2, y: 0 });
  });

  it("leaves a combatant unplaced when the room has no room for its footprint", () => {
    const combatants = [makeCombatant({ footprint: 4 })];
    const result = seedTokenPositions(combatants, ["0,0", "1,0"], { footprintOf: (c) => c.footprint ?? 1 });
    expect(result[0].position).toBeUndefined();
  });
});

describe("seedFogMask", () => {
  it("reveals exactly the focus cells", () => {
    expect(seedFogMask(["0,0", "1,0"])).toEqual(new Set(["0,0", "1,0"]));
  });

  it("is empty when there are no focus cells", () => {
    expect(seedFogMask([])).toEqual(new Set());
  });
});

describe("roomsRevealedInCombat", () => {
  it("reveals a room whose region is at least half revealed", () => {
    const calibration = makeCalibration({ origin_cell_x: 0, origin_cell_y: 0 });
    const region = makeRegion({ space_location_id: "room-1", cells: ["0,0", "1,0"] });
    const revealed = new Set(["0,0"]); // 1 of 2 cells = 50%
    expect(roomsRevealedInCombat(revealed, [region], calibration)).toEqual(["room-1"]);
  });

  it("does not reveal a room under the 50% threshold", () => {
    const calibration = makeCalibration({ origin_cell_x: 0, origin_cell_y: 0 });
    const region = makeRegion({ space_location_id: "room-1", cells: ["0,0", "1,0", "2,0"] });
    const revealed = new Set(["0,0"]); // 1 of 3 cells
    expect(roomsRevealedInCombat(revealed, [region], calibration)).toEqual([]);
  });

  it("converts region cells through the calibration's origin before comparing", () => {
    const calibration = makeCalibration({ origin_cell_x: -2, origin_cell_y: -2 });
    const region = makeRegion({ space_location_id: "room-1", cells: ["2,2", "3,2"] });
    // Battle-cell space: "2,2" -> "4,4", "3,2" -> "5,4"
    const revealed = new Set(["4,4", "5,4"]);
    expect(roomsRevealedInCombat(revealed, [region], calibration)).toEqual(["room-1"]);
  });

  it("skips zones and unbound regions", () => {
    const calibration = makeCalibration({ origin_cell_x: 0, origin_cell_y: 0 });
    const zone = makeRegion({ region_role: "zone", zone_kind: "terrain", space_location_id: null, cells: ["0,0"] });
    const unbound = makeRegion({ region_role: "space", space_location_id: null, cells: ["1,1"] });
    const revealed = new Set(["0,0", "1,1"]);
    expect(roomsRevealedInCombat(revealed, [zone, unbound], calibration)).toEqual([]);
  });

  it("skips regions with no traced cells", () => {
    const calibration = makeCalibration({ origin_cell_x: 0, origin_cell_y: 0 });
    const region = makeRegion({ space_location_id: "room-1", cells: [] });
    expect(roomsRevealedInCombat(new Set(), [region], calibration)).toEqual([]);
  });
});
