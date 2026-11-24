import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));

import { fetchCampaignQuestClocks } from "./useQuestClocks";

describe("fetchCampaignQuestClocks", () => {
  beforeEach(() => fake.reset());

  // Bug caught (#1255 item 20): the force's list read every campaign's clocks, so another campaign's clock could claim to move this force.
  it("returns only the asked campaign's clocks, in sort order", async () => {
    fake.seed("quest_clocks", [
      { id: "b", campaign_id: "c1", quest_id: "q1", label: "B", sort_order: 1, created_at: "2026-11-01T00:00:00Z" },
      { id: "x", campaign_id: "c2", quest_id: "q9", label: "X", sort_order: 0, created_at: "2026-11-01T00:00:00Z" },
      { id: "a", campaign_id: "c1", quest_id: "q1", label: "A", sort_order: 0, created_at: "2026-11-01T00:00:00Z" },
    ]);
    expect((await fetchCampaignQuestClocks("c1")).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("throws the database's error rather than reading as no clocks", async () => {
    fake.failNext("quest_clocks", { message: "permission denied" });
    await expect(fetchCampaignQuestClocks("c1")).rejects.toThrow("permission denied");
  });
});
