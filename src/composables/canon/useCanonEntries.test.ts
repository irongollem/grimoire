import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ user: { id: "dm-1" } as { id: string } | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => session.user }));

const queue = vi.hoisted(() => vi.fn());
vi.mock("@/lib/canon/queueCanonEmbedding", () => ({ queueCanonEmbedding: queue }));

import { createCanonEntry, trashCanonEntry, updateCanonEntry } from "./useCanonEntries";

const row = (over: Record<string, unknown>) => ({
  id: "e1", user_id: "dm-1", campaign_id: "c1", part: "truth", premise_kind: null, knowledge: "all", title: "t",
  body: null, sort_order: 0, player_visible_to: [], image_url: null, ai_provenance: null,
  created_at: "2026-11-19T10:00:00Z", updated_at: "2026-11-19T10:00:00Z", ...over,
});

describe("canon entries", () => {
  beforeEach(() => {
    fake.reset();
    queue.mockClear();
    session.user = { id: "dm-1" };
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

  // Bug caught: the page deleted the row outright, so a stray click lost an entry and everything hanging off it for good.
  it("trashes through the RPC, naming the entry, and answers the trash row", async () => {
    fake.onRpc("trash_canon_entry", () => "t1");
    await expect(trashCanonEntry("a")).resolves.toBe("t1");
    expect(fake.calls.filter((c) => c.target === "trash_canon_entry").map((c) => c.payload)).toEqual([{ p_entry_id: "a" }]);
    expect(fake.calls.some((c) => c.target === "canon_entries" && c.op === "delete")).toBe(false);
  });

  // Bug caught: a refused trash (the entry gone, not the caller's) looked like a success, so the page said Deleted.
  it("throws what the database refused with", async () => {
    fake.failNext("trash_canon_entry", { message: "gone", code: "P0002" });
    await expect(trashCanonEntry("a")).rejects.toMatchObject({ code: "P0002" });
  });

  // Bug caught: a new entry never reached the by-meaning lookup, so the Narrator could not find what the DM just wrote.
  it("queues a new entry for its embedding, and not when the insert failed", async () => {
    fake.seed("canon_entries", []);
    const created = await createCanonEntry("c1", { part: "truth", knowledge: "all", title: "x" });
    expect(queue).toHaveBeenCalledWith(created.id);
    queue.mockClear();
    fake.failNext("canon_entries", { message: "boom" });
    await expect(createCanonEntry("c1", { part: "truth", knowledge: "all", title: "y" })).rejects.toMatchObject({ message: "boom" });
    expect(queue).not.toHaveBeenCalled();
  });

  // Bug caught: an edit left the old words in the lookup; a reorder that re-embedded cost a request per drag.
  it("queues an edit of the words, not a reorder, and nothing when RLS refused the write", async () => {
    fake.seed("canon_entries", [row({ id: "a" })]);
    await updateCanonEntry("a", { sort_order: 4 });
    await updateCanonEntry("a", { knowledge: "secret" });
    expect(queue).not.toHaveBeenCalled();
    await updateCanonEntry("a", { wants: "More bells" });
    expect(queue).toHaveBeenCalledWith("a");
    queue.mockClear();
    await expect(updateCanonEntry("missing", { title: "x" })).rejects.toThrow(/gone/);
    expect(queue).not.toHaveBeenCalled();
  });
});
