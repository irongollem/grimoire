import { describe, expect, it } from "vitest";
import {
  canRemoveMember,
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

  it("never leaks raw database text or an em-dash", () => {
    const generic = familyCampaignErrorMessage({ message: "duplicate key value violates constraint" }, "decide");
    expect(generic).toBe("Something went wrong. Please try again.");
    for (const m of ["Not authorized", "Request not found", "Campaign not found"]) {
      expect(familyCampaignErrorMessage({ message: m }, "decide")).not.toContain("—");
      expect(familyCampaignErrorMessage({ message: m }, "remove")).not.toContain("—");
    }
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
});
