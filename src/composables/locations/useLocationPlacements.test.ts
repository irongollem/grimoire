import { describe, it, expect, beforeEach, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm" }) }));

import {
  useCreateLocationPlacement,
  useUpdateLocationPlacement,
  useUpdateEntityPlacement,
  useDeleteLocationPlacement,
  useDeleteEntityPlacement,
  useLocationPlacements,
  useEntityPlacements,
} from "@/composables/locations/useLocationPlacements";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const invalidate = vi.spyOn(client, "invalidateQueries");

function inApp<T>(setup: () => T): T {
  let out!: T;
  mount(
    defineComponent({
      setup() {
        out = setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } },
  );
  return out;
}

const placement = (over: Record<string, unknown>) => ({
  id: "p1",
  location_id: "room-1",
  trap_id: null,
  dungeon_feature_id: null,
  roll_table_id: null,
  loot_table_id: null,
  library_trap_id: null,
  library_dungeon_feature_id: null,
  notice_board_id: null,
  note: null,
  sort_order: null,
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

const keys = () =>
  invalidate.mock.calls.map(([filters]) => (filters !== undefined && typeof filters !== "function" ? filters.queryKey : undefined));

beforeEach(() => {
  fake.reset();
  invalidate.mockClear();
});

/**
 * Every write must reach four query-key prefixes, not just the location it was
 * called against: the forward `[…, locationId]` one `LocationPlacements` panel
 * watches, the reverse `[…, "entity", kind, id]` one `EntityPlacements` panel
 * watches, AND the two broader prefixes `[…, "site"]` (`useSitePlacements`,
 * batched across a site's rooms) and `[…, "entity", kind]` (`useEntityPlacementsFor`,
 * Dungeon Craft's grid tabs), which neither narrow key is a member of.
 */
describe("a placement write refreshes the forward, reverse and batched placement queries", () => {
  const cases: [string, Record<string, unknown>, string, string, () => Promise<unknown>][] = [
    ["create", { trap_id: "trap-1" }, "trap", "trap-1", () => inApp(() => useCreateLocationPlacement()).mutateAsync({ location_id: "room-1", trap_id: "trap-1" })],
    ["update from the room", { dungeon_feature_id: "feature-1" }, "dungeon_feature", "feature-1", () => inApp(() => useUpdateLocationPlacement(ref("room-1"))).mutateAsync({ id: "p1", update: { note: "x" } })],
    ["update from the entity page", { roll_table_id: "table-1" }, "roll_table", "table-1", () => inApp(() => useUpdateEntityPlacement()).mutateAsync({ id: "p1", update: { note: "x" } })],
    ["delete from the room", { loot_table_id: "loot-1" }, "loot_table", "loot-1", () => inApp(() => useDeleteLocationPlacement(ref("room-1"))).mutateAsync("p1")],
    ["delete from the entity page", { trap_id: "trap-2" }, "trap", "trap-2", () => inApp(() => useDeleteEntityPlacement()).mutateAsync("p1")],
    ["a library trap", { library_trap_id: "grimoire_hidden_pit" }, "trap", "grimoire_hidden_pit", () => inApp(() => useDeleteEntityPlacement()).mutateAsync("p1")],
    ["a library feature", { library_dungeon_feature_id: "grimoire_secret_door" }, "dungeon_feature", "grimoire_secret_door", () => inApp(() => useDeleteEntityPlacement()).mutateAsync("p1")],
  ];

  it.each(cases)("%s", async (_label, target, kind, entityId, run) => {
    fake.seed("location_placements", [placement(target)]);
    await run();
    expect(keys()).toContainEqual(["location-placements", "room-1"]);
    expect(keys()).toContainEqual(["location-placements", "entity", kind, entityId]);
    expect(keys()).toContainEqual(["location-placements", "site"]);
    expect(keys()).toContainEqual(["location-placements", "entity", kind]);
  });
});

describe("placement writes", () => {
  it("create stores the placement as the signed-in DM", async () => {
    await inApp(() => useCreateLocationPlacement()).mutateAsync({ location_id: "room-1", trap_id: "trap-1" });
    expect(fake.rows("location_placements")).toMatchObject([{ location_id: "room-1", trap_id: "trap-1", user_id: "dm" }]);
  });

  it("update changes one placement's note and no other", async () => {
    fake.seed("location_placements", [placement({ id: "p1", trap_id: "t" }), placement({ id: "p2", trap_id: "t" })]);
    await inApp(() => useUpdateLocationPlacement(ref("room-1"))).mutateAsync({ id: "p1", update: { note: "far end" } });
    expect(fake.rows("location_placements").map((r) => r.note)).toEqual(["far end", null]);
  });

  it("delete unlinks one placement and no other", async () => {
    fake.seed("location_placements", [placement({ id: "p1", trap_id: "t" }), placement({ id: "p2", trap_id: "t" })]);
    await inApp(() => useDeleteLocationPlacement(ref("room-1"))).mutateAsync("p1");
    expect(fake.rows("location_placements").map((r) => r.id)).toEqual(["p2"]);
  });
});

describe("placement reads", () => {
  it("a room's placements are its own, ordered by sort_order with unsorted ones last, and fold a library target into the trap", async () => {
    fake.seed("location_placements", [
      placement({ id: "unsorted", trap_id: "t1", trap: { id: "t1", name: "Pit" } }),
      placement({ id: "second", sort_order: 2, library_trap_id: "grim_pit", trap: null, library_trap: { id: "grim_pit", name: "Library Pit" } }),
      placement({ id: "first", sort_order: 1, dungeon_feature_id: "f1", dungeon_feature: { id: "f1", name: "Lever" } }),
      placement({ id: "lib-feature", sort_order: 3, library_dungeon_feature_id: "grim_door", dungeon_feature: null, library_dungeon_feature: { id: "grim_door", name: "Secret Door" } }),
      placement({ id: "other-room", location_id: "room-2", sort_order: 0, trap_id: "t1" }),
    ]);
    const q = inApp(() => useLocationPlacements("room-1"));
    await vi.waitFor(() => expect(q.data.value).toBeDefined());
    expect(q.data.value?.map((p) => p.id)).toEqual(["first", "second", "lib-feature", "unsorted"]);
    expect(q.data.value?.find((p) => p.id === "second")?.trap?.name).toBe("Library Pit");
    expect(q.data.value?.find((p) => p.id === "lib-feature")?.dungeon_feature?.name).toBe("Secret Door");
  });

  it("an entity's placements are the rooms that hold that very entity", async () => {
    const trap = "11111111-1111-4111-8111-111111111111";
    fake.seed("location_placements", [
      placement({ id: "mine", trap_id: trap }),
      placement({ id: "other-trap", trap_id: "22222222-2222-4222-8222-222222222222" }),
      placement({ id: "library-twin", library_trap_id: trap }),
    ]);
    const q = inApp(() => useEntityPlacements("trap", trap));
    await vi.waitFor(() => expect(q.data.value).toBeDefined());
    expect(q.data.value?.map((p) => p.id)).toEqual(["mine"]);
  });

  it("a library trap is found in the library column, not the uuid one", async () => {
    fake.seed("location_placements", [
      placement({ id: "mine", library_trap_id: "grimoire_pit" }),
      placement({ id: "uuid-trap", trap_id: "grimoire_pit" }),
    ]);
    const q = inApp(() => useEntityPlacements("trap", "grimoire_pit"));
    await vi.waitFor(() => expect(q.data.value).toBeDefined());
    expect(q.data.value?.map((p) => p.id)).toEqual(["mine"]);
  });

  it("reports a failed read rather than an empty room", async () => {
    fake.failNext("location_placements", { message: "boom" });
    const q = inApp(() => useLocationPlacements("room-1"));
    await vi.waitFor(() => expect(q.isError.value).toBe(true));
  });
});
