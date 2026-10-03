import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMoveParty } from "./useMoveParty";

const mocks = vi.hoisted(() => ({
  setCampaignLocation: vi.fn(),
  confirm: vi.fn(),
  toastError: vi.fn(),
  campaign: { activeCampaignId: "c1" as string | null },
}));

vi.mock("@/composables/campaign/useCampaigns", () => ({
  useSetCampaignLocation: () => ({ mutateAsync: mocks.setCampaignLocation, isPending: { value: false } }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: mocks.toastError, fromError: (e: unknown) => String(e) }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => mocks.campaign }));

const vault = { roomId: "vault", roomName: "The Vault" };

describe("useMoveParty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.campaign.activeCampaignId = "c1";
    mocks.setCampaignLocation.mockResolvedValue(undefined);
  });

  it("moves without asking when reachability makes no claim", async () => {
    const { moveParty } = useMoveParty();
    expect(await moveParty({ ...vault, currentRoomId: null, reachable: null })).toBe(true);
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.setCampaignLocation).toHaveBeenCalledWith({ id: "c1", locationId: "vault" });
  });

  it("moves without asking into a reachable room", async () => {
    const { moveParty } = useMoveParty();
    await moveParty({ ...vault, currentRoomId: "landing", reachable: new Set(["landing", "vault"]) });
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.setCampaignLocation).toHaveBeenCalledOnce();
  });

  // The stuck-in-the-first-room case: the door graph leaving a room out is a
  // question for the DM, never a refusal.
  it("asks before moving into a room no open way leads to, and moves on yes", async () => {
    mocks.confirm.mockResolvedValue(true);
    const { moveParty } = useMoveParty();
    expect(await moveParty({ ...vault, currentRoomId: "landing", reachable: new Set(["landing"]) })).toBe(true);
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(mocks.confirm.mock.calls[0]![0]).toContain("The Vault");
    expect(mocks.setCampaignLocation).toHaveBeenCalledWith({ id: "c1", locationId: "vault" });
  });

  it("leaves the party where it is when the DM declines", async () => {
    mocks.confirm.mockResolvedValue(false);
    const { moveParty } = useMoveParty();
    expect(await moveParty({ ...vault, currentRoomId: "landing", reachable: new Set(["landing"]) })).toBe(false);
    expect(mocks.setCampaignLocation).not.toHaveBeenCalled();
  });

  it("does nothing for the room the party is already in, or with no campaign", async () => {
    const { moveParty } = useMoveParty();
    expect(await moveParty({ ...vault, currentRoomId: "vault", reachable: null })).toBe(false);
    mocks.campaign.activeCampaignId = null;
    expect(await moveParty({ ...vault, currentRoomId: null, reachable: null })).toBe(false);
    expect(mocks.setCampaignLocation).not.toHaveBeenCalled();
  });

  it("reports a failed move as a toast and resolves false", async () => {
    mocks.setCampaignLocation.mockRejectedValue(new Error("nope"));
    const { moveParty } = useMoveParty();
    expect(await moveParty({ ...vault, currentRoomId: null, reachable: null })).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledOnce();
  });
});
