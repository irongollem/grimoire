import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { NO_DOOR_STATES } from "@/lib/battlemap/occlusion";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { useMapDoors } from "./useMapDoors";

function setup(campaignId: string | null, placeId: string | null) {
  const cid = ref(campaignId);
  const pid = ref(placeId);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let api!: ReturnType<typeof useMapDoors>;
  mount(
    defineComponent({
      setup() {
        api = useMapDoors(cid, pid);
        return () => null;
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return { api, queryClient };
}

beforeEach(() => fake.reset());

describe("useMapDoors", () => {
  it("reads only this campaign's row for this place", async () => {
    fake.seed("map_memory", [
      { campaign_id: "c1", location_id: "p1", door_states: [{ id: "1,1:N", open: true }] },
      { campaign_id: "c1", location_id: "p2", door_states: [{ id: "9,9:N", open: true }] },
      { campaign_id: "c2", location_id: "p1", door_states: [{ id: "8,8:N", open: true }] },
    ]);
    const { api } = setup("c1", "p1");
    await flushPromises();
    expect(api.doorStates.value).toEqual([{ id: "1,1:N", open: true }]);
  });

  it("is the shared empty list when no row exists, and reads nothing while the place is unknown", async () => {
    const { api } = setup("c1", "p1");
    await flushPromises();
    expect(api.doorStates.value).toBe(NO_DOOR_STATES);
    fake.reset();
    setup("c1", null);
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });

  it("throws a failed read instead of showing it as no doors", async () => {
    fake.failNext("map_memory", { message: "boom", code: "XX000" });
    const { queryClient } = setup("c1", "p1");
    await flushPromises();
    expect(queryClient.getQueryState(["map-doors", "c1", "p1"])?.status).toBe("error");
  });

  it("keeps the previous array when a re-read brings the same doors", async () => {
    fake.seed("map_memory", [{ campaign_id: "c1", location_id: "p1", door_states: [{ id: "1,1:N", open: true }] }]);
    const { api, queryClient } = setup("c1", "p1");
    await flushPromises();
    const before = api.doorStates.value;
    await queryClient.invalidateQueries({ queryKey: ["map-doors", "c1", "p1"] });
    await flushPromises();
    expect(api.doorStates.value).toBe(before);
  });

  it("shows a door at once, calls the RPC with the ids, and takes the server's list", async () => {
    let answer!: (v: unknown) => void;
    fake.onRpc("set_map_door", () => new Promise((resolve) => (answer = resolve)));
    const { api } = setup("c1", "p1");
    await flushPromises();
    const done = api.setDoor("2,2:N", true);
    await flushPromises();
    expect(api.doorStates.value).toEqual([{ id: "2,2:N", open: true }]);
    answer([{ id: "2,2:N", open: true }, { id: "5,5:E", open: false }]);
    await done;
    expect(fake.calls.filter((c) => c.kind === "rpc")[0].payload).toEqual({ p_campaign_id: "c1", p_location_id: "p1", p_door_id: "2,2:N", p_open: true });
    expect(api.doorStates.value).toEqual([{ id: "2,2:N", open: true }, { id: "5,5:E", open: false }]);
  });

  it("replaces an earlier override of the same door in the optimistic list", async () => {
    fake.seed("map_memory", [{ campaign_id: "c1", location_id: "p1", door_states: [{ id: "2,2:N", open: true }] }]);
    fake.onRpc("set_map_door", () => new Promise(() => undefined));
    const { api } = setup("c1", "p1");
    await flushPromises();
    void api.setDoor("2,2:N", false);
    await flushPromises();
    expect(api.doorStates.value).toEqual([{ id: "2,2:N", open: false }]);
  });

  it("reads the row again and throws when the write is refused", async () => {
    fake.seed("map_memory", [{ campaign_id: "c1", location_id: "p1", door_states: [] }]);
    fake.failNext("set_map_door", { message: "Not authorized", code: "42501" });
    const { api } = setup("c1", "p1");
    await flushPromises();
    await expect(api.setDoor("2,2:N", true)).rejects.toMatchObject({ code: "42501" });
    await flushPromises();
    expect(api.doorStates.value).toBe(NO_DOOR_STATES);
  });

  it("refuses to write without a place", async () => {
    const { api } = setup("c1", null);
    await expect(api.setDoor("2,2:N", true)).rejects.toThrow(/without a campaign and a place/);
  });
});
