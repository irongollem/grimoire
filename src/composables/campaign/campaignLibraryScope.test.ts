import { describe, expect, it } from "vitest";
import { campaignScopeFilter, isReadOnlyLibraryRow, ownerKnownFor } from "./campaignLibraryScope";

describe("campaignScopeFilter (#590)", () => {
  it("takes any author's campaign rows plus the caller's and the owner's library", () => {
    expect(campaignScopeFilter("c1", "me", "owner")).toBe(
      "campaign_id.eq.c1,and(campaign_id.is.null,user_id.in.(me,owner))",
    );
  });
  it("does not list the caller twice when they own the campaign", () => {
    expect(campaignScopeFilter("c1", "me", "me")).toBe("campaign_id.eq.c1,and(campaign_id.is.null,user_id.in.(me))");
  });
  it("falls back to the caller's library while the owner is unknown", () => {
    expect(campaignScopeFilter("c1", "me", null)).toBe("campaign_id.eq.c1,and(campaign_id.is.null,user_id.in.(me))");
  });
  it("without a campaign reads only the caller's library", () => {
    expect(campaignScopeFilter(null, "me", "owner")).toBe("and(campaign_id.is.null,user_id.eq.me)");
  });
});

describe("isReadOnlyLibraryRow", () => {
  it("flags another account's personal library row only", () => {
    expect(isReadOnlyLibraryRow({ user_id: "owner", campaign_id: null }, "me")).toBe(true);
    expect(isReadOnlyLibraryRow({ user_id: "me", campaign_id: null }, "me")).toBe(false);
    expect(isReadOnlyLibraryRow({ user_id: "owner", campaign_id: "c1" }, "me")).toBe(false);
    expect(isReadOnlyLibraryRow({ user_id: null, campaign_id: null }, "me")).toBe(false);
    expect(isReadOnlyLibraryRow({ user_id: "", campaign_id: null }, "me")).toBe(false);
  });
});

describe("ownerKnownFor (#1138)", () => {
  it("is true only once the store holds the row of the campaign being read", () => {
    expect(ownerKnownFor({ id: "c1" }, "c1")).toBe(true);
    // Row not loaded yet: a read now would go out without the owner and be sent again.
    expect(ownerKnownFor(null, "c1")).toBe(false);
    // The previous campaign's row during a switch: its owner is the wrong one.
    expect(ownerKnownFor({ id: "c0" }, "c1")).toBe(false);
    expect(ownerKnownFor({ id: "c1" }, null)).toBe(false);
  });
});
