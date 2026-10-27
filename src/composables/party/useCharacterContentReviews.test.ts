import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const campaign = vi.hoisted(() => ({ activeCampaignId: "c1" as string | null }));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => campaign }));

import {
  approvalOptions,
  fetchReviewsForCharacters,
  pendingCountByCharacter,
  isApprovalWait,
  isChangedSinceSeen,
  isRemovalOnly,
  pendingReviews,
  reviewReasonText,
  useApproveCharacterContent,
  useCampaignPendingContentReviews,
  useCharacterContentReviews,
  useRemoveMissingContent,
  type CharacterContentReview,
} from "./useCharacterContentReviews";

function inApp<T>(setup: () => T): T {
  let out!: T;
  mount(
    defineComponent({
      setup() {
        out = setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  );
  return out;
}

beforeEach(() => {
  fake.reset();
  campaign.activeCampaignId = "c1";
});

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

  // Each reason reads as its own sentence; a swap between two of them would tell a player the wrong thing.
  it("tells the five reasons apart", () => {
    expect(reviewReasonText(review({ reason: "blocked" }))).toMatch(/blocked/);
    expect(reviewReasonText(review({ reason: "homebrew" }))).toMatch(/own content/);
    expect(reviewReasonText(review({ reason: "foreign" }))).toMatch(/another table/);
    expect(reviewReasonText(review({ reason: "missing" }))).toMatch(/no longer exists/);
  });
});

describe("approvalOptions", () => {
  it("lets the DM allow a book's content for one character, or enable the book for the table", () => {
    const options = approvalOptions(review());
    expect(options.map((option) => option.scope)).toEqual(["character", "table"]);
    expect(options[1]?.label).toContain("Tome of Heroes");
  });

  it("lets the DM allow a blocked choice for one character, or lift the block for the table", () => {
    expect(approvalOptions(review({ reason: "blocked" })).map((option) => option.scope)).toEqual(["character", "table"]);
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

const row = (over: Record<string, unknown>) => ({ ...review(), ...over });

describe("fetchReviewsForCharacters", () => {
  it("sends nothing for an empty list", async () => {
    expect(await fetchReviewsForCharacters([])).toEqual([]);
    expect(fake.calls).toEqual([]);
  });

  it("reads exactly the characters asked for, oldest first, in one request", async () => {
    fake.seed("character_content_reviews", [
      row({ id: "late", party_member_id: "pm1", created_at: "2026-10-03T00:00:00Z" }),
      row({ id: "early", party_member_id: "pm2", created_at: "2026-10-01T00:00:00Z" }),
      row({ id: "stranger", party_member_id: "pm9" }),
    ]);
    expect((await fetchReviewsForCharacters(["pm1", "pm2"])).map((r) => r.id)).toEqual(["early", "late"]);
    expect(fake.calls).toHaveLength(1);
  });

  it("throws the database error", async () => {
    fake.failNext("character_content_reviews", { message: "boom" });
    await expect(fetchReviewsForCharacters(["pm1"])).rejects.toMatchObject({ message: "boom" });
  });
});

describe("the reads a character sheet and the DM's queue make", () => {
  beforeEach(() => {
    fake.seed("character_content_reviews", [
      row({ id: "mine-pending", party_member_id: "pm1" }),
      row({ id: "mine-approved", party_member_id: "pm1", status: "approved" }),
      row({ id: "other-character", party_member_id: "pm2" }),
      row({ id: "other-campaign", campaign_id: "c2", party_member_id: "pm3" }),
    ]);
  });

  it("a character's flags are theirs only, approved ones included", async () => {
    const q = inApp(() => useCharacterContentReviews("pm1"));
    await vi.waitFor(() => expect(q.data.value?.map((r) => r.id).sort()).toEqual(["mine-approved", "mine-pending"]));
  });

  it("the table's queue is this campaign's pending flags only", async () => {
    const q = inApp(() => useCampaignPendingContentReviews());
    await vi.waitFor(() => expect(q.data.value?.map((r) => r.id).sort()).toEqual(["mine-pending", "other-character"]));
  });

  it("the queue reads nothing without an active campaign", () => {
    campaign.activeCampaignId = null;
    inApp(() => useCampaignPendingContentReviews());
    expect(fake.calls).toEqual([]);
  });
});

describe("approving and removing", () => {
  it("approve answers with how many flags the character still has pending", async () => {
    fake.onRpc("approve_character_content", (args) => (args.p_scope === "table" ? 0 : 2));
    const approve = inApp(() => useApproveCharacterContent());
    expect(await approve.mutateAsync({ reviewId: "r1", scope: "character" })).toBe(2);
    expect(await approve.mutateAsync({ reviewId: "r1", scope: "table" })).toBe(0);
  });

  it("approve reads 'approved without looking' as no seen-at, and carries the seen-at when the DM looked", async () => {
    // The server refuses an approval when the player edited the row after `seenUpdatedAt`.
    fake.onRpc("approve_character_content", (args) => {
      if (args.p_seen_updated_at !== null && args.p_seen_updated_at !== "2026-10-05T00:00:00Z") throw new Error("stale");
      return 1;
    });
    const approve = inApp(() => useApproveCharacterContent());
    await expect(approve.mutateAsync({ reviewId: "r1", scope: "character" })).resolves.toBe(1);
    await expect(approve.mutateAsync({ reviewId: "r1", scope: "character", seenUpdatedAt: "2026-10-05T00:00:00Z" })).resolves.toBe(1);
    await expect(approve.mutateAsync({ reviewId: "r1", scope: "character", seenUpdatedAt: "2026-10-01T00:00:00Z" })).rejects.toThrow("stale");
  });

  it("an approval that comes back without a count is an error, not a zero", async () => {
    fake.onRpc("approve_character_content", () => null);
    const approve = inApp(() => useApproveCharacterContent());
    await expect(approve.mutateAsync({ reviewId: "r1", scope: "character" })).rejects.toThrow(/count/);
  });

  it("a refused approval reaches the caller with its code", async () => {
    fake.failNext("approve_character_content", { code: "CR002", message: "changed since seen" });
    const approve = inApp(() => useApproveCharacterContent());
    const error = await approve.mutateAsync({ reviewId: "r1", scope: "character" }).catch((e: unknown) => e);
    expect(isChangedSinceSeen(error)).toBe(true);
  });

  it("removing missing content answers with the flags left, and errors on a missing count", async () => {
    fake.onRpc("remove_missing_character_content", () => 1);
    const remove = inApp(() => useRemoveMissingContent());
    expect(await remove.mutateAsync("r1")).toBe(1);
    fake.onRpc("remove_missing_character_content", () => null);
    await expect(remove.mutateAsync("r1")).rejects.toThrow(/count/);
  });
});

describe("pendingCountByCharacter", () => {
  it("counts only pending flags, per character", () => {
    const counts = pendingCountByCharacter([
      review({ id: "a", party_member_id: "pm1" }),
      review({ id: "b", party_member_id: "pm1" }),
      review({ id: "c", party_member_id: "pm2", status: "approved" }),
      review({ id: "d", party_member_id: "pm3" }),
    ]);
    expect(counts.get("pm1")).toBe(2);
    expect(counts.has("pm2")).toBe(false);
    expect(counts.get("pm3")).toBe(1);
  });
});
