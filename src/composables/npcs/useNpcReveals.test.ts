import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));

const stores = vi.hoisted(() => ({
  ui: { dmPreviewMode: false, dmPreviewPartyMemberId: null as string | null },
  auth: { linkedPartyMemberId: "pm-1" as string | null },
  campaign: { activeCampaignId: "c-1" as string | null },
}));
vi.mock("@/stores/ui", () => ({ useUiStore: () => stores.ui }));
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
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
  });

  it("reads one NPC's reveals and keys them by party member", async () => {
    mocks.eq.mockResolvedValue({
      data: [{ party_member_id: "pm-1", revealed_at: "2026-10-04T10:00:00Z" }],
      error: null,
    });
    const { client, query } = run();
    await flushPromises();
    expect(mocks.from).toHaveBeenCalledWith("npc_reveals");
    expect(mocks.select).toHaveBeenCalledWith("party_member_id,revealed_at");
    expect(mocks.eq).toHaveBeenCalledWith("npc_id", "npc-1");
    expect(query().data.value).toEqual(new Map([["pm-1", "2026-10-04T10:00:00Z"]]));
    expect(client.getQueryCache().find({ queryKey: ["npc-reveals", "npc-1"] })).toBeDefined();
  });

  it("throws the read error instead of reporting no reveals", async () => {
    mocks.eq.mockResolvedValue({ data: null, error: new Error("denied") });
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
    for (const mock of Object.values(mocks)) mock.mockReset();
    stores.ui.dmPreviewMode = false;
    stores.ui.dmPreviewPartyMemberId = null;
    stores.auth.linkedPartyMemberId = "pm-1";
    const second = vi.fn();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ eq: second });
    second.mockResolvedValue({
      data: [
        { npc_id: "n1", revealed_at: "2026-10-05T10:00:00Z" },
        { npc_id: "n1", revealed_at: "2026-10-04T10:00:00Z" },
      ],
      error: null,
    });
  });

  it("scopes by campaign and the player's own member and keeps the earliest per NPC", async () => {
    const { client, query } = runMine();
    await flushPromises();
    expect(mocks.eq).toHaveBeenCalledWith("campaign_id", "c-1");
    expect(query().data.value).toEqual(new Map([["n1", "2026-10-04T10:00:00Z"]]));
    // Under the player-npcs root so the npcs_player doorbell refreshes it.
    expect(client.getQueryCache().find({ queryKey: ["player-npcs", "c-1", "reveals", "pm-1"] })).toBeDefined();
  });

  it("does not fetch without a member", async () => {
    stores.auth.linkedPartyMemberId = null;
    runMine();
    await flushPromises();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
