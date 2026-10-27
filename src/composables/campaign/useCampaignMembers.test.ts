import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

const session = vi.hoisted(() => ({
  user: { id: "me" } as { id: string } | null,
  activeCampaignId: "c1" as string | null,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: fake.client,
  getCurrentUser: () => session.user,
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get activeCampaignId() { return session.activeCampaignId; } }),
}));

import {
  fetchMyMemberships,
  joinCampaignViaInvite,
  parseJoinResult,
  useCreateCampaignInvite,
  useSetMemberRole,
} from "./useCampaignMembers";

beforeEach(() => {
  fake.reset();
  session.user = { id: "me" };
  session.activeCampaignId = "c1";
});

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

describe("fetchMyMemberships", () => {
  it("returns only the caller's memberships, never another member's row from the same campaign", async () => {
    fake.seed("campaign_members", [
      { id: "m1", campaign_id: "c1", user_id: "me", role: "player" },
      { id: "m2", campaign_id: "c1", user_id: "someone-else", role: "dm" },
      { id: "m3", campaign_id: "c2", user_id: "me", role: "dm" },
    ]);
    const mine = await fetchMyMemberships();
    expect(mine.map((m) => m.campaign_id).sort()).toEqual(["c1", "c2"]);
    expect(mine.find((m) => m.campaign_id === "c1")?.role).toBe("player");
  });
});

describe("joinCampaignViaInvite", () => {
  it("hands the chosen character to the invite, and none when no character is chosen", async () => {
    let seen: Record<string, unknown> = {};
    fake.onRpc("join_campaign_via_invite", (args) => {
      seen = args;
      return { status: "joined", campaign_id: "c1" };
    });
    await joinCampaignViaInvite("tok", "pm1");
    expect(seen).toEqual({ p_token: "tok", p_party_member_id: "pm1" });
    await joinCampaignViaInvite("tok");
    expect(seen).toEqual({ p_token: "tok" });
  });

  it("returns a pending result", async () => {
    fake.onRpc("join_campaign_via_invite", () => ({ status: "pending", campaign_id: "c1", request_id: "r1" }));
    expect(await joinCampaignViaInvite("tok")).toEqual({
      status: "pending",
      campaignId: "c1",
      requestId: "r1",
    });
  });

  it("throws the RPC error, with no retry", async () => {
    fake.onRpc("join_campaign_via_invite", () => ({ status: "joined", campaign_id: "c1" }));
    fake.failNext("join_campaign_via_invite", { code: "PGRST202", message: "nope" });
    await expect(joinCampaignViaInvite("tok", "pm1")).rejects.toMatchObject({ code: "PGRST202" });
    expect(fake.calls.filter((c) => c.target === "join_campaign_via_invite")).toHaveLength(1);
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

  beforeEach(() => {
    fake.seed("campaign_members", [
      { id: "m1", campaign_id: "c1", user_id: "u1", role: "player" },
      { id: "m2", campaign_id: "c1", user_id: "u2", role: "player" },
    ]);
  });

  it("changes the role of the one member named and nothing else about them or anyone else", async () => {
    const { mutation } = run();
    const result = await mutation.mutateAsync({ id: "m1", role: "dm" });
    expect(result).toMatchObject({ id: "m1", role: "dm" });
    expect(fake.rows("campaign_members")).toEqual([
      { id: "m1", campaign_id: "c1", user_id: "u1", role: "dm" },
      { id: "m2", campaign_id: "c1", user_id: "u2", role: "player" },
    ]);
  });

  it("refreshes the roster, the account's memberships and the role-scoped campaign lists", async () => {
    const { mutation, client } = run();
    const keys = [["campaign-members", "c1"], ["my-memberships"], ["campaigns", "dm"]];
    for (const key of keys) client.setQueryData(key, []);
    await mutation.mutateAsync({ id: "m1", role: "dm" });
    expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([true, true, true]);
  });

  it("throws the database's refusal and leaves the role as it was", async () => {
    fake.failNext("campaign_members", { message: "Only the owner can change a role" });
    const { mutation } = run();
    await expect(mutation.mutateAsync({ id: "m1", role: "dm" })).rejects.toMatchObject({
      message: "Only the owner can change a role",
    });
    expect(fake.rows("campaign_members")[0]?.role).toBe("player");
  });
});

describe("useCreateCampaignInvite", () => {
  function run() {
    let mutation!: ReturnType<typeof useCreateCampaignInvite>;
    mount(defineComponent({ setup() { mutation = useCreateCampaignInvite(); return () => null; } }), {
      global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
    });
    return mutation;
  }

  it("files the invite under the active campaign and the signed-in creator", async () => {
    await run().mutateAsync({ label: "Table night" });
    expect(fake.rows("campaign_invites")).toEqual([
      expect.objectContaining({ label: "Table night", campaign_id: "c1", created_by: "me" }),
    ]);
  });

  it("refuses with no active campaign instead of writing an invite to no campaign", async () => {
    session.activeCampaignId = null;
    await expect(run().mutateAsync({ label: "Table night" })).rejects.toThrow("without a campaign");
    expect(fake.rows("campaign_invites")).toEqual([]);
  });

  it("refuses when signed out instead of writing an invite with no creator", async () => {
    session.user = null;
    await expect(run().mutateAsync({ label: "Table night" })).rejects.toThrow("without a signed-in user");
    expect(fake.rows("campaign_invites")).toEqual([]);
  });
});
