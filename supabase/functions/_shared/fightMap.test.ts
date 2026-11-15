import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { doorPlaceOf, loadFightMapInput, regionSiteOf, type FightMapLocation } from "./fightMap.ts";

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

// A fake of the one query shape the loader uses: from(table).select(cols).eq(..).eq(..).maybeSingle() or an awaited select.
function fakeAdmin(rows: Record<string, unknown>) {
  const filters: { table: string; column: string; value: unknown }[] = [];
  const selected: Record<string, string> = {};
  const admin = {
    from(table: string) {
      const chain = {
        select(columns: string) {
          selected[table] = columns;
          return chain;
        },
        eq(column: string, value: unknown) {
          filters.push({ table, column, value });
          // Awaited directly (the regions read) or continued (`.eq().maybeSingle()`).
          return Object.assign(Promise.resolve({ data: rows[table] ?? [], error: null }), chain);
        },
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      };
      return chain;
    },
  };
  return { admin: admin as unknown as SupabaseClient, filters, selected };
}

describe("what the loader reads of the map's memory", () => {
  const rooms = {
    encounters: { location_id: "site" },
    locations: { ...mapped("site", "dungeon"), parent_id: null },
  };

  it("carries the cells the party has seen, decoded, from the map's own memory row in this campaign", async () => {
    // Bug it fails on: not reading `seen`, so a map with no recorded shape had no rows the server could count on; or reading it
    // without the campaign filter, which would hand one campaign another's fog.
    const { admin, filters, selected } = fakeAdmin({ ...rooms, map_memory: { door_states: [], seen: "1,2;3,7" } });
    const input = await loadFightMapInput(admin, "camp", "enc");
    expect([...(input?.seen ?? [])].sort()).toEqual(["1,2", "3,7"]);
    expect(selected.map_memory).toContain("seen");
    expect(filters.filter((f) => f.table === "map_memory")).toEqual([
      { table: "map_memory", column: "campaign_id", value: "camp" },
      { table: "map_memory", column: "location_id", value: "site" },
    ]);
  });

  it("a map nobody has seen any of has an empty set, not an error", async () => {
    const { admin } = fakeAdmin(rooms);
    const input = await loadFightMapInput(admin, "camp", "enc");
    expect(input?.seen.size).toBe(0);
    expect(input?.doorStates).toEqual([]);
  });
});
