import { describe, it, expect, beforeEach, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const activeCampaignId = ref<string | null>("campaign-1");
const rpc = vi.fn();

// `storeToRefs` only picks up a property that is itself a ref, so the mock
// hands the ref straight through.
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId }) }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import { backlinkFromRow, useEntityBacklinks } from "./useEntityBacklinks";

function withQueryClient<T>(setup: () => T): { result: T; unmount: () => void } {
  let result!: T;
  const wrapper = mount(
    defineComponent({ setup() { result = setup(); return () => h("div"); } }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  );
  return { result, unmount: () => wrapper.unmount() };
}

describe("backlinkFromRow", () => {
  it("titles and routes each kind the way the list always has", () => {
    expect(backlinkFromRow({ kind: "note", id: "n1", title: "", quest_id: null, quest_title: null }))
      .toEqual({ kind: "note", id: "n1", title: "Untitled note", to: "/notes/n1" });
    expect(backlinkFromRow({ kind: "quest-beat", id: "b1", title: "Ambush", quest_id: "q1", quest_title: null }))
      .toEqual({ kind: "quest-beat", id: "b1", title: "Untitled quest · Ambush", to: "/quests/q1/beats/b1" });
    expect(backlinkFromRow({ kind: "party-member", id: "p1", title: "Nessa", quest_id: null, quest_title: null }).to)
      .toBe("/party/p1");
  });
});

describe("useEntityBacklinks", () => {
  beforeEach(() => {
    rpc.mockReset();
    activeCampaignId.value = "campaign-1";
  });

  it("reads the index in one call and sorts notes before NPCs, then by title", async () => {
    rpc.mockResolvedValue({
      data: [
        { kind: "npc", id: "x2", title: "Odric", quest_id: null, quest_title: null },
        { kind: "note", id: "n2", title: "Zeta", quest_id: null, quest_title: null },
        { kind: "note", id: "n1", title: "Alpha", quest_id: null, quest_title: null },
      ],
      error: null,
    });
    const { result, unmount } = withQueryClient(() => useEntityBacklinks("npc-1"));
    await flushPromises();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_entity_backlinks", { p_campaign_id: "campaign-1", p_target_id: "npc-1" });
    expect(result.data.value?.map((b) => b.title)).toEqual(["Alpha", "Zeta", "Odric"]);
    unmount();
  });

  it("sends nothing without a campaign or an entity", async () => {
    activeCampaignId.value = null;
    const { unmount } = withQueryClient(() => useEntityBacklinks("npc-1"));
    await flushPromises();
    expect(rpc).not.toHaveBeenCalled();
    unmount();
  });

  it("surfaces a failed read as an error, not as 'mentioned nowhere'", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    const { result, unmount } = withQueryClient(() => useEntityBacklinks("npc-1"));
    await flushPromises();
    expect(result.isError.value).toBe(true);
    unmount();
  });
});
