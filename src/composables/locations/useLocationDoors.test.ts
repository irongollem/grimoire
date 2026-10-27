import { beforeEach, describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));

import {
  useCreateLocationDoor,
  useDeleteLocationDoor,
  useLocationDoors,
  useUpdateLocationDoor,
} from "./useLocationDoors";

// The merge of a room's two door directions lives in `lib/locations/doors.ts`
// (see `doors.test.ts`); this covers the reads and writes around it.
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const invalidate = vi.spyOn(client, "invalidateQueries");
const keysOf = () =>
  invalidate.mock.calls.map(([filters]) => (filters !== undefined && typeof filters !== "function" ? filters.queryKey : undefined));


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

beforeEach(() => {
  fake.reset();
  invalidate.mockClear();
});

describe("useLocationDoors", () => {
  it("asks for a room's own outgoing doors plus doors into it that are not one-way", async () => {
    inApp(() => useLocationDoors("room-1"));
    await flushPromises();
    // `or(...)` is not interpreted by the fake, so the request is the property: a one-way door INTO the room is no way out of it.
    const read = fake.calls.find((c) => c.target === "location_doors");
    expect(read?.filters).toContainEqual({
      op: "or",
      column: "",
      value: "from_location_id.eq.room-1,and(to_location_id.eq.room-1,is_one_way.eq.false)",
    });
  });

  it("reads nothing while no room is chosen", async () => {
    inApp(() => useLocationDoors(""));
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });
});

describe("door writes", () => {
  it("creates a door as the signed-in DM and refreshes the room and site door queries", async () => {
    const create = inApp(() => useCreateLocationDoor());
    await create.mutateAsync({ from_location_id: "a", to_location_id: "b" } as Parameters<typeof create.mutateAsync>[0]);
    expect(fake.rows("location_doors")).toMatchObject([{ from_location_id: "a", to_location_id: "b", user_id: "dm-1" }]);
    expect(keysOf()).toEqual([["location-doors"], ["site-doors"]]);
  });

  it("updates one door and no other", async () => {
    fake.seed("location_doors", [{ id: "d1", is_one_way: false }, { id: "d2", is_one_way: false }]);
    const update = inApp(() => useUpdateLocationDoor());
    await update.mutateAsync({ id: "d1", update: { is_one_way: true } });
    expect(fake.rows("location_doors").map((d) => d.is_one_way)).toEqual([true, false]);
  });

  it("deletes one door and no other", async () => {
    fake.seed("location_doors", [{ id: "d1" }, { id: "d2" }]);
    const remove = inApp(() => useDeleteLocationDoor());
    await remove.mutateAsync("d1");
    expect(fake.rows("location_doors").map((d) => d.id)).toEqual(["d2"]);
  });
});
