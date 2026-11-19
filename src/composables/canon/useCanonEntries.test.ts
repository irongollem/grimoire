import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ user: { id: "dm-1" } as { id: string } | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => session.user }));

import { createCanonEntry, deleteCanonEntry, fetchCanonEntries, updateCanonEntry } from "./useCanonEntries";

const row = (over: Record<string, unknown>) => ({
  id: "e1", user_id: "dm-1", campaign_id: "c1", part: "truth", premise_kind: null, knowledge: "all", title: "t",
  body: null, sort_order: 0, player_visible_to: [], image_url: null, ai_provenance: null,
  created_at: "2026-11-19T10:00:00Z", updated_at: "2026-11-19T10:00:00Z", ...over,
});

describe("canon entries", () => {
  beforeEach(() => {
    fake.reset();
    session.user = { id: "dm-1" };
  });

  it("reads only the asked campaign's canon, so a DM of two campaigns never sees one world's truths in the other", async () => {
    fake.seed("canon_entries", [row({ id: "mine" }), row({ id: "other", campaign_id: "c2" })]);
    const entries = await fetchCanonEntries("c1");
    expect(entries.map((e) => e.id)).toEqual(["mine"]);
  });

  it("orders by the DM's order, not by when a row was made", async () => {
    fake.seed("canon_entries", [row({ id: "b", sort_order: 2 }), row({ id: "a", sort_order: 1 })]);
    expect((await fetchCanonEntries("c1")).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("throws the read's error instead of showing an empty canon", async () => {
    fake.failNext("canon_entries", { message: "boom" });
    await expect(fetchCanonEntries("c1")).rejects.toMatchObject({ message: "boom" });
  });

  it("stamps the signed-in user and the campaign on a new entry, with the mark it was given", async () => {
    await createCanonEntry("c1", { part: "truth", knowledge: "some", title: "The river gives back." });
    expect(fake.rows("canon_entries")).toMatchObject([
      { user_id: "dm-1", campaign_id: "c1", part: "truth", knowledge: "some", title: "The river gives back." },
    ]);
  });

  it("writes nothing when nobody is signed in", async () => {
    session.user = null;
    await expect(createCanonEntry("c1", { part: "truth", knowledge: "all", title: "x" })).rejects.toThrow("Not authenticated");
    expect(fake.rows("canon_entries")).toEqual([]);
  });

  it("reports an update that matched no row as a failure, as RLS refuses without an error", async () => {
    await expect(updateCanonEntry("missing", { title: "x" })).rejects.toThrow(/gone/);
  });

  it("updates only the named entry", async () => {
    fake.seed("canon_entries", [row({ id: "a", title: "old" }), row({ id: "b", title: "keep" })]);
    await updateCanonEntry("a", { title: "new" });
    expect(fake.rows("canon_entries").map((r) => r.title)).toEqual(["new", "keep"]);
  });

  it("deletes only the named entry", async () => {
    fake.seed("canon_entries", [row({ id: "a" }), row({ id: "b" })]);
    await deleteCanonEntry("a");
    expect(fake.rows("canon_entries").map((r) => r.id)).toEqual(["b"]);
  });
});
