import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc },
  getCurrentUser: () => null,
}));

import { joinCampaignViaInvite, parseJoinResult } from "./useCampaignMembers";

beforeEach(() => mocks.rpc.mockReset());

describe("parseJoinResult", () => {
  it("reads a joined result", () => {
    expect(parseJoinResult({ status: "joined", campaign_id: "c1" })).toEqual({
      status: "joined",
      campaignId: "c1",
    });
  });

  it("reads a pending result with its request id", () => {
    expect(parseJoinResult({ status: "pending", campaign_id: "c1", request_id: "r1" })).toEqual({
      status: "pending",
      campaignId: "c1",
      requestId: "r1",
    });
  });

  it.each([
    ["a bare string", "c1"],
    ["null", null],
    ["an unknown status", { status: "denied", campaign_id: "c1" }],
    ["a missing campaign id", { status: "joined" }],
    ["a pending result without a request id", { status: "pending", campaign_id: "c1" }],
  ])("throws on %s", (_label, value) => {
    expect(() => parseJoinResult(value)).toThrow();
  });
});

describe("joinCampaignViaInvite", () => {
  it("passes the character when one is chosen", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "joined", campaign_id: "c1" }, error: null });
    await joinCampaignViaInvite("tok", "pm1");
    expect(mocks.rpc).toHaveBeenCalledWith("join_campaign_via_invite", {
      p_token: "tok",
      p_party_member_id: "pm1",
    });
  });

  it("returns a pending result", async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: "pending", campaign_id: "c1", request_id: "r1" },
      error: null,
    });
    expect(await joinCampaignViaInvite("tok")).toEqual({
      status: "pending",
      campaignId: "c1",
      requestId: "r1",
    });
  });

  it("throws the RPC error, with no retry", async () => {
    const error = { code: "PGRST202", message: "nope" };
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(joinCampaignViaInvite("tok", "pm1")).rejects.toBe(error);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
