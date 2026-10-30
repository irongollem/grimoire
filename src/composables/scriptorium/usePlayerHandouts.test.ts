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

import { createApp, defineComponent, h, ref } from "vue";
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
  const handout = { id: "mine-new", title: "T", chapters: [{ id: "c1", position: 0, title: "One" }], chapter: { id: "c1", title: "One", content: { type: "doc" } } };

  it("reads through the get_player_handout RPC, never the chapters table, naming the chapter when asked", async () => {
    fake.onRpc("get_player_handout", () => handout);
    expect((await fetchHandout("mine-new", "c1"))?.chapter?.id).toBe("c1");
    await fetchHandout("mine-new", null);
    const rpcs = fake.calls.filter((c) => c.kind === "rpc");
    expect(rpcs[0].payload).toEqual({ p_document_id: "mine-new", p_chapter_id: "c1" });
    expect(rpcs[1].payload).toEqual({ p_document_id: "mine-new" });
    expect(fake.calls.some((c) => c.kind === "table" && c.target === "scriptorium_chapters")).toBe(false);
  });

  it("returns null when the server refuses a withdrawn handout", async () => {
    fake.failNext("get_player_handout", { message: "Not authorized", code: "42501" });
    expect(await fetchHandout("mine-new", null)).toBeNull();
  });

  it("throws any other failure instead of reporting the handout withdrawn", async () => {
    fake.failNext("get_player_handout", { message: "nope", code: "XX000" });
    await expect(fetchHandout("mine-new", null)).rejects.toMatchObject({ message: "nope" });
  });
});

describe("the player's handout hooks", () => {
  it("read for a seated character, and read nothing for a DM without a seat", async () => {
    fake.onRpc("get_player_handout", (args) => ({ id: args.p_document_id, chapters: [], chapter: null }));
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

  it("keeps each chapter of a handout in its own cache entry under the live-sync root", async () => {
    fake.onRpc("get_player_handout", (args) => ({ id: "mine-new", chapters: [], chapter: { id: args.p_chapter_id ?? "first" } }));
    const chapter = ref<string | null>(null);
    const one = mountWith(() => usePlayerHandout("mine-new", chapter));
    await flushPromises();
    expect(one.data.value?.chapter?.id).toBe("first");
    chapter.value = "c2";
    await flushPromises();
    expect(one.data.value?.chapter?.id).toBe("c2");
  });
});
