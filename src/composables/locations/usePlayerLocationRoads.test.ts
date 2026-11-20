import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { usePlayerLocationRoads } from "./usePlayerLocationRoads";
import { useCampaignStore } from "@/stores/campaign";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

function run<T>(use: () => T) {
  let result!: T;
  const Host = defineComponent({
    setup() {
      result = use();
      return () => h("div");
    },
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
  return { result, queryClient };
}

describe("usePlayerLocationRoads", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fake.reset();
    useCampaignStore().activeCampaignId = "c1";
  });

  // Bug caught: an error read as "no roads", so a failed read looked like a world with none.
  it("throws the database's error rather than reading it as no roads", async () => {
    fake.failNext("get_player_roads", { message: "denied" });
    const { result } = run(() => usePlayerLocationRoads());
    await flushPromises();
    expect(result.isError.value).toBe(true);
  });

  // Bug caught: the DM's encounter table leaking to players, or numeric distance left a string.
  it("maps a row to a road with a numeric distance, no encounter table and the difficult flag", async () => {
    fake.onRpc("get_player_roads", () => [
      { id: "r1", from_location_id: "a", to_location_id: "b", distance: "40", unit: "mi", name: "", going: "road", difficult: true },
    ]);
    const { result, queryClient } = run(() => usePlayerLocationRoads());
    await flushPromises();
    expect(result.data.value).toEqual([
      { id: "r1", from_location_id: "a", to_location_id: "b", distance: 40, unit: "mi", name: "", going: "road", difficult: true, roll_table_id: null },
    ]);
    expect(queryClient.getQueryCache().getAll()[0]?.queryKey.slice(0, 3)).toEqual(["location-roads", "player", "c1"]);
  });
});
