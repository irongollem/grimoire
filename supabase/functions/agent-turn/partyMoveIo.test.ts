import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake } from "@/test/supabaseFake";
import { revealRoom, seatParty, setPartyPlace } from "./partyMoveIo";

const C = "c1";
// The map-cell origin is (10, 20): the room's region cells sit offset from the picture's own cells by it.
const calibration = { cells_per_image_width: 30, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 10, origin_cell_y: 20 };
const mapped = { map_url: "https://x/y.png", grid_calibration: calibration, map_layer_url: null, map_layer_stand_url: null, map_layer_calibration: null, plan_size: null };
const bare = { map_url: null, grid_calibration: null, map_layer_url: null, map_layer_stand_url: null, map_layer_calibration: null, plan_size: null };

function world() {
  const fake = createSupabaseFake();
  fake.seed("locations", [
    { id: "keep", campaign_id: C, parent_id: null, ...mapped },
    { id: "hall", campaign_id: C, parent_id: "keep", ...bare },
    { id: "cellar", campaign_id: C, parent_id: "keep", ...bare },
    { id: "moor", campaign_id: C, parent_id: null, ...bare },
    { id: "foreign", campaign_id: "c2", parent_id: null, ...mapped },
  ]);
  fake.seed("location_map_regions", [
    { site_location_id: "keep", region_role: "space", space_location_id: "hall", cells: ["10,20", "11,20"] },
    { site_location_id: "foreign", region_role: "space", space_location_id: "foreign", cells: ["10,20"] },
  ]);
  fake.seed("campaigns", [{ id: C, current_location_id: null, explore_party: null }]);
  fake.onRpc("remember_map_cells", () => "");
  return fake;
}
const client = (fake: ReturnType<typeof createSupabaseFake>) => fake.client as unknown as SupabaseClient;
const rpcs = (fake: ReturnType<typeof createSupabaseFake>) => fake.calls.filter((c) => c.kind === "rpc");

describe("the party's arrival writes", () => {
  // Bug caught: the place written to another row than the campaign's, so the arrival trigger never sees a change.
  it("moves the campaign's place", async () => {
    const fake = world();
    await setPartyPlace(client(fake), C, "hall");
    expect(fake.rows("campaigns")[0].current_location_id).toBe("hall");
  });

  // Bug caught: the room's squares revealed on the room's own id (a room has no memory row) or in the region's cells.
  it("reveals the room's squares in the picture's cells on the map place's memory", async () => {
    const fake = world();
    await revealRoom(client(fake), C, "hall");
    expect(rpcs(fake).map((c) => c.payload)).toEqual([{ p_campaign_id: C, p_location_id: "keep", p_reveal: ["0,0", "1,0"], p_hide: [], p_forget: false }]);
  });

  // Bug caught: a room with no map above it, or no traced region, still writes an empty reveal or throws.
  it("reveals nothing for a place with no map above it and for a room nobody traced", async () => {
    const fake = world();
    await revealRoom(client(fake), C, "moor");
    await revealRoom(client(fake), C, "cellar");
    expect(rpcs(fake)).toEqual([]);
  });

  // Bug caught: a place of another campaign is read as the map (the caller's client is RLS-bound, but the id came from a model).
  it("does not follow a place of another campaign", async () => {
    const fake = world();
    await revealRoom(client(fake), C, "foreign");
    expect(rpcs(fake)).toEqual([]);
  });

  it("seats the party on the map's grid, keyed by member id", async () => {
    const fake = world();
    await seatParty(client(fake), C, "hall", ["a", "b"]);
    expect(fake.rows("campaigns")[0].explore_party).toEqual({ site_id: "keep", positions: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } } });
  });

  // Bug caught: a move to a place with no map wipes the squares the party stands on elsewhere.
  it("leaves the stored party alone when the place has no map", async () => {
    const fake = world();
    const stored = { site_id: "keep", positions: { a: { x: 3, y: 3 } } };
    fake.reset();
    fake.seed("campaigns", [{ id: C, current_location_id: null, explore_party: stored }]);
    fake.seed("locations", [{ id: "moor", campaign_id: C, parent_id: null, ...bare }]);
    await seatParty(client(fake), C, "moor", ["a"]);
    expect(fake.rows("campaigns")[0].explore_party).toEqual(stored);
  });

  // Bug caught: everyone already in the room, and the stored party is overwritten with nothing.
  it("writes nothing when the whole party already stands in the room", async () => {
    const fake = world();
    const stored = { site_id: "keep", positions: { a: { x: 0, y: 0 } } };
    fake.reset();
    fake.seed("campaigns", [{ id: C, current_location_id: null, explore_party: stored }]);
    fake.seed("locations", [{ id: "keep", campaign_id: C, parent_id: null, ...mapped }, { id: "hall", campaign_id: C, parent_id: "keep", ...bare }]);
    fake.seed("location_map_regions", [{ site_location_id: "keep", region_role: "space", space_location_id: "hall", cells: ["10,20", "11,20"] }]);
    await seatParty(client(fake), C, "hall", ["a"]);
    expect(fake.rows("campaigns")[0].explore_party).toEqual(stored);
  });

  // Bug caught: a failed read taken for "no row" and the party silently left where it was.
  it("throws a failed write so the turn can log it", async () => {
    const fake = world();
    fake.failNext("campaigns", { message: "denied" });
    await expect(setPartyPlace(client(fake), C, "hall")).rejects.toMatchObject({ message: "denied" });
  });
});
