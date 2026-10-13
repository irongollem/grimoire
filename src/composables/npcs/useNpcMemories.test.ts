import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
  rpc: vi.fn(),
  touch: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock("@/composables/notes/useDmNote", () => ({ recordDmNoteTouch: mocks.touch }));

const stores = vi.hoisted(() => ({
  ui: { dmPreviewMode: false, dmPreviewPartyMemberId: null as string | null },
  auth: { linkedPartyMemberId: "pm-1" as string | null, user: { id: "u-1" } },
  campaign: { activeCampaignId: "c-1" as string | null },
}));
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => stores.ui }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => stores.auth }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => stores.campaign }));

import { useCreateNpcMemory, useMyNpcMemories, useNpcMemories } from "./useNpcMemories";

function run<T>(use: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let result!: T;
  const Host = defineComponent({
    setup() {
      result = use();
      return () => null;
    },
  });
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } });
  return { client, result: () => result };
}

describe("npc memories", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    stores.ui.dmPreviewMode = false;
    stores.auth.linkedPartyMemberId = "pm-1";
    mocks.from.mockReturnValue({ select: mocks.select, insert: mocks.insert });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.insert.mockReturnValue({ select: () => ({ single: mocks.single }) });
  });

  it("reads one NPC's memories oldest first", async () => {
    mocks.order.mockResolvedValue({ data: [{ id: "m1" }], error: null });
    const { client, result } = run(() => useNpcMemories("npc-1"));
    await flushPromises();
    expect(mocks.from).toHaveBeenCalledWith("npc_memories");
    expect(mocks.eq).toHaveBeenCalledWith("npc_id", "npc-1");
    expect(mocks.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(result().data.value).toEqual([{ id: "m1" }]);
    expect(client.getQueryCache().find({ queryKey: ["npc-memories", "npc-1"] })).toBeDefined();
  });

  it("throws the read error instead of reporting no memories", async () => {
    mocks.order.mockResolvedValue({ data: null, error: new Error("denied") });
    const { result } = run(() => useNpcMemories("npc-1"));
    await flushPromises();
    expect(result().error.value?.message).toBe("denied");
  });

  it("does not fetch without an NPC", async () => {
    run(() => useNpcMemories(null));
    await flushPromises();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("reads a player's memories through the RPC for the linked party member, never the table", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id: "m1" }], error: null });
    const { result } = run(() => useMyNpcMemories("npc-1"));
    await flushPromises();
    expect(mocks.rpc).toHaveBeenCalledWith("get_player_npc_memories", { p_npc_id: "npc-1", p_party_member_id: "pm-1" });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(result().data.value).toEqual([{ id: "m1" }]);
  });

  it("throws the player read's error", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("Not authorized") });
    const { result } = run(() => useMyNpcMemories("npc-1"));
    await flushPromises();
    expect(result().error.value?.message).toBe("Not authorized");
  });

  it("uses the previewed member in DM preview and waits without one", async () => {
    stores.ui.dmPreviewMode = true;
    stores.ui.dmPreviewPartyMemberId = null;
    run(() => useMyNpcMemories("npc-1"));
    await flushPromises();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("inserts without campaign_id or user_id and touches the NPC", async () => {
    mocks.single.mockResolvedValue({ data: { id: "m1", npc_id: "npc-1" }, error: null });
    const { result } = run(() => useCreateNpcMemory());
    const memory = {
      npc_id: "npc-1",
      kind: "promise" as const,
      body: "Will keep the key safe",
      session_id: null,
      party_member_ids: [],
      player_visible_to: [],
    };
    await result().mutateAsync({ memory, npcLabel: "Mira" });
    expect(mocks.insert).toHaveBeenCalledWith(memory);
    expect(mocks.touch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "npc", id: "npc-1", label: "Mira", campaignId: "c-1", userId: "u-1" }),
    );
  });
});
