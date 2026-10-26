import { describe, expect, it, vi, beforeEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { findMyConnection, usePlayerConnections } from "./usePlayerConnections";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import type { Connection } from "@/types/connections.types";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

function row(over: Partial<Connection>): Connection {
  return {
    source: "link", row_id: "l1", type: "friend", outward: true, other_kind: "party_member", other_id: "pm-1",
    other_name: "Wren", other_image: null, note: null, told: "Old friends", player_visible_to: null,
    ai_provenance: null, role: null, status: null, ...over,
  };
}

function run() {
  let result!: ReturnType<typeof usePlayerConnections>;
  const Host = defineComponent({
    setup() {
      result = usePlayerConnections("npc", "npc-1");
      return () => h("div");
    },
  });
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } });
  return result;
}

describe("usePlayerConnections", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    rpc.mockReset();
  });

  it("reads get_player_connections for the campaign and the previewed member", async () => {
    useCampaignStore().activeCampaignId = "c1";
    const app = useAppUiStore();
    app.dmPreviewMode = true;
    app.dmPreviewPartyMemberId = "pm-9";
    rpc.mockResolvedValue({ data: [row({})], error: null });
    const q = run();
    await flushPromises();
    expect(rpc).toHaveBeenCalledWith("get_player_connections", {
      p_campaign_id: "c1", p_kind: "npc", p_id: "npc-1", p_preview_member_id: "pm-9",
    });
    expect(q.data.value).toHaveLength(1);
  });

  it("passes no preview member for a real player", async () => {
    useCampaignStore().activeCampaignId = "c1";
    rpc.mockResolvedValue({ data: [], error: null });
    run();
    await flushPromises();
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_preview_member_id: null });
  });

  it("surfaces an rpc error rather than an empty list", async () => {
    useCampaignStore().activeCampaignId = "c1";
    rpc.mockResolvedValue({ data: null, error: new Error("denied") });
    const q = run();
    await flushPromises();
    expect(q.isError.value).toBe(true);
  });
});

describe("findMyConnection", () => {
  it("finds the tie to the viewer's own character only", () => {
    const rows = [row({ other_id: "pm-2", row_id: "a" }), row({ other_id: "pm-1", row_id: "b" }), row({ other_kind: "npc", other_id: "pm-1", row_id: "c" })];
    expect(findMyConnection(rows, "pm-1")?.row_id).toBe("b");
    expect(findMyConnection(rows, null)).toBeNull();
    expect(findMyConnection(rows, "pm-3")).toBeNull();
  });
});
