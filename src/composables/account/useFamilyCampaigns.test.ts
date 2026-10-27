import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const auth = vi.hoisted(() => ({ user: { id: "parent-1" } as { id: string } | null }));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => auth }));

import {
  canRemoveMember,
  useDecideJoinRequest,
  useFamilyCampaigns,
  useRemoveFromFamilyCampaign,
  decisionMessage,
  familyCampaignErrorMessage,
  parseFamilyCampaigns,
  type FamilyCampaign,
  type FamilyCampaignMember,
  type FamilyJoinRequest,
} from "./useFamilyCampaigns";

const member = (over: Partial<FamilyCampaignMember> = {}): FamilyCampaignMember => ({
  userId: "u1", displayName: "Kit", role: "player", isOwner: false, isYoungPlayer: false, isYou: false, ...over,
});
const campaign = (over: Partial<FamilyCampaign> = {}): FamilyCampaign => ({
  campaignId: "c1", name: "Ashen Vale", childRole: "player", childRunsIt: false, members: [], ...over,
});
const request = (over: Partial<FamilyJoinRequest> = {}): FamilyJoinRequest => ({
  requestId: "r1", campaignId: "c1", campaignName: "Ashen Vale", joinerUserId: "j", joinerName: "Jo",
  joinerIsYoungPlayer: false, childUserId: "k", kind: "child_joining", dmName: "Sam",
  waitingOnOtherParent: false, createdAt: "2026-09-29T10:00:00Z", ...over,
});

const rawRequest = {
  request_id: "r1", campaign_id: "c1", campaign_name: "Ashen Vale", joiner_user_id: "j", joiner_name: "Jo",
  joiner_is_young_player: true, child_user_id: "k", kind: "joining_child_campaign", dm_name: "Kit",
  waiting_on_other_parent: false, created_at: "2026-09-29T10:00:00Z",
};

describe("parseFamilyCampaigns", () => {
  it("maps the RPC's snake_case shape", () => {
    const parsed = parseFamilyCampaigns({
      children: [{
        child_user_id: "k",
        campaigns: [{
          campaign_id: "c1", name: "Ashen Vale", child_role: "player", child_runs_it: false,
          members: [{ user_id: "u1", display_name: "Sam", role: "dm", is_owner: true, is_young_player: false, is_you: false }],
        }],
      }],
      requests: [rawRequest],
    });
    expect(parsed.children[0].campaigns[0].members[0]).toMatchObject({ displayName: "Sam", isOwner: true });
    expect(parsed.requests[0]).toMatchObject({ kind: "joining_child_campaign", joinerIsYoungPlayer: true });
  });

  it("accepts a request whose DM has no name at their own table, rather than failing the whole page", () => {
    const parsed = parseFamilyCampaigns({ children: [], requests: [{ ...rawRequest, dm_name: null }] });
    expect(parsed.requests[0].dmName).toBeNull();
  });

  it("accepts empty lists", () => {
    expect(parseFamilyCampaigns({ children: [], requests: [] })).toEqual({ children: [], requests: [] });
  });

  it("throws on a missing list, an unknown kind and a wrong field type", () => {
    expect(() => parseFamilyCampaigns(null)).toThrow();
    expect(() => parseFamilyCampaigns({ children: [] })).toThrow();
    expect(() => parseFamilyCampaigns({ children: [], requests: [{ ...rawRequest, kind: "other" }] })).toThrow();
    expect(() => parseFamilyCampaigns({ children: [], requests: [{ ...rawRequest, waiting_on_other_parent: "no" }] })).toThrow();
  });
});

describe("familyCampaignErrorMessage", () => {
  it("maps the RPC raise messages to plain copy", () => {
    expect(familyCampaignErrorMessage({ message: "Request not found" }, "decide")).toContain("gone");
    expect(familyCampaignErrorMessage({ message: "Not authorized" }, "decide")).toContain("isn't yours");
    expect(familyCampaignErrorMessage({ message: "The campaign's owner cannot be removed" }, "remove")).toContain("can't be removed");
  });

  it("words 'Not authorized' for what the parent was doing", () => {
    expect(familyCampaignErrorMessage({ message: "Not authorized" }, "remove")).toContain("can't remove");
    expect(familyCampaignErrorMessage({ message: "Not authorized" }, "remove")).not.toContain("decide");
  });

  it("never leaks raw database text", () => {
    const generic = familyCampaignErrorMessage({ message: "duplicate key value violates constraint" }, "decide");
    expect(generic).toBe("Something went wrong. Please try again.");
  });
});

