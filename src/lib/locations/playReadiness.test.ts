import { describe, expect, it } from "vitest";
import { playReadiness, type PlayReadinessInput, type ReadyDoor } from "./playReadiness";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { MapLive } from "@/types/mapLive.types";

function region(over: Partial<LocationMapRegion> = {}): LocationMapRegion {
  return {
    id: "r1", user_id: "u", site_location_id: "site", space_location_id: "crypt", cells: ["0,0"], label: null,
    sort_order: null, region_role: "space", zone_kind: null, zone_payload: {}, derived_from: "dm",
    cell_signature: null, vertices: null, created_at: "", updated_at: "", ...over,
  };
}

function door(over: Partial<ReadyDoor> = {}): ReadyDoor {
  return { id: "d1", edge_key: "1,1:N", to_location_id: "gallery", from_location_id: "crypt", from_name: "Crypt", to_name: "Gallery", ...over };
}

function live(over: Partial<MapLive> = {}): MapLive {
  return { version: 3, darkness: "dim", groups: [], lights: [], sprites: [], walls: [], doors: [], solid: [], ...over };
}

function input(over: Partial<PlayReadinessInput> = {}): PlayReadinessInput {
  return {
    location: {
      map_url: "p.png", grid_calibration: { cells_per_image_width: 30, origin_x_pct: 0, origin_y_pct: 0 },
      map_layer_url: null, map_layer_stand_url: null, map_layer_calibration: null, plan_size: null,
    },
    spaces: [{ id: "crypt" }],
    regions: [region()],
    doors: [door()],
    live: live(),
    darkness: "dim",
    hasDrawing: true,
    ...over,
  };
}

const row = (rows: ReturnType<typeof playReadiness>, id: string) => rows.find((r) => r.id === id)!;

// #1125 decision 16 / frame 08: gaps are named, each with its fix, and none blocks.
describe("playReadiness", () => {
  it("a door in the list but not on the map gets a Place it for that door, and names the way", () => {
    const rows = playReadiness(input({ doors: [door(), door({ id: "d2", edge_key: null })] }));
    const doors = row(rows, "doors");
    expect(doors.status).toBe("gap");
    expect(doors.detail).toContain("Crypt to Gallery is in the list but not on the map");
    expect(doors.fixes).toEqual([{ label: "Place it", action: { kind: "place-door", doorId: "d2" }, subject: "Crypt to Gallery" }]);
  });

  it("placed doors need no fix", () => {
    const doors = row(playReadiness(input()), "doors");
    expect(doors.status).toBe("ok");
    expect(doors.fixes).toEqual([]);
  });

  it("no grid offers Line up the grid; a grid says how wide it is and offers nothing", () => {
    const none = row(playReadiness(input({ location: { ...input().location, grid_calibration: null, map_url: "p.png" } })), "grid");
    expect(none.detail).toBe("No grid yet");
    expect(none.fixes.map((f) => f.action.kind)).toEqual(["line-up"]);
    const some = row(playReadiness(input()), "grid");
    expect(some.detail).toBe("30 squares across");
    expect(some.fixes).toEqual([]);
  });

  it("a traced space with no place offers Link, optional, and does not turn amber", () => {
    const rooms = row(playReadiness(input({ regions: [region({ space_location_id: null, label: "The Crypt" })] })), "rooms");
    expect(rooms.status).toBe("neutral");
    expect(rooms.detail).toBe("The Crypt isn't a place in the Atlas yet. Optional.");
    expect(rooms.fixes.map((f) => f.action.kind)).toEqual(["link"]);
  });

  it("when every traced space is a place there is nothing to link", () => {
    const rooms = row(playReadiness(input()), "rooms");
    expect(rooms.status).toBe("ok");
    expect(rooms.fixes).toEqual([]);
  });

  it("several unbound spaces are counted", () => {
    const rooms = row(playReadiness(input({ regions: [region({ id: "a", space_location_id: null }), region({ id: "b", space_location_id: null })] })), "rooms");
    expect(rooms.detail).toBe("2 traced spaces aren't places in the Atlas yet. Optional.");
  });

  it("walls come from the live snapshot; without any, sight and light pass everywhere", () => {
    const withWalls = row(playReadiness(input({ live: live({ walls: [{ id: "w", a: [0, 0], b: [1, 0] }] }) })), "walls");
    expect(withWalls.status).toBe("ok");
    expect(row(playReadiness(input()), "walls").detail).toBe("No walls yet: sight and light pass everywhere");
  });

  it("walls of a drawing that was never published are not claimed absent", () => {
    expect(row(playReadiness(input({ live: null })), "walls").detail).toBe("Read when the drawing is published");
  });

  it("light names the editor's darkness and the snapshot's lights, and always offers Change", () => {
    const rows = playReadiness(input({ darkness: "dark", live: live({ lights: [{ x: 0, y: 0, color: "#fff", bright: 4, dim: 8, phase: 0 }] }) }));
    expect(row(rows, "light").detail).toBe("Dark, with 1 light on the map");
    expect(row(rows, "light").fixes.map((f) => f.action.kind)).toEqual(["light"]);
  });
});
