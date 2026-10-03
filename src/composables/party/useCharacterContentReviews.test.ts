import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import {
  approvalOptions,
  contentKindLabel,
  isApprovalWait,
  isChangedSinceSeen,
  isRemovalOnly,
  pendingReviews,
  reviewReasonText,
  type CharacterContentReview,
} from "./useCharacterContentReviews";

function review(overrides: Partial<CharacterContentReview> = {}): CharacterContentReview {
  return {
    id: "r1",
    campaign_id: "c1",
    party_member_id: "pm1",
    kind: "species",
    ref: "toh_alseid",
    label: "Alseid",
    reason: "source",
    source_slug: "toh",
    source_title: "Tome of Heroes",
    status: "pending",
    decided_by: null,
    decided_at: null,
    created_at: "2026-10-02T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
    ...overrides,
  };
}

describe("pendingReviews", () => {
  it("keeps only the flags that still bench the character", () => {
    const rows = [review({ id: "a" }), review({ id: "b", status: "approved" })];
    expect(pendingReviews(rows).map((row) => row.id)).toEqual(["a"]);
  });

  it("is empty while nothing has loaded", () => {
    expect(pendingReviews(undefined)).toEqual([]);
  });
});

describe("reviewReasonText", () => {
  it("names the book for a choice from one the table has not enabled", () => {
    expect(reviewReasonText(review())).toBe("From Tome of Heroes, which this table has not enabled.");
  });

  it("falls back to the book's key, then to plain words, rather than printing nothing", () => {
    expect(reviewReasonText(review({ source_title: null }))).toBe("From toh, which this table has not enabled.");
    expect(reviewReasonText(review({ source_title: null, source_slug: null })))
      .toBe("From another book, which this table has not enabled.");
  });

  it("says a blocked choice is blocked, the player's own content is theirs, and another table's has to be changed", () => {
    expect(reviewReasonText(review({ reason: "blocked" }))).toBe("This table has blocked it.");
    expect(reviewReasonText(review({ reason: "homebrew" })))
      .toBe("The player's own content, which this table does not have.");
    expect(reviewReasonText(review({ reason: "foreign" })))
      .toBe("Made at another table. It cannot be approved here and has to be changed.");
  });

  it("says something that is not there has to be removed", () => {
    expect(reviewReasonText(review({ reason: "missing" })))
      .toBe("It no longer exists, so it has to be removed from the character.");
  });
});

describe("approvalOptions", () => {
  it("lets the DM allow a book's content for one character, or enable the book", () => {
    expect(approvalOptions(review()).map((option) => [option.scope, option.label])).toEqual([
      ["character", "Allow for this character"],
      ["table", "Enable Tome of Heroes"],
    ]);
  });

  it("lets the DM allow a blocked choice for one character, or lift the block", () => {
    expect(approvalOptions(review({ reason: "blocked" })).map((option) => [option.scope, option.label])).toEqual([
      ["character", "Allow for this character"],
      ["table", "Unblock for the table"],
    ]);
  });

  it("offers one approval for homebrew, and says it makes a copy", () => {
    const [only, ...rest] = approvalOptions(review({ reason: "homebrew" }));
    expect(rest).toEqual([]);
    expect(only.scope).toBe("character");
    expect(only.effect).toContain("copy");
  });

  it("offers nothing for another table's content: it can only be changed", () => {
    expect(approvalOptions(review({ reason: "foreign" }))).toEqual([]);
  });

  it("offers nothing to approve for something that no longer exists: it can only be removed", () => {
    const missing = review({ reason: "missing" });
    expect(approvalOptions(missing)).toEqual([]);
    expect(isRemovalOnly(missing)).toBe(true);
    expect(isRemovalOnly(review())).toBe(false);
  });
});

describe("isApprovalWait", () => {
  it("recognises the refusal to seat a flagged character", () => {
    expect(isApprovalWait({ code: "CR001", message: "This character is waiting for the DM's approval" })).toBe(true);
  });

  it("is false for any other failure", () => {
    expect(isApprovalWait({ code: "RS001" })).toBe(false);
    expect(isApprovalWait(new Error("network down"))).toBe(false);
    expect(isApprovalWait(null)).toBe(false);
  });
});

describe("isChangedSinceSeen", () => {
  it("recognises an approval refused because the player edited the row after the DM opened it", () => {
    expect(isChangedSinceSeen({ code: "CR002" })).toBe(true);
    expect(isChangedSinceSeen({ code: "CR001" })).toBe(false);
    expect(isChangedSinceSeen(undefined)).toBe(false);
  });
});

describe("contentKindLabel", () => {
  it("names each kind of choice", () => {
    expect(contentKindLabel("species")).toBe("Species");
    expect(contentKindLabel("feat")).toBe("Feat");
  });
});
