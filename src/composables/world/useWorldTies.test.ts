import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { peopleEntities, usePlayerWorldTies, useWorldTies } from "./useWorldTies";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import type { NpcListRow } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

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

describe("World ties reads", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    rpc.mockReset();
  });

  it("the DM reads get_world_ties for the campaign", async () => {
    useCampaignStore().activeCampaignId = "c1";
    rpc.mockResolvedValue({ data: [{ source: "link" }], error: null });
    const { result, queryClient } = run(() => useWorldTies());
    await flushPromises();
    expect(rpc).toHaveBeenCalledWith("get_world_ties", { p_campaign_id: "c1" });
    expect(result.data.value).toHaveLength(1);
    expect(queryClient.getQueryCache().getAll()[0]?.queryKey).toEqual(["connections", "world", "c1"]);
  });

  it("throws the database's error rather than reading it as an empty web", async () => {
    useCampaignStore().activeCampaignId = "c1";
    rpc.mockResolvedValue({ data: null, error: new Error("denied") });
    const { result } = run(() => useWorldTies());
    await flushPromises();
    expect(result.isError.value).toBe(true);
  });

  it("the player reads get_player_world_ties as the previewed character", async () => {
    useCampaignStore().activeCampaignId = "c1";
    const app = useAppUiStore();
    app.dmPreviewMode = true;
    app.dmPreviewPartyMemberId = "pm-9";
    rpc.mockResolvedValue({ data: [], error: null });
    const { queryClient } = run(() => usePlayerWorldTies());
    await flushPromises();
    expect(rpc).toHaveBeenCalledWith("get_player_world_ties", { p_campaign_id: "c1", p_preview_member_id: "pm-9" });
    expect(queryClient.getQueryCache().getAll()[0]?.queryKey).toEqual(["connections", "world-player", "c1", "pm-9"]);
  });

  it("a real player passes no preview member", async () => {
    useCampaignStore().activeCampaignId = "c1";
    rpc.mockResolvedValue({ data: [], error: null });
    run(() => usePlayerWorldTies());
    await flushPromises();
    expect(rpc.mock.calls[0]?.[1]).toEqual({ p_campaign_id: "c1", p_preview_member_id: null });
  });
});

describe("peopleEntities", () => {
  it("names every NPC and PC by node key, carrying the NPC's attitude", () => {
    const npcs = [{ id: "n1", name: "Harl", portrait_url: "h.png", relationship: "hostile" }] as unknown as NpcListRow[];
    const party = [{ id: "p1", name: "Ilse", portrait_url: null }] as unknown as PartyMember[];
    expect(peopleEntities(npcs, party)).toEqual([
      { key: "npc:n1", kind: "npc", id: "n1", name: "Harl", image: "h.png", attitude: "hostile" },
      { key: "party_member:p1", kind: "party_member", id: "p1", name: "Ilse", image: null, attitude: null },
    ]);
  });
});
