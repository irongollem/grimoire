import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Every mutation must reach three query-key prefixes, not just the location
 * it was called against: the forward `[QUERY_KEY, locationId]` a single
 * `LocationPlacements` panel watches, the reverse `[QUERY_KEY, "entity",
 * kind, id]` a single `EntityPlacements` panel watches, AND the two broader
 * prefixes `[QUERY_KEY, "site"]` (`useSitePlacements`, batched across a
 * site's rooms) and `[QUERY_KEY, "entity", kind]` (`useEntityPlacementsFor`,
 * Dungeon Craft's grid tabs) — both left stale before this fix, since neither
 * key is a member of the two narrow ones already invalidated.
 */

const mocks = vi.hoisted(() => ({ invalidateQueries: vi.fn() }));

vi.mock("@tanstack/vue-query", () => ({
  useQuery: () => ({}),
  useMutation: (config: { mutationFn: unknown; onSuccess: (...args: unknown[]) => void }) => config,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("@/lib/supabase", () => ({ supabase: {}, getCurrentUser: () => ({ id: "dm" }) }));

import {
  useCreateLocationPlacement,
  useUpdateLocationPlacement,
  useUpdateEntityPlacement,
  useDeleteLocationPlacement,
  useDeleteEntityPlacement,
} from "@/composables/locations/useLocationPlacements";
import { ref } from "vue";

function keys() {
  return mocks.invalidateQueries.mock.calls.map((call) => call[0].queryKey);
}

beforeEach(() => {
  mocks.invalidateQueries.mockClear();
});

describe("useLocationPlacements mutations invalidate the batched queries", () => {
  it("useCreateLocationPlacement reaches the site and entity-kind prefixes", () => {
    const mutation = useCreateLocationPlacement() as unknown as {
      onSuccess: (data: unknown, vars: unknown) => void;
    };
    mutation.onSuccess(undefined, { location_id: "room-1", trap_id: "trap-1" });

    expect(keys()).toContainEqual(["location-placements", "room-1"]);
    expect(keys()).toContainEqual(["location-placements", "entity", "trap", "trap-1"]);
    expect(keys()).toContainEqual(["location-placements", "site"]);
    expect(keys()).toContainEqual(["location-placements", "entity", "trap"]);
  });

  it("useUpdateLocationPlacement reaches the site and entity-kind prefixes", () => {
    const mutation = useUpdateLocationPlacement(ref("room-1")) as unknown as {
      onSuccess: (data: unknown) => void;
    };
    mutation.onSuccess({ location_id: "room-1", dungeon_feature_id: "feature-1" });

    expect(keys()).toContainEqual(["location-placements", "site"]);
    expect(keys()).toContainEqual(["location-placements", "entity", "dungeon_feature"]);
  });

  it("useUpdateEntityPlacement reaches the site and entity-kind prefixes", () => {
    const mutation = useUpdateEntityPlacement() as unknown as { onSuccess: (data: unknown) => void };
    mutation.onSuccess({ location_id: "room-2", roll_table_id: "table-1" });

    expect(keys()).toContainEqual(["location-placements", "site"]);
    expect(keys()).toContainEqual(["location-placements", "entity", "roll_table"]);
  });

  it("useDeleteLocationPlacement reaches the site and entity-kind prefixes", () => {
    const mutation = useDeleteLocationPlacement(ref("room-1")) as unknown as {
      onSuccess: (deleted: unknown) => void;
    };
    mutation.onSuccess({ location_id: "room-1", loot_table_id: "loot-1" });

    expect(keys()).toContainEqual(["location-placements", "site"]);
    expect(keys()).toContainEqual(["location-placements", "entity", "loot_table"]);
  });

  it("useDeleteEntityPlacement reaches the site and entity-kind prefixes", () => {
    const mutation = useDeleteEntityPlacement() as unknown as { onSuccess: (deleted: unknown) => void };
    mutation.onSuccess({ location_id: "room-3", trap_id: "trap-2" });

    expect(keys()).toContainEqual(["location-placements", "site"]);
    expect(keys()).toContainEqual(["location-placements", "entity", "trap"]);
  });
});
