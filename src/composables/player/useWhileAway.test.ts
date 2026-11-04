import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { PartyMember } from "@/types/party.types";

const { fake, state } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake(), state: { rows: [] as { party_member_id: string }[] } };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "u1" } }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({ useCampaignMembers: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/party/useCharacterCaretakers", () => ({
  useCharacterCaretakers: () => ({
    rows: computed(() => state.rows),
    active: computed(() => []),
    openSessionId: computed(() => null),
  }),
}));

import { useWhileAway } from "@/composables/player/useWhileAway";

const member = { id: "m1", name: "Aria", owner_user_id: "u1" } as PartyMember;

describe("useWhileAway", () => {
  function run() {
    let api!: ReturnType<typeof useWhileAway>;
    mount(defineComponent({ setup() { api = useWhileAway("c1", member); return () => null; } }), {
      global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
    });
    return api;
  }
  const sessionReads = () => fake.calls.filter((c) => c.target === "get_player_sessions");

  beforeEach(() => {
    fake.reset();
    state.rows = [];
    fake.onRpc("get_player_sessions", () => []);
  });

  it("does not read the sessions when the character was never handed over", async () => {
    const api = run();
    await flushPromises();
    expect(sessionReads()).toHaveLength(0);
    expect(api.away.value).toBeNull();
  });

  it("does not read the sessions for a hand-over of someone else's character", async () => {
    state.rows = [{ party_member_id: "other" }];
    run();
    await flushPromises();
    expect(sessionReads()).toHaveLength(0);
  });

  it("reads the sessions once this character has a hand-over", async () => {
    state.rows = [{ party_member_id: "m1" }];
    run();
    await flushPromises();
    expect(sessionReads()).toHaveLength(1);
  });
});
