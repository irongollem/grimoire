import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { usePreparedEncounters } from "./usePreparedEncounters";

function setup(roomId: string | null) {
  const cid = ref<string | null>("c1");
  const rid = ref(roomId);
  let api!: ReturnType<typeof usePreparedEncounters>;
  mount(
    defineComponent({
      setup() {
        api = usePreparedEncounters(cid, rid);
        return () => null;
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  );
  return api;
}

beforeEach(() => fake.reset());

describe("usePreparedEncounters", () => {
  it("offers only this room's unfinished encounters that have never been run", async () => {
    fake.seed("encounters", [
      { id: "e1", name: "Ghouls", campaign_id: "c1", location_id: "crypt", is_finished: false },
      { id: "e2", name: "Done", campaign_id: "c1", location_id: "crypt", is_finished: true },
      { id: "e3", name: "Already run", campaign_id: "c1", location_id: "crypt", is_finished: false },
      { id: "e4", name: "Elsewhere", campaign_id: "c1", location_id: "hall", is_finished: false },
      { id: "e5", name: "Other campaign", campaign_id: "c2", location_id: "crypt", is_finished: false },
    ]);
    fake.seed("encounter_state", [{ encounter_id: "e3", campaign_id: "c1" }]);
    const api = setup("crypt");
    await flushPromises();
    expect(api.prepared.value).toEqual([{ id: "e1", name: "Ghouls" }]);
  });

  it("reads nothing while the party is in no room", async () => {
    fake.seed("encounters", [{ id: "e1", name: "Ghouls", campaign_id: "c1", location_id: "crypt", is_finished: false }]);
    const api = setup(null);
    await flushPromises();
    expect(api.prepared.value).toEqual([]);
  });
});
