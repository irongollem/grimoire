import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";

const h = vi.hoisted(() => ({
  seatRow: null as { id: string; party_member_id: string | null } | null,
  ring: null as null | ((ring: { campaignId: string; table: string }) => void),
  membership: { party_member_id: "mine" as string | null },
  rows: [] as unknown[],
  refreshMembership: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
  invalidate: vi.fn(),
  replace: vi.fn(),
  clearActiveCampaign: vi.fn(),
}));

vi.mock("@/lib/supabase", () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: h.seatRow, error: null }),
  };
  return { supabase: { from: () => chain } };
});
vi.mock("@/lib/campaignLiveSync/reportAsync", () => ({ reportAsync: (p: Promise<unknown>) => void p }));
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
vi.mock("@/composables/party/useCharacterCaretakers", () => ({
  useCharacterCaretakers: () => ({
    rows: ref(h.rows),
    openSessionId: ref<string | null>(null),
    refetch: () => Promise.resolve(),
  }),
}));
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

beforeEach(() => {
  vi.clearAllMocks();
  h.ring = null;
  h.membership = { party_member_id: "minded" };
  h.rows = [];
});

describe("usePlayerRemovalGuard", () => {
  it("does nothing while the seat is where it was", async () => {
    h.seatRow = { id: "m", party_member_id: "minded" };
    await ringOnce();
    expect(h.refreshMembership).not.toHaveBeenCalled();
    expect(h.toastInfo).not.toHaveBeenCalled();
  });

  it("follows a seat the server moved and says the character went back", async () => {
    h.seatRow = { id: "m", party_member_id: "mine" };
    h.rows = [{ party_member_id: "minded", caretaker_user_id: "me", session_id: null, revoked_at: "2026-10-14T10:00:00Z" }];
    await ringOnce();
    expect(h.refreshMembership).toHaveBeenCalledWith("c1");
    expect(h.invalidate).toHaveBeenCalledWith({ queryKey: ["party"] });
    expect(h.invalidate).toHaveBeenCalledWith({ queryKey: ["my-characters"] });
    expect(h.toastInfo).toHaveBeenCalledWith("Mira went back to Pia.");
  });

  it("follows a seat I moved myself without a toast while the hand-over is still in force", async () => {
    h.seatRow = { id: "m", party_member_id: "mine" };
    h.rows = [{ party_member_id: "minded", caretaker_user_id: "me", session_id: null, revoked_at: null }];
    await ringOnce();
    expect(h.refreshMembership).toHaveBeenCalled();
    expect(h.toastInfo).not.toHaveBeenCalled();
  });

  it("still ejects a player whose membership row is gone", async () => {
    h.seatRow = null;
    h.replace.mockResolvedValue(undefined);
    await ringOnce();
    expect(h.toastError).toHaveBeenCalled();
    expect(h.clearActiveCampaign).toHaveBeenCalled();
  });
});
