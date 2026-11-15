import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

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

import { useLocationBattleSurface } from "./useEncounterRoom";

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
