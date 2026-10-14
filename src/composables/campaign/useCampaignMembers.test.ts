import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), single: vi.fn(), eq: vi.fn(), update: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => ({
      update: (v: unknown) => {
        mocks.update(v);
        return { eq: (c: string, id: string) => { mocks.eq(c, id); return { select: () => ({ single: mocks.single }) }; } };
      },
    }),
  },
  getCurrentUser: () => null,
}));

import { joinCampaignViaInvite, parseJoinResult, useSetMemberRole } from "./useCampaignMembers";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query";

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

describe("useSetMemberRole", () => {
  function run() {
    let mutation!: ReturnType<typeof useSetMemberRole>;
    const client = new QueryClient();
    mount(defineComponent({ setup() { mutation = useSetMemberRole(); return () => null; } }), {
      global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
    });
    return { mutation, client };
  }

  it("updates only the role, scoped to the row id", async () => {
    mocks.single.mockResolvedValue({ data: { id: "m1", role: "dm" }, error: null });
    const { mutation, client } = run();
    const spy = vi.spyOn(client, "invalidateQueries");
    await mutation.mutateAsync({ id: "m1", role: "dm" });
    expect(mocks.update).toHaveBeenCalledWith({ role: "dm" });
    expect(mocks.eq).toHaveBeenCalledWith("id", "m1");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["campaign-members"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["my-memberships"] });
  });

  it("throws the database's refusal", async () => {
    const refusal = { message: "Only the owner can change a role" };
    mocks.single.mockResolvedValue({ data: null, error: refusal });
    const { mutation } = run();
    await expect(mutation.mutateAsync({ id: "m1", role: "dm" })).rejects.toBe(refusal);
  });
});
