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

describe("World ties reads", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fake.reset();
  });

  // The projection answers per campaign, and per viewer for a player.
  const tieIn = (campaign: string, who: string) => ({ source: "link", row_id: `${campaign}:${who}` });

  it("the DM reads the web of the active campaign, filed under the connections root", async () => {
    useCampaignStore().activeCampaignId = "c1";
    fake.onRpc("get_world_ties", (args) => [tieIn(String(args.p_campaign_id), "dm")]);
    const { result, queryClient } = run(() => useWorldTies());
    await flushPromises();
    expect(result.data.value).toEqual([tieIn("c1", "dm")]);
    expect(queryClient.getQueryCache().getAll()[0]?.queryKey).toEqual(["connections", "world", "c1"]);
  });

  it("throws the database's error rather than reading it as an empty web", async () => {
    useCampaignStore().activeCampaignId = "c1";
    fake.failNext("get_world_ties", { message: "denied" });
    const { result } = run(() => useWorldTies());
    await flushPromises();
    expect(result.isError.value).toBe(true);
  });

  it("reads nothing without an active campaign", async () => {
    useCampaignStore().activeCampaignId = null;
    run(() => useWorldTies());
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });

  it("a DM previewing a player reads what that character knows, under a key of their own", async () => {
    useCampaignStore().activeCampaignId = "c1";
    const app = useAppUiStore();
    app.dmPreviewMode = true;
    app.dmPreviewPartyMemberId = "pm-9";
    fake.onRpc("get_player_world_ties", (args) => [tieIn(String(args.p_campaign_id), String(args.p_preview_member_id))]);
    const { result, queryClient } = run(() => usePlayerWorldTies());
    await flushPromises();
    expect(result.data.value).toEqual([tieIn("c1", "pm-9")]);
    expect(queryClient.getQueryCache().getAll()[0]?.queryKey).toEqual(["connections", "world-player", "c1", "pm-9"]);
  });

  it("a real player reads as themself, with no previewed character", async () => {
    useCampaignStore().activeCampaignId = "c1";
    fake.onRpc("get_player_world_ties", (args) => [tieIn(String(args.p_campaign_id), String(args.p_preview_member_id))]);
    const { result } = run(() => usePlayerWorldTies());
    await flushPromises();
    expect(result.data.value).toEqual([tieIn("c1", "null")]);
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
