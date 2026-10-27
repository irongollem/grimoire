import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

const stores = vi.hoisted(() => ({
  ui: { dmPreviewMode: false, dmPreviewPartyMemberId: null as string | null },
  auth: { linkedPartyMemberId: "pm-1" as string | null },
  campaign: { activeCampaignId: "c-1" as string | null },
}));
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => stores.ui }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => stores.auth }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => stores.campaign }));
vi.mock("@/composables/npcs/useNpcs", () => ({ PLAYER_NPCS_KEY: "player-npcs" }));

import { useMyNpcRevealMoments, useNpcReveals } from "./useNpcReveals";

function run() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let query!: ReturnType<typeof useNpcReveals>;
  const Host = defineComponent({
    setup() {
      query = useNpcReveals("npc-1");
      return () => null;
    },
  });
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } });
  return { client, query: () => query };
}

describe("useNpcReveals", () => {
  beforeEach(() => fake.reset());

  it("reads one NPC's reveals keyed by party member, and no other NPC's", async () => {
    fake.seed("npc_reveals", [
      { npc_id: "npc-1", party_member_id: "pm-1", revealed_at: "2026-10-04T10:00:00Z" },
      { npc_id: "npc-2", party_member_id: "pm-2", revealed_at: "2026-10-05T10:00:00Z" },
    ]);
    const { query } = run();
    await flushPromises();
    expect(query().data.value).toEqual(new Map([["pm-1", "2026-10-04T10:00:00Z"]]));
  });

  it("throws the read error instead of reporting no reveals", async () => {
    fake.failNext("npc_reveals", { message: "denied" });
    const { query } = run();
    await flushPromises();
    expect(query().isError.value).toBe(true);
    expect(query().error.value?.message).toBe("denied");
  });
});

describe("useMyNpcRevealMoments", () => {
  function runMine() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let query!: ReturnType<typeof useMyNpcRevealMoments>;
    const Host = defineComponent({
      setup() {
        query = useMyNpcRevealMoments();
        return () => null;
      },
    });
    mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } });
    return { client, query: () => query };
  }

  beforeEach(() => {
    fake.reset();
    stores.ui.dmPreviewMode = false;
    stores.ui.dmPreviewPartyMemberId = null;
    stores.auth.linkedPartyMemberId = "pm-1";
    stores.campaign.activeCampaignId = "c-1";
  });

  const reveal = (campaign: string, member: string, npc: string, at: string, session: string) => ({
    campaign_id: campaign, party_member_id: member, npc_id: npc, revealed_at: at, session_id: session,
  });

  it("keeps the earliest meeting per NPC for the player's own character in this campaign, and no one else's", async () => {
    fake.seed("npc_reveals", [
      reveal("c-1", "pm-1", "n1", "2026-10-05T10:00:00Z", "s2"),
      reveal("c-1", "pm-1", "n1", "2026-10-04T10:00:00Z", "s1"),
      // Earlier than both, but another character's and another campaign's: neither may count.
      reveal("c-1", "pm-2", "n1", "2026-10-01T10:00:00Z", "s0"),
      reveal("c-2", "pm-1", "n1", "2026-10-02T10:00:00Z", "s-other"),
      reveal("c-2", "pm-1", "n9", "2026-10-02T10:00:00Z", "s-other"),
    ]);
    const { client, query } = runMine();
    await flushPromises();
    expect(query().data.value).toEqual(
      new Map([["n1", { revealed_at: "2026-10-04T10:00:00Z", session_id: "s1" }]]),
    );
    // Under the player-npcs root so the npcs_player doorbell refreshes it.
    expect(client.getQueryCache().find({ queryKey: ["player-npcs", "c-1", "reveals", "pm-1"] })).toBeDefined();
  });

  it("reads as the previewed member in DM preview", async () => {
    fake.seed("npc_reveals", [
      reveal("c-1", "pm-1", "n1", "2026-10-04T10:00:00Z", "s1"),
      reveal("c-1", "pm-7", "n2", "2026-10-06T10:00:00Z", "s3"),
    ]);
    stores.ui.dmPreviewMode = true;
    stores.ui.dmPreviewPartyMemberId = "pm-7";
    const { query } = runMine();
    await flushPromises();
    expect([...query().data.value!.keys()]).toEqual(["n2"]);
  });

  it("does not fetch without a member", async () => {
    stores.auth.linkedPartyMemberId = null;
    const { query } = runMine();
    await flushPromises();
    expect(fake.calls).toEqual([]);
    expect(query().error.value).toBeNull();
  });
});
