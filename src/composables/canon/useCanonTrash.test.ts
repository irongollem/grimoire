import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
const queue = vi.hoisted(() => vi.fn());
vi.mock("@/lib/canon/queueCanonEmbedding", () => ({ queueCanonEmbedding: queue }));

import { fetchCanonTrash, restoreCanonEntry, restoreErrorMessage } from "./useCanonTrash";

const trash = (over: Record<string, unknown>) => ({
  id: "t1", campaign_id: "c1", entry_id: "e1", part: "secret", title: "x", snapshot: {}, deleted_at: "2026-11-20T10:00:00Z", ...over,
});

describe("canon trash", () => {
  beforeEach(() => {
    fake.reset();
    queue.mockClear();
  });

  // Bug caught: the read left the campaign to RLS, so a DM of two campaigns saw both campaigns' deleted entries.
  it("reads only the campaign's rows, newest first, and only the list's columns", async () => {
    fake.seed("canon_trash", [
      trash({ id: "a", deleted_at: "2026-11-01T10:00:00Z" }),
      trash({ id: "b", campaign_id: "c2" }),
      trash({ id: "c", deleted_at: "2026-11-10T10:00:00Z" }),
    ]);
    const rows = await fetchCanonTrash("c1");
    expect(rows.map((r) => r.id)).toEqual(["c", "a"]);
    const call = fake.calls.find((c) => c.target === "canon_trash");
    expect(call?.columns).toBe("id, entry_id, part, title, deleted_at");
  });

  // Bug caught: a failed read looked like an empty list, so the Deleted block silently vanished.
  it("throws a failed read", async () => {
    fake.failNext("canon_trash", { message: "boom" });
    await expect(fetchCanonTrash("c1")).rejects.toMatchObject({ message: "boom" });
  });

  // Bug caught: a restored entry had no vector, so the Narrator and search could not find it again.
  it("restores through the RPC and then queues the restored entry for its embedding", async () => {
    fake.onRpc("restore_canon_entry", () => "e9");
    await expect(restoreCanonEntry("t1")).resolves.toBe("e9");
    expect(fake.calls.filter((c) => c.target === "restore_canon_entry").map((c) => c.payload)).toEqual([{ p_trash_id: "t1" }]);
    expect(queue).toHaveBeenCalledWith("e9");
  });

  // Bug caught: a refused restore queued an embedding for an entry that was never put back.
  it("queues nothing when the restore fails", async () => {
    fake.failNext("restore_canon_entry", { message: "gone", code: "P0002" });
    await expect(restoreCanonEntry("t1")).rejects.toMatchObject({ code: "P0002" });
    expect(queue).not.toHaveBeenCalled();
  });

  // Bug caught: a 23505 showed "Something went wrong" instead of telling the DM which backstory to delete first.
  it("shows the server's own sentence for a 23505, and the generic one for other failures", () => {
    const sentence = "This character has a backstory again. Delete that one first to bring this one back.";
    expect(restoreErrorMessage({ code: "23505", message: sentence })).toBe(sentence);
    expect(restoreErrorMessage({ code: "42501", message: "permission denied" })).toBe("Something went wrong.");
  });
});