describe("canRemoveMember", () => {
  it("never offers the owner", () => {
    expect(canRemoveMember(campaign({ childRunsIt: true }), member({ isOwner: true, userId: "k" }), "k")).toBe(false);
  });
  it("offers the child themself at a table they don't run", () => {
    expect(canRemoveMember(campaign(), member({ userId: "k" }), "k")).toBe(true);
  });
  it("offers others only at a table the child runs", () => {
    expect(canRemoveMember(campaign(), member({ userId: "other" }), "k")).toBe(false);
    expect(canRemoveMember(campaign({ childRunsIt: true }), member({ userId: "other" }), "k")).toBe(true);
  });
});

describe("decisionMessage", () => {
  it("names each outcome", () => {
    expect(decisionMessage("declined", request())).toBe("Request declined.");
    expect(decisionMessage("pending", request())).toBe("Waiting for the other parent.");
    expect(decisionMessage("joined", request({ kind: "joining_child_campaign", dmName: "Kit" }))).toBe(
      "Jo can now join Kit's table.",
    );
    expect(decisionMessage("joined", request())).toBe("Jo can now join Ashen Vale.");
  });

  it("names the campaign when the DM has no name at their own table", () => {
    expect(decisionMessage("joined", request({ kind: "joining_child_campaign", dmName: null }))).toBe(
      "Jo can now join Ashen Vale.",
    );
  });
});

describe("the parent's reads and answers", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
const keysOf = () =>
  invalidate.mock.calls.map(([filters]) => (filters !== undefined && typeof filters !== "function" ? filters.queryKey : undefined));

  function inApp<T>(setup: () => T): T {
    let out!: T;
    mount(defineComponent({ setup() { out = setup(); return () => h("div"); } }), { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } });
    return out;
  }

  beforeEach(() => {
    fake.reset();
    client.clear();
    invalidate.mockClear();
    auth.user = { id: "parent-1" };
  });

  it("lists the requests waiting on the parent and the tables each child is at", async () => {
    fake.onRpc("get_family_campaigns", () => ({
      children: [{ child_user_id: "k", campaigns: [{ campaign_id: "c1", name: "Ashen Vale", child_role: "player", child_runs_it: false, members: [] }] }],
      requests: [rawRequest],
    }));
    const q = inApp(() => useFamilyCampaigns());
    await vi.waitFor(() => expect(q.requests.value).toHaveLength(1));
    expect(q.tablesByChild.value.get("k")?.[0]?.name).toBe("Ashen Vale");
  });

  it("reports a malformed answer as an error rather than a half-empty page", async () => {
    fake.onRpc("get_family_campaigns", () => ({ children: [] }));
    const q = inApp(() => useFamilyCampaigns());
    await vi.waitFor(() => expect(q.error.value).not.toBeNull());
    expect(q.requests.value).toEqual([]);
  });

  it("reads nothing for a signed-out visitor", () => {
    auth.user = null;
    inApp(() => useFamilyCampaigns());
    expect(fake.calls).toEqual([]);
  });

  it("answers a request with the decision the server made, and refreshes the page either way", async () => {
    fake.onRpc("decide_campaign_join_request", (args) => (args.p_approve === true ? "pending" : "declined"));
    const decide = inApp(() => useDecideJoinRequest());
    expect(await decide.mutateAsync({ requestId: "r1", approve: true })).toBe("pending");
    expect(await decide.mutateAsync({ requestId: "r1", approve: false })).toBe("declined");
    expect(keysOf()).toContainEqual(["family-campaigns"]);
  });

  it("an answer that is not a decision is an error", async () => {
    fake.onRpc("decide_campaign_join_request", () => "maybe");
    const decide = inApp(() => useDecideJoinRequest());
    await expect(decide.mutateAsync({ requestId: "r1", approve: true })).rejects.toThrow(/Unexpected response/);
  });

  it("a refused answer reaches the caller and still refreshes the page", async () => {
    fake.failNext("decide_campaign_join_request", { message: "Not authorized" });
    const decide = inApp(() => useDecideJoinRequest());
    await expect(decide.mutateAsync({ requestId: "r1", approve: true })).rejects.toMatchObject({ message: "Not authorized" });
    expect(invalidate).toHaveBeenCalled();
  });

  it("removing a member reports the server's refusal and refreshes the page", async () => {
    fake.onRpc("remove_from_family_campaign", () => null);
    const remove = inApp(() => useRemoveFromFamilyCampaign());
    await expect(remove.mutateAsync({ campaignId: "c1", userId: "u9" })).resolves.toBeUndefined();
    fake.failNext("remove_from_family_campaign", { message: "The campaign's owner cannot be removed" });
    await expect(remove.mutateAsync({ campaignId: "c1", userId: "u1" })).rejects.toMatchObject({
      message: "The campaign's owner cannot be removed",
    });
    expect(invalidate.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
