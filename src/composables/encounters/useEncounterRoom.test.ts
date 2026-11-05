import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

const q = vi.hoisted(() => ({
  place: undefined as unknown,
  placeFetched: undefined as unknown,
  parentFetched: undefined as unknown,
  regionsFetched: undefined as unknown,
}));
vi.mock("@/composables/encounters/useEncounters", () => ({ useEncounter: () => ({ data: ref(null) }) }));
vi.mock("@/composables/locations/useLocations", () => ({
  // The first call reads the place, the second its parent.
  useLocation: (() => {
    let n = 0;
    return () => {
      n++;
      return n % 2 === 1
        ? { data: q.place, isFetched: q.placeFetched }
        : { data: ref(undefined), isFetched: q.parentFetched };
    };
  })(),
}));
vi.mock("@/composables/locations/useLocationMapRegions", () => ({
  useLocationMapRegions: () => ({ data: ref(undefined), isFetched: q.regionsFetched }),
}));

import { terrainZonesOf, useLocationBattleSurface } from "./useEncounterRoom";

function zone(id: string, cells: string[], cost: number | undefined, role: "zone" | "space" = "zone"): LocationMapRegion {
  return { id, region_role: role, cells, zone_payload: { movement_cost: cost } } as unknown as LocationMapRegion;
}

const calibration = { cells_per_image_width: 10, origin_cell_x: 2, origin_cell_y: 0 } as never;

// #1125: difficult ground counts for a whole-map fight too, not only inside a focus room.
describe("terrainZonesOf", () => {
  const rubble = zone("rubble", ["5,1", "6,1"], 2);
  const faraway = zone("faraway", ["20,20"], 2);
  const plain = zone("plain", ["5,2"], 1);
  const room = zone("room", ["5,3"], 2, "space");
  const all = [rubble, faraway, plain, room];

  it("a whole-map fight prices every costly zone, in battle cells, and skips ordinary ground and rooms", () => {
    const zones = terrainZonesOf(all, { focusCells: [], calibration });
    expect(zones.map((z) => z.region.id)).toEqual(["rubble", "faraway"]);
    // Region cell 5,1 sits at battle cell 3,1 with the calibration origin at x 2.
    expect(zones[0].battleCells).toEqual(["3,1", "4,1"]);
  });

  it("a room fight keeps only the zones that touch the room", () => {
    const zones = terrainZonesOf(all, { focusCells: ["3,1"], calibration });
    expect(zones.map((z) => z.region.id)).toEqual(["rubble"]);
  });

  it("no surface, no zones", () => {
    expect(terrainZonesOf(all, null)).toEqual([]);
  });
});

// Bug: `settled` waited for data, so a failed or empty place read left the Table screen black forever.
describe("useLocationBattleSurface settled", () => {
  const read = (state: { place: unknown; placeFetched: boolean; parentFetched?: boolean; regionsFetched?: boolean }) => {
    q.place = ref(state.place);
    q.placeFetched = ref(state.placeFetched);
    q.parentFetched = ref(state.parentFetched ?? false);
    q.regionsFetched = ref(state.regionsFetched ?? false);
    return useLocationBattleSurface("p1").settled.value;
  };

  it("is not settled before the place read has finished", () => {
    expect(read({ place: undefined, placeFetched: false })).toBe(false);
  });

  it("is settled when the place read finished with nothing (failed, or the place is gone)", () => {
    expect(read({ place: undefined, placeFetched: true })).toBe(true);
  });

  it("waits for the site's regions, which are read once the place is known", () => {
    const site = { id: "p1", location_type: "dungeon", parent_id: null };
    expect(read({ place: site, placeFetched: true, regionsFetched: false })).toBe(false);
    expect(read({ place: site, placeFetched: true, regionsFetched: true })).toBe(true);
  });

  it("is settled when the regions read failed", () => {
    // A failed read is a finished read: isFetched is true on error, data stays undefined.
    expect(read({ place: { id: "p1", location_type: "dungeon", parent_id: null }, placeFetched: true, regionsFetched: true })).toBe(true);
  });
});
