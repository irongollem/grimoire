import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const campaign = vi.hoisted(() => ({ activeCampaignId: "c1" as string | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => campaign }));

import {
  createPartyMilestone,
  deletePartyMilestone,
  useCreatePartyMilestone,
  useDeletePartyMilestone,
  usePartyMilestones,
} from "./usePartyMilestones";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const invalidate = vi.spyOn(client, "invalidateQueries");
const keysOf = () =>
  invalidate.mock.calls.map(([filters]) => (filters !== undefined && typeof filters !== "function" ? filters.queryKey : undefined));


function inApp<T>(setup: () => T): T {
  let out!: T;
  mount(
    defineComponent({
      setup() {
        out = setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } },
  );
  return out;
}

beforeEach(() => {
  fake.reset();
  invalidate.mockClear();
  campaign.activeCampaignId = "c1";
});

describe("usePartyMilestones", () => {
  it("lists this campaign's milestones oldest first, never another campaign's", async () => {
    fake.seed("party_milestones", [
      { id: "late", campaign_id: "c1", created_at: "2026-10-02T00:00:00Z" },
      { id: "early", campaign_id: "c1", created_at: "2026-10-01T00:00:00Z" },
      { id: "other", campaign_id: "c2", created_at: "2026-10-01T00:00:00Z" },
    ]);
    const q = inApp(() => usePartyMilestones());
    await vi.waitFor(() => expect(q.data.value?.map((m) => m.id)).toEqual(["early", "late"]));
  });

  it("reports a failed read instead of an empty panel", async () => {
    fake.failNext("party_milestones", { message: "boom" });
    const q = inApp(() => usePartyMilestones());
    await vi.waitFor(() => expect(q.isError.value).toBe(true));
  });

  it("reads nothing without an active campaign", () => {
    campaign.activeCampaignId = null;
    inApp(() => usePartyMilestones());
    expect(fake.calls).toEqual([]);
  });
});

describe("createPartyMilestone", () => {
  const base = { campaign_id: "c1", quest_id: null, text: "Renown among the dockworkers", source_event_id: null };

  it("stamps the current user as created_by when none is given", async () => {
    await createPartyMilestone(base);
    expect(fake.rows("party_milestones")).toMatchObject([{ text: "Renown among the dockworkers", created_by: "dm-1" }]);
  });

  it("keeps an explicit created_by rather than overwriting it", async () => {
    await createPartyMilestone({ ...base, created_by: "other-user" });
    expect(fake.rows("party_milestones")[0]?.created_by).toBe("other-user");
  });

  it("surfaces an insert failure and stores nothing", async () => {
    fake.failNext("party_milestones", { message: "insert failed" });
    await expect(createPartyMilestone(base)).rejects.toMatchObject({ message: "insert failed" });
    expect(fake.rows("party_milestones")).toEqual([]);
  });

  it("refreshes the campaign the milestone was added to", async () => {
    await inApp(() => useCreatePartyMilestone()).mutateAsync(base);
    expect(keysOf()).toContainEqual(["party_milestones", "c1"]);
  });
});

describe("deletePartyMilestone", () => {
  beforeEach(() => {
    fake.seed("party_milestones", [{ id: "m1", campaign_id: "c1" }, { id: "m2", campaign_id: "c1" }]);
  });

  it("deletes the row by id and no other", async () => {
    await deletePartyMilestone("m1");
    expect(fake.rows("party_milestones").map((m) => m.id)).toEqual(["m2"]);
  });

  it("surfaces a delete failure and keeps the row", async () => {
    fake.failNext("party_milestones", { message: "delete failed" });
    await expect(deletePartyMilestone("m1")).rejects.toMatchObject({ message: "delete failed" });
    expect(fake.rows("party_milestones")).toHaveLength(2);
  });

  it("refreshes the campaign the milestone belonged to", async () => {
    await inApp(() => useDeletePartyMilestone()).mutateAsync({ id: "m1", campaignId: "c1" });
    expect(keysOf()).toContainEqual(["party_milestones", "c1"]);
  });
});
