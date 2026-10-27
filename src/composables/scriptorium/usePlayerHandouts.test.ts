import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ activeCampaignId: "c1" as string | null, linkedPartyMemberId: "pm1" as string | null }));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get activeCampaignId() { return session.activeCampaignId; } }),
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ get linkedPartyMemberId() { return session.linkedPartyMemberId; } }),
}));

import { createApp, defineComponent, h } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises } from "@vue/test-utils";
import { fetchHandout, fetchHandouts, usePlayerHandout, usePlayerHandouts } from "./usePlayerHandouts";

function mountWith<T>(setup: () => T): T {
  let out!: T;
  const app = createApp(defineComponent({ setup() { out = setup(); return () => h("div"); } }));
  app.use(VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) });
  app.mount(document.createElement("div"));
  return out;
}

const doc = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: id, content: "{}", doc_type: "handout", campaign_id: "c1", player_visible_to: ["pm1"], updated_at: "2026-01-01",
  tags: ["secret-tag"], ai_provenance: { model: "x" }, user_id: "dm-1", ...over,
});

/** What the DM keeps on the same row and a player must never be sent. */
const DM_ONLY = ["*", "tags", "ai_provenance", "user_id", "player_visible_to"];

beforeEach(() => {
  fake.reset();
  session.activeCampaignId = "c1";
  session.linkedPartyMemberId = "pm1";
  fake.seed("scriptorium_documents", [
    doc("mine-old", { updated_at: "2026-01-01" }),
    doc("mine-new", { updated_at: "2026-02-01" }),
    doc("shared-both", { player_visible_to: ["pm1", "pm2"], updated_at: "2026-01-15" }),
    doc("theirs", { player_visible_to: ["pm2"] }),
    doc("unshared", { player_visible_to: [] }),
    doc("other-campaign", { campaign_id: "c2" }),
  ]);
});

describe("fetchHandouts", () => {
  it("lists only this campaign's handouts shared with this character, newest first", async () => {
    const rows = await fetchHandouts("c1", "pm1");
    expect(rows.map((r) => r.id)).toEqual(["mine-new", "shared-both", "mine-old"]);
  });

  it("never selects the body or the DM's own columns", async () => {
    await fetchHandouts("c1", "pm1");
    const columns = fake.calls[0]?.columns ?? "";
    expect(columns).not.toBe("");
    for (const hidden of [...DM_ONLY, "content"]) expect(columns.split(/,\s*/)).not.toContain(hidden);
  });

  it("throws the error rather than reporting an empty list", async () => {
    fake.failNext("scriptorium_documents", { message: "boom" });
    await expect(fetchHandouts("c1", "pm1")).rejects.toMatchObject({ message: "boom" });
  });
});

describe("fetchHandout", () => {
  it("reads one handout the character holds, without the DM's columns", async () => {
    const row = await fetchHandout("mine-new", "c1", "pm1");
    expect(row?.id).toBe("mine-new");
    const columns = (fake.calls[0]?.columns ?? "").split(/,\s*/);
    expect(columns).toContain("content");
    for (const hidden of DM_ONLY) expect(columns).not.toContain(hidden);
  });

  it.each([
    ["another character's handout", "theirs", "c1"],
    ["an unshared (withdrawn) handout", "unshared", "c1"],
    ["a handout of another campaign", "other-campaign", "c1"],
    ["an id asked for under the wrong campaign", "mine-new", "c2"],
  ])("returns null for %s", async (_label, id, campaignId) => {
    expect(await fetchHandout(id, campaignId, "pm1")).toBeNull();
  });

  it("throws a real error", async () => {
    fake.failNext("scriptorium_documents", { message: "nope" });
    await expect(fetchHandout("mine-new", "c1", "pm1")).rejects.toMatchObject({ message: "nope" });
  });
});

describe("the player's handout hooks", () => {
  it("read for a seated character, and read nothing for a DM without a seat", async () => {
    const seated = mountWith(() => ({ list: usePlayerHandouts(), one: usePlayerHandout("mine-new") }));
    await flushPromises();
    expect(seated.list.data.value?.map((d) => d.id)).toEqual(["mine-new", "shared-both", "mine-old"]);
    expect(seated.one.data.value?.id).toBe("mine-new");

    fake.calls.length = 0;
    session.linkedPartyMemberId = null;
    const dm = mountWith(() => ({ list: usePlayerHandouts(), one: usePlayerHandout("mine-new") }));
    await flushPromises();
    expect(fake.calls).toEqual([]);
    expect(dm.list.error.value).toBeNull();
    expect(dm.one.error.value).toBeNull();
  });
});
