import { describe, it, expect, beforeEach, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const activeCampaignId = ref<string | null>("campaign-1");
const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

// `storeToRefs` only picks up a property that is itself a ref, so the mock
// hands the ref straight through.
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId }) }));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

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

type Row = { kind: string; id: string; title: string; quest_id: null; quest_title: null };
const row = (kind: string, id: string, title: string): Row => ({ kind, id, title, quest_id: null, quest_title: null });

/** The index answers per (campaign, target), so a swapped or stale argument shows up as the wrong list. */
function answerFor(campaignId: string, targetId: string, rows: Row[]) {
  fake.onRpc("get_entity_backlinks", (args) =>
    args.p_campaign_id === campaignId && args.p_target_id === targetId ? rows : [row("note", "wrong", "Wrong scope")],
  );
}

describe("useEntityBacklinks", () => {
  beforeEach(() => {
    fake.reset();
    activeCampaignId.value = "campaign-1";
  });

  it("lists the active campaign's mentions of the entity, notes before NPCs, then by title", async () => {
    answerFor("campaign-1", "npc-1", [row("npc", "x2", "Odric"), row("note", "n2", "Zeta"), row("note", "n1", "Alpha")]);
    const { result, unmount } = withQueryClient(() => useEntityBacklinks("npc-1"));
    await flushPromises();
    expect(result.data.value?.map((b) => b.title)).toEqual(["Alpha", "Zeta", "Odric"]);
    unmount();
  });

  it.each([
    ["no campaign", null, "npc-1", undefined],
    ["no entity", "campaign-1", null, undefined],
    ["the caller holding it back", "campaign-1", "npc-1", () => false],
  ])("sends nothing with %s", async (_label, campaign, entity, enabled) => {
    activeCampaignId.value = campaign;
    const { result, unmount } = withQueryClient(() => useEntityBacklinks(entity, enabled));
    await flushPromises();
    expect(fake.calls).toEqual([]);
    expect(result.isError.value).toBe(false);
    unmount();
  });

  it("surfaces a failed read as an error, not as 'mentioned nowhere'", async () => {
    fake.onRpc("get_entity_backlinks", () => []);
    fake.failNext("get_entity_backlinks", { message: "permission denied" });
    const { result, unmount } = withQueryClient(() => useEntityBacklinks("npc-1"));
    await flushPromises();
    expect(result.isError.value).toBe(true);
    unmount();
  });
});
