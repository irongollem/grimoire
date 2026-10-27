import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

const h = vi.hoisted(() => ({
  /** What the guard hands to Sentry through reportAsync. */
  reported: [] as unknown[],
  ring: null as null | ((ring: { campaignId: string; table: string }) => void),
  membership: { party_member_id: "mine" as string | null },
  rows: [] as unknown[],
  /** The open session the guard sees before and after it refreshes. */
  openSession: null as string | null,
  openSessionAfterRefresh: null as string | null,
  refreshMembership: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
  invalidate: vi.fn(),
  replace: vi.fn(),
  clearActiveCampaign: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/lib/campaignLiveSync/reportAsync", () => ({ reportAsync: (p: Promise<unknown>) => void p.catch((e: unknown) => h.reported.push(e)) }));
vi.mock("@/lib/campaignLiveSync/rings", () => ({
  onCampaignRing: (_t: string[], cb: typeof h.ring) => { h.ring = cb; return () => undefined; },
  onCampaignReconcile: () => () => undefined,
  onCampaignJoinFailed: () => () => undefined,
}));
vi.mock("@/lib/safeLocalStorage", () => ({ safeLocalStorage: () => ({ removeItem: () => undefined }) }));
vi.mock("vue-router", () => ({ useRouter: () => ({ replace: h.replace }) }));
vi.mock("@tanstack/vue-query", () => ({
  useQueryClient: () => ({
    getQueryData: (key: readonly unknown[]) =>
      key[0] === "party"
        ? [{ id: "minded", name: "Mira", owner_user_id: "pia" }]
        : [{ user_id: "pia", display_name: "Pia" }],
    invalidateQueries: h.invalidate,
  }),
}));
vi.mock("@/composables/party/useParty", () => ({ partyListQuery: (id: string) => ({ queryKey: ["party", id] }) }));
vi.mock("@/composables/party/useCharacterCaretakers", async () => {
  const { activeHandOvers } = await import("@/lib/player/caretaking");
  const { computed } = await import("vue");
  return {
    useCharacterCaretakers: () => {
      const rows = ref(h.rows as Parameters<typeof activeHandOvers>[0]);
      const openSessionId = ref(h.openSession);
      return {
        rows,
        openSessionId,
        active: computed(() => activeHandOvers(rows.value, openSessionId.value)),
        refresh: () => {
          openSessionId.value = h.openSessionAfterRefresh;
          return Promise.resolve();
        },
      };
    },
  };
});
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ info: h.toastInfo, error: h.toastError }) }));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    user: { id: "me" },
    get membership() { return h.membership; },
    refreshMembership: h.refreshMembership,
  }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: "c1", activeCampaign: { name: "Table" }, clearActiveCampaign: h.clearActiveCampaign }),
}));

import { usePlayerRemovalGuard } from "./usePlayerRemovalGuard";

async function ringOnce() {
  const scope = effectScope();
  scope.run(() => usePlayerRemovalGuard());
  await nextTick();
  h.ring?.({ campaignId: "c1", table: "campaign_members" });
  await vi.waitFor(() => expect(h.refreshMembership.mock.calls.length + h.toastError.mock.calls.length).toBeGreaterThanOrEqual(0));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  scope.stop();
}

/**
 * The campaign's member rows. Other members share the campaign, and I also sit
 * in another campaign, so a read that is not scoped to me and this campaign
 * would find a row that is not mine.
 */
function seat(mine: { party_member_id: string | null } | null) {
  fake.reset();
  fake.seed("campaign_members", [
    { id: "o1", campaign_id: "c1", user_id: "other", party_member_id: "x" },
    { id: "o2", campaign_id: "c2", user_id: "me", party_member_id: "y" },
    ...(mine ? [{ id: "m", campaign_id: "c1", user_id: "me", ...mine }] : []),
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.reported.length = 0;
  h.ring = null;
  h.membership = { party_member_id: "minded" };
  h.rows = [];
  h.openSession = null;
  h.openSessionAfterRefresh = null;
});

describe("usePlayerRemovalGuard", () => {
  it("does nothing while the seat is where it was", async () => {
    seat({ party_member_id: "minded" });
    await ringOnce();
    expect(h.refreshMembership).not.toHaveBeenCalled();
    expect(h.toastInfo).not.toHaveBeenCalled();
  });

  it("follows a seat the server moved and says the character went back", async () => {
    seat({ party_member_id: "mine" });
    h.rows = [{ party_member_id: "minded", caretaker_user_id: "me", session_id: null, revoked_at: "2026-10-14T10:00:00Z" }];
    await ringOnce();
    expect(h.refreshMembership).toHaveBeenCalledWith("c1");
    expect(h.invalidate).toHaveBeenCalledWith({ queryKey: ["party"] });
    expect(h.invalidate).toHaveBeenCalledWith({ queryKey: ["my-characters"] });
    expect(h.toastInfo).toHaveBeenCalledWith("Mira went back to Pia.");
  });

  it("follows a seat I moved myself without a toast while the hand-over is still in force", async () => {
    seat({ party_member_id: "mine" });
    h.rows = [{ party_member_id: "minded", caretaker_user_id: "me", session_id: null, revoked_at: null }];
    await ringOnce();
    expect(h.refreshMembership).toHaveBeenCalled();
    expect(h.toastInfo).not.toHaveBeenCalled();
  });

  it("says nothing about a character that someone else was looking after", async () => {
    seat({ party_member_id: "mine" });
    h.rows = [{ party_member_id: "minded", caretaker_user_id: "someone-else", session_id: null, revoked_at: "2026-10-14T10:00:00Z" }];
    await ringOnce();
    expect(h.toastInfo).not.toHaveBeenCalled();
  });

  it("re-reads the session before judging, so a hand-over its ending lapsed says it went back", async () => {
    seat({ party_member_id: "mine" });
    h.rows = [{ party_member_id: "minded", caretaker_user_id: "me", session_id: "s1", revoked_at: null }];
    h.openSession = "s1";
    h.openSessionAfterRefresh = null;
    await ringOnce();
    expect(h.toastInfo).toHaveBeenCalledWith("Mira went back to Pia.");
  });

  it("still ejects a player whose membership row is gone", async () => {
    seat(null);
    h.replace.mockResolvedValue(undefined);
    await ringOnce();
    expect(h.toastError).toHaveBeenCalled();
    expect(h.clearActiveCampaign).toHaveBeenCalled();
  });

  it("does not eject when it cannot read the membership (a failed read is not 'removed')", async () => {
    seat({ party_member_id: "minded" });
    fake.failNext("campaign_members", { message: "network" });
    await ringOnce();
    expect(h.toastError).not.toHaveBeenCalled();
    expect(h.clearActiveCampaign).not.toHaveBeenCalled();
    expect(h.reported).toHaveLength(1);
  });

  it("ignores a ring from another campaign", async () => {
    seat(null);
    const scope = effectScope();
    scope.run(() => usePlayerRemovalGuard());
    await nextTick();
    h.ring?.({ campaignId: "c2", table: "campaign_members" });
    await new Promise((r) => setTimeout(r, 0));
    scope.stop();
    expect(fake.calls).toEqual([]);
    expect(h.toastError).not.toHaveBeenCalled();
  });
});
