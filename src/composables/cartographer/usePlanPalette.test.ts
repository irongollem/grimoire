// #884 review findings 4 and 5 — regression coverage for `usePlanPalette.ts`.
// Every data-fetching/mutation composable it touches is mocked out (the same
// approach `MapWorkbench.test.ts` already uses for the same composables),
// with just enough control to simulate the two races the review found:
//
// - Finding 4: two commits fired back to back, before the first's query
//   invalidation has actually landed, used to both read the same stale
//   `before` off `regions.value` — so undoing the second silently reverted
//   the first too.
// - Finding 5: `claimFloorRegion` always inserted a new region, so claiming
//   the same floor twice (or floor already traced as a Space) made two
//   overlapping rows.
import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlanPalette } from "./usePlanPalette";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

interface MutationCall {
  vars: unknown;
  onSuccess?: (data: unknown) => void;
  onError?: (err: unknown) => void;
}

function makeMutationStub() {
  const calls: MutationCall[] = [];
  const mutate = vi.fn((vars: unknown, opts?: { onSuccess?: (data: unknown) => void; onError?: (err: unknown) => void }) => {
    calls.push({ vars, onSuccess: opts?.onSuccess, onError: opts?.onError });
  });
  const mutateAsync = vi.fn(async (vars: unknown) => vars);
  return { mutate, mutateAsync, isPending: { value: false }, calls };
}

const { updateRegionStub, createRegionStub, deleteRegionStub, regionsData } = vi.hoisted(() => {
  function stub() {
    const calls: MutationCall[] = [];
    const mutate = vi.fn((vars: unknown, opts?: { onSuccess?: (data: unknown) => void; onError?: (err: unknown) => void }) => {
      calls.push({ vars, onSuccess: opts?.onSuccess, onError: opts?.onError });
    });
    const mutateAsync = vi.fn(async (vars: unknown) => vars);
    return { mutate, mutateAsync, isPending: { value: false }, calls };
  }
  return {
    updateRegionStub: stub(),
    createRegionStub: stub(),
    deleteRegionStub: stub(),
    regionsData: { value: [] as LocationMapRegion[] },
  };
});

vi.mock("@/composables/locations/useLocationMapRegions", () => ({
  useLocationMapRegions: () => ({ data: regionsData }),
  useCreateLocationMapRegion: () => createRegionStub,
  useUpdateLocationMapRegion: () => updateRegionStub,
  useDeleteLocationMapRegion: () => deleteRegionStub,
  dmEdit: (update: Record<string, unknown>) => ({ ...update, derived_from: "dm" }),
}));
vi.mock("@/composables/locations/useLocationDoors", () => ({
  useCreateLocationDoor: makeMutationStub,
  useUpdateLocationDoor: makeMutationStub,
  useDeleteLocationDoor: makeMutationStub,
}));
vi.mock("@/composables/locations/useSiteDoors", () => ({ useSiteDoors: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useLocations: () => ({ data: ref([]) }) }));

function makeRegion(overrides: Partial<LocationMapRegion> = {}): LocationMapRegion {
  return {
    id: "r1",
    user_id: "user-1",
    site_location_id: "site-1",
    space_location_id: null,
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

describe("usePlanPalette", () => {
  beforeEach(() => {
    regionsData.value = [];
    for (const stub of [updateRegionStub, createRegionStub, deleteRegionStub]) {
      stub.calls.length = 0;
      stub.mutate.mockClear();
      stub.mutateAsync.mockClear();
      stub.mutateAsync.mockImplementation(async (vars: unknown) => vars);
    }
  });

  describe("commitCells — the before snapshot under rapid input (finding 4)", () => {
    it("a second stroke's undo reverts only itself, not the first", async () => {
      regionsData.value = [makeRegion({ id: "r1", cells: ["0,0"] })];
      const plan = usePlanPalette(computed(() => "site-1"));

      // Two strokes fired back to back — the query still shows the ORIGINAL
      // cells for both, since neither `onSuccess` has run yet (the real bug:
      // both used to read `before` off that same stale snapshot).
      plan.commitCells("r1", ["0,0", "0,1"]); // stroke 1
      plan.commitCells("r1", ["0,0", "0,1", "0,2"]); // stroke 2

      updateRegionStub.calls[0]!.onSuccess?.({});
      updateRegionStub.calls[1]!.onSuccess?.({});

      await plan.undo.undo(); // undoes stroke 2 only
      const firstUndoCall = updateRegionStub.mutateAsync.mock.calls.at(-1)![0] as { update: { cells: string[] } };
      expect(firstUndoCall.update.cells).toEqual(["0,0", "0,1"]); // stroke 1's result, not the pre-stroke-1 original

      await plan.undo.undo(); // undoes stroke 1
      const secondUndoCall = updateRegionStub.mutateAsync.mock.calls.at(-1)![0] as { update: { cells: string[] } };
      expect(secondUndoCall.update.cells).toEqual(["0,0"]); // back to the true original
    });
  });

  describe("claimFloorRegion — no overlapping duplicates (finding 5)", () => {
    it("selects an existing space that already covers the claimed floor instead of duplicating it", async () => {
      regionsData.value = [makeRegion({ id: "existing", region_role: "space", cells: ["0,0", "0,1"] })];
      const plan = usePlanPalette(computed(() => "site-1"));

      await plan.claimFloorRegion(["0,0", "0,1"]);

      expect(createRegionStub.mutateAsync).not.toHaveBeenCalled();
      expect(plan.activeRegionId.value).toBe("existing");
    });

    it("selects an existing space on a partial overlap too — floor already traced by hand", async () => {
      regionsData.value = [makeRegion({ id: "existing", region_role: "space", cells: ["0,0", "0,1", "0,2"] })];
      const plan = usePlanPalette(computed(() => "site-1"));

      await plan.claimFloorRegion(["0,0", "0,1", "0,2", "0,3"]); // the flood fill found one more cell than the hand trace

      expect(createRegionStub.mutateAsync).not.toHaveBeenCalled();
      expect(plan.activeRegionId.value).toBe("existing");
    });

    it("still creates a genuinely new region when nothing covers it", async () => {
      regionsData.value = [makeRegion({ id: "existing", region_role: "space", cells: ["5,5"] })];
      createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "new-region", cells: ["0,0", "0,1"], region_role: "space" });
      const plan = usePlanPalette(computed(() => "site-1"));

      await plan.claimFloorRegion(["0,0", "0,1"]);

      expect(createRegionStub.mutateAsync).toHaveBeenCalledOnce();
    });

    it("ignores a zone that happens to cover the same cells — only an existing space counts", async () => {
      regionsData.value = [makeRegion({ id: "zone-1", region_role: "zone", cells: ["0,0", "0,1"] })];
      createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "new-region", cells: ["0,0", "0,1"], region_role: "space" });
      const plan = usePlanPalette(computed(() => "site-1"));

      await plan.claimFloorRegion(["0,0", "0,1"]);

      expect(createRegionStub.mutateAsync).toHaveBeenCalledOnce();
    });
  });
});
