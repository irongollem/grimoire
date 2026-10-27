import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, ref } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises } from "@vue/test-utils";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ activeCampaignId: "camp-1" as string | null, linkedPartyMemberId: "pm-1" as string | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get activeCampaignId() { return session.activeCampaignId; } }),
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ get linkedPartyMemberId() { return session.linkedPartyMemberId; } }),
}));

import { PLAYER_HANDOUTS_KEY, PLAYER_NOTICE_BOARDS_KEY } from "@/lib/campaignLiveSync/registry";
import { QUESTS_KEY } from "@/composables/quests/useQuests";
import {
  fetchPlayerNoticeBoards,
  takeNoticeBoardPin,
  usePlayerNoticeBoards,
  usePlayerNoticeBoard,
  usePresentedNoticeBoard,
  useTakeNoticePin,
} from "./usePlayerNoticeBoards";

function mountWith<T>(setup: () => T, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })): T {
  let out!: T;
  const app = createApp(defineComponent({ setup() { out = setup(); return () => h("div"); } }));
  app.use(VueQueryPlugin, { queryClient: qc });
  app.mount(document.createElement("div"));
  return out;
}

const boards = [
  { id: "b1", name: "The Rusty Flagon's board", presented_at: null, pins: [] },
  { id: "b2", name: "Guildhall", presented_at: "2026-01-01T00:00:00Z", pins: [] },
];

beforeEach(() => {
  fake.reset();
  session.activeCampaignId = "camp-1";
  session.linkedPartyMemberId = "pm-1";
  fake.onRpc("get_player_notice_boards", () => boards);
});

describe("player notice boards", () => {
  it("throws rather than showing a failed read as a bare wall", async () => {
    fake.failNext("get_player_notice_boards", { message: "not a member" });
    await expect(fetchPlayerNoticeBoards("camp-1")).rejects.toMatchObject({ message: "not a member" });
  });

  it("throws a failed take instead of reporting a taken notice", async () => {
    fake.failNext("take_notice_board_pin", { message: "board is not presented" });
    await expect(takeNoticeBoardPin("pin-grell")).rejects.toMatchObject({ message: "board is not presented" });
  });

  it("reads the boards for a seated character, and for a DM without a seat reads nothing", async () => {
    const seated = mountWith(() => usePlayerNoticeBoards());
    await flushPromises();
    expect(seated.data.value).toEqual(boards);

    fake.calls.length = 0;
    session.linkedPartyMemberId = null;
    const dm = mountWith(() => usePlayerNoticeBoards());
    await flushPromises();
    expect(fake.calls).toEqual([]);
    expect(dm.data.value).toBeUndefined();
  });

  it("finds the one board the DM is presenting, and one board by id", async () => {
    const found = mountWith(() => ({ presented: usePresentedNoticeBoard(), one: usePlayerNoticeBoard(ref("b1")), gone: usePlayerNoticeBoard(ref("b9")) }));
    await flushPromises();
    expect(found.presented.value?.id).toBe("b2");
    expect(found.one.value?.id).toBe("b1");
    expect(found.gone.value).toBeNull();
  });

  it("refreshes the boards, quests and handouts after a take, because a take can grant a quest and a handout", async () => {
    fake.onRpc("take_notice_board_pin", () => ({ outcome: "taken", taken_by_name: "Aria", quest_id: "q1", handout_id: null }));
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    await mountWith(() => useTakeNoticePin(), qc).mutateAsync("pin-grell");
    const rootOf = (filters: unknown): unknown =>
      typeof filters === "object" && filters !== null && "queryKey" in filters && Array.isArray(filters.queryKey) ? filters.queryKey[0] : undefined;
    const roots = invalidate.mock.calls.map(([filters]) => rootOf(filters));
    expect(roots.sort()).toEqual([PLAYER_HANDOUTS_KEY, PLAYER_NOTICE_BOARDS_KEY, QUESTS_KEY].sort());
  });
});
