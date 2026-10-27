import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const mocks = vi.hoisted(() => ({ touch: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
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

const rpcArgs = () => fake.calls.filter((c) => c.kind === "rpc").map((c) => c.payload);

describe("npc memories", () => {
  beforeEach(() => {
    fake.reset();
    mocks.touch.mockReset();
    stores.ui.dmPreviewMode = false;
    stores.ui.dmPreviewPartyMemberId = null;
    stores.auth.linkedPartyMemberId = "pm-1";
  });

  it("reads one NPC's memories oldest first, and no other NPC's", async () => {
    fake.seed("npc_memories", [
      { id: "late", npc_id: "npc-1", created_at: "2026-02-01" },
      { id: "early", npc_id: "npc-1", created_at: "2026-01-01" },
      { id: "other", npc_id: "npc-2", created_at: "2026-01-01" },
    ]);
    const { result } = run(() => useNpcMemories("npc-1"));
    await flushPromises();
    expect(result().data.value?.map((m) => m.id)).toEqual(["early", "late"]);
  });

  it("throws the read error instead of reporting no memories", async () => {
    fake.failNext("npc_memories", { message: "denied" });
    const { result } = run(() => useNpcMemories("npc-1"));
    await flushPromises();
    expect(result().error.value?.message).toBe("denied");
  });

  it("does not fetch without an NPC", async () => {
    run(() => useNpcMemories(null));
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });

  // #1056: the table's columns name the entity a disclosed [secret] lives in, so a player never reads it.
  it("reads a player's memories through the projection for the linked party member, never the table", async () => {
    fake.seed("npc_memories", [{ id: "m-table", npc_id: "npc-1", secret_entity_id: "loc-secret" }]);
    fake.onRpc("get_player_npc_memories", () => [{ id: "m1" }]);
    const { result } = run(() => useMyNpcMemories("npc-1"));
    await flushPromises();
    expect(rpcArgs()).toEqual([{ p_npc_id: "npc-1", p_party_member_id: "pm-1" }]);
    expect(fake.calls.some((c) => c.kind === "table")).toBe(false);
    expect(result().data.value).toEqual([{ id: "m1" }]);
  });

  it("throws the player read's error", async () => {
    fake.failNext("get_player_npc_memories", { message: "Not authorized" });
    const { result } = run(() => useMyNpcMemories("npc-1"));
    await flushPromises();
    expect(result().error.value?.message).toBe("Not authorized");
  });

  it("reads as the previewed member in DM preview, and waits when none is picked", async () => {
    fake.onRpc("get_player_npc_memories", () => []);
    stores.ui.dmPreviewMode = true;
    stores.ui.dmPreviewPartyMemberId = null;
    const waiting = run(() => useMyNpcMemories("npc-1"));
    await flushPromises();
    expect(fake.calls).toEqual([]);
    expect(waiting.result().error.value).toBeNull();

    stores.ui.dmPreviewPartyMemberId = "pm-9";
    run(() => useMyNpcMemories("npc-1"));
    await flushPromises();
    expect(rpcArgs()).toEqual([{ p_npc_id: "npc-1", p_party_member_id: "pm-9" }]);
  });

  it("inserts without campaign_id or user_id and touches the NPC", async () => {
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
    const [saved] = fake.rows("npc_memories");
    expect(saved).toMatchObject(memory);
    expect(saved).not.toHaveProperty("campaign_id");
    expect(saved).not.toHaveProperty("user_id");
    expect(mocks.touch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "npc", id: "npc-1", label: "Mira", campaignId: "c-1", userId: "u-1" }),
    );
  });
});
