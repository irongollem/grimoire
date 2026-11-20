import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ user: { id: "dm-1" } as { id: string } | null }));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => session.user }));

const queue = vi.hoisted(() => vi.fn());
vi.mock("./queueCanonEmbedding", () => ({ queueCanonEmbedding: queue }));

import { createCanonPassage, fetchCanonPassages, firstPassageIds, passagesOf, TAKE_BACK_PATCH, tellPatch, toldTally, untoldPassagesAt, updateCanonPassage, wherePatch } from "./useCanonPassages";
import type { CanonLorePassage } from "@/types/canon.types";

const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "g1", user_id: "dm-1", campaign_id: "c1", entry_id: "l1", title: "t", body: null, sort_order: 0, player_visible_to: [], told_at: null,
  told_session_id: null, location_id: null, npc_id: null, quest_beat_id: null, ai_provenance: null,
  created_at: "2026-11-19T10:00:00Z", updated_at: "2026-11-19T10:00:00Z", ...over,
});
const list = (...rows: Record<string, unknown>[]): CanonLorePassage[] => rows as unknown as CanonLorePassage[];

describe("canon passages: reads and writes", () => {
  beforeEach(() => {
    fake.reset();
    queue.mockClear();
    session.user = { id: "dm-1" };
  });

  it("reads only the asked campaign's passages, so one campaign's lore never shows in another", async () => {
    fake.seed("canon_lore_passages", [row({ id: "mine" }), row({ id: "other", campaign_id: "c2" })]);
    expect((await fetchCanonPassages("c1")).map((p) => p.id)).toEqual(["mine"]);
  });

  it("throws the read's error instead of showing a lore entry with no passages", async () => {
    fake.failNext("canon_lore_passages", { message: "boom" });
    await expect(fetchCanonPassages("c1")).rejects.toMatchObject({ message: "boom" });
  });

  it("stamps the signed-in user and the campaign on a new passage", async () => {
    await createCanonPassage("c1", { entry_id: "l1", title: "I" });
    expect(fake.rows("canon_lore_passages")).toMatchObject([{ user_id: "dm-1", campaign_id: "c1", entry_id: "l1" }]);
  });

  it("says so when a write changed no row, which is what a refusal by RLS looks like", async () => {
    await expect(updateCanonPassage("missing", { title: "x" })).rejects.toThrow("gone");
  });
});

describe("canon passages: embedding", () => {
  beforeEach(() => {
    fake.reset();
    queue.mockClear();
    session.user = { id: "dm-1" };
  });

  // Bug caught: a passage is folded into its ENTRY's vector, so queueing the passage id embeds nothing.
  it("queues the passage's entry when a passage is made, and nothing when the insert failed", async () => {
    await createCanonPassage("c1", { entry_id: "l1", title: "I" });
    expect(queue).toHaveBeenCalledWith("l1");
    queue.mockClear();
    fake.failNext("canon_lore_passages", { message: "boom" });
    await expect(createCanonPassage("c1", { entry_id: "l1", title: "II" })).rejects.toBeTruthy();
    expect(queue).not.toHaveBeenCalled();
  });

  // Bug caught: telling a passage re-embedded its entry although only heading and text are in the vector.
  it("queues the entry for a change of heading or text, not for telling or moving the passage", async () => {
    fake.seed("canon_lore_passages", [row({ id: "g1", entry_id: "l9" })]);
    await updateCanonPassage("g1", { told_at: "2026-11-20T10:00:00Z" });
    await updateCanonPassage("g1", { sort_order: 3 });
    expect(queue).not.toHaveBeenCalled();
    await updateCanonPassage("g1", { body: "{}" });
    expect(queue).toHaveBeenCalledWith("l9");
  });
});

describe("passage helpers", () => {
  it("orders an entry's passages by sort order and then by when they were written, and leaves other entries out", () => {
    const all = list(row({ id: "b", sort_order: 1 }), row({ id: "a", sort_order: 0 }), row({ id: "x", entry_id: "l2", sort_order: 0 }));
    expect(passagesOf(all, "l1").map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("counts the first passage as told with the entry, and a later one only once told", () => {
    const rows = list(row({ id: "a" }), row({ id: "b", told_at: "2026-11-20T10:00:00Z" }), row({ id: "c" }));
    expect(toldTally(rows)).toEqual({ told: 2, total: 3 });
  });

  it("finds each entry's first passage, never a later one", () => {
    const all = list(row({ id: "a" }), row({ id: "b", sort_order: 1 }), row({ id: "z", entry_id: "l2" }));
    expect([...firstPassageIds(all)].sort()).toEqual(["a", "z"]);
  });

  it("lists untold passages at one place, not the told, the first, another place or a person with the same id", () => {
    const all = list(
      row({ id: "first", location_id: "p1" }),
      row({ id: "wait", sort_order: 1, location_id: "p1" }),
      row({ id: "told", sort_order: 2, location_id: "p1", told_at: "2026-11-20T10:00:00Z" }),
      row({ id: "elsewhere", sort_order: 3, location_id: "p2" }),
      row({ id: "person", sort_order: 4, npc_id: "p1" }),
    );
    expect(untoldPassagesAt(all, "location", "p1").map((p) => p.id)).toEqual(["wait"]);
  });

  it("moves a passage to one place by clearing the other two, because the table refuses a passage at two", () => {
    expect(wherePatch({ kind: "npc", id: "n1" })).toEqual({ location_id: null, npc_id: "n1", quest_beat_id: null });
    expect(wherePatch(null)).toEqual({ location_id: null, npc_id: null, quest_beat_id: null });
  });

  it("tells with the time, the running session and every party member, and takes back all three", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    expect(tellPatch(["m1", "m2"], "s1", now)).toEqual({ told_at: "2026-11-20T10:00:00.000Z", told_session_id: "s1", player_visible_to: ["m1", "m2"] });
    expect(TAKE_BACK_PATCH).toEqual({ told_at: null, told_session_id: null, player_visible_to: [] });
  });
});
