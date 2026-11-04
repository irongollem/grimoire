import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { useMapMemory } from "./useMapMemory";

function setup(campaignId: string | null, placeId: string | null) {
  const cid = ref(campaignId);
  const pid = ref(placeId);
  let api!: ReturnType<typeof useMapMemory>;
  mount(
    defineComponent({
      setup() {
        api = useMapMemory(cid, pid);
        return () => null;
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  );
  return api;
}

beforeEach(() => fake.reset());

describe("useMapMemory", () => {
  it("reads only this campaign's row for this place, not another place's or campaign's", async () => {
    fake.seed("map_memory", [
      { campaign_id: "c1", location_id: "p1", seen: "1,1;2,2" },
      { campaign_id: "c1", location_id: "p2", seen: "9,9" },
      { campaign_id: "c2", location_id: "p1", seen: "8,8" },
    ]);
    const api = setup("c1", "p1");
    await flushPromises();
    expect([...api.memory.value].sort()).toEqual(["1,1", "2,2"]);
  });

  it("is empty when no row exists yet", async () => {
    const api = setup("c1", "p1");
    await flushPromises();
    expect(api.memory.value.size).toBe(0);
  });

  it("reads nothing while the place is unknown", async () => {
    setup("c1", null);
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });

  it("puts the RPC's returned seen into the cache so the writer sees it at once", async () => {
    fake.onRpc("remember_map_cells", () => "3,3;4,4");
    const api = setup("c1", "p1");
    await flushPromises();
    await api.remember(["3,3", "4,4"]);
    expect([...api.memory.value].sort()).toEqual(["3,3", "4,4"]);
  });

  it("sends nothing for an empty remember or hide", async () => {
    const api = setup("c1", "p1");
    await flushPromises();
    await api.remember([]);
    await api.hide(new Set());
    expect(fake.calls.filter((c) => c.kind === "rpc")).toEqual([]);
  });

  it("replaceWith forgets and reveals in one call", async () => {
    fake.onRpc("remember_map_cells", () => "5,5");
    const api = setup("c1", "p1");
    await flushPromises();
    await api.replaceWith(["5,5"]);
    const rpcs = fake.calls.filter((c) => c.kind === "rpc");
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].payload).toMatchObject({ p_forget: true, p_reveal: ["5,5"] });
  });

  it("throws the RPC's error instead of swallowing it", async () => {
    fake.failNext("remember_map_cells", { message: "not the DM", code: "42501" });
    const api = setup("c1", "p1");
    await flushPromises();
    await expect(api.forgetAll()).rejects.toThrow("not the DM");
  });

  it("refuses a write with no place", async () => {
    const api = setup("c1", null);
    await expect(api.remember(["1,1"])).rejects.toThrow(/without a campaign and a place/);
  });
});

// The maintainer, 2 Nov 2026: the fog brush must keep up with the cursor. A stroke asks for a write on every move.
describe("useMapMemory while a brush stroke is under way", () => {
  it("shows a revealed square before the server answers", async () => {
    let answer!: (seen: string) => void;
    fake.onRpc("remember_map_cells", () => new Promise<string>((resolve) => (answer = resolve)));
    const api = setup("c1", "p1");
    await flushPromises();
    const done = api.remember(["1,1"]);
    expect(api.memory.value.has("1,1")).toBe(true);
    answer("1,1");
    await done;
  });

  it("gathers the writes made while one is out into a single next request", async () => {
    const answers: ((seen: string) => void)[] = [];
    fake.onRpc("remember_map_cells", () => new Promise<string>((resolve) => answers.push(resolve)));
    const api = setup("c1", "p1");
    await flushPromises();
    const first = api.remember(["1,1"]);
    const second = api.remember(["2,2"]);
    const third = api.hide(["1,1"]);
    expect(fake.calls.filter((c) => c.kind === "rpc")).toHaveLength(1);
    answers[0]("1,1");
    await first;
    await flushPromises();
    const rpcs = fake.calls.filter((c) => c.kind === "rpc");
    expect(rpcs).toHaveLength(2);
    expect(rpcs[1].payload).toMatchObject({ p_reveal: ["2,2"], p_hide: ["1,1"], p_forget: false });
    answers[1]("2,2");
    await Promise.all([second, third]);
    expect([...api.memory.value]).toEqual(["2,2"]);
  });
});

// #1133 review: one queue served every map, and the writer's own doorbell re-read dropped what was still queued.
describe("useMapMemory per map", () => {
  function setupWith(placeId: string) {
    const cid = ref<string | null>("c1");
    const pid = ref<string | null>(placeId);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let api!: ReturnType<typeof useMapMemory>;
    mount(defineComponent({ setup() { api = useMapMemory(cid, pid); return () => null; } }), {
      global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
    });
    return { api, pid, client };
  }

  it("sends a write for another map at once, with that map's id, while one is out for the first", async () => {
    const answers: ((seen: string) => void)[] = [];
    fake.onRpc("remember_map_cells", () => new Promise<string>((resolve) => answers.push(resolve)));
    const { api, pid } = setupWith("p1");
    await flushPromises();
    const first = api.remember(["1,1"]);
    pid.value = "p2";
    await flushPromises();
    const second = api.remember(["2,2"]);
    const rpcs = fake.calls.filter((c) => c.kind === "rpc");
    expect(rpcs).toHaveLength(2);
    expect(rpcs[1].payload).toMatchObject({ p_location_id: "p2", p_reveal: ["2,2"] });
    answers.forEach((a, i) => a(i === 0 ? "1,1" : "2,2"));
    await Promise.all([first, second]);
  });

  it("a re-read while writes are still out keeps showing their squares", async () => {
    const answers: ((seen: string) => void)[] = [];
    fake.onRpc("remember_map_cells", () => new Promise<string>((resolve) => answers.push(resolve)));
    const { api, client } = setupWith("p1");
    await flushPromises();
    const first = api.remember(["1,1"]);
    const second = api.remember(["2,2"]);
    // The doorbell rings for another tab's write; the server holds neither square yet.
    await client.invalidateQueries({ queryKey: ["map-memory"] });
    await flushPromises();
    expect([...api.memory.value].sort()).toEqual(["1,1", "2,2"]);
    answers[0]("1,1");
    await first;
    await flushPromises();
    answers[1]("1,1;2,2");
    await second;
  });
});
