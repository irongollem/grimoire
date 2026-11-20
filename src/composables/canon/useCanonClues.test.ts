import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ user: { id: "dm-1" } as { id: string } | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => session.user }));

import { cluesAt, createCanonClue, fetchCanonClues, foundPatch, updateCanonClue } from "./useCanonClues";
import type { CanonClue } from "@/types/canon.types";

const row = (over: Record<string, unknown>): Record<string, unknown> => ({
  id: "k1", user_id: "dm-1", campaign_id: "c1", secret_id: "s1", title: "A locket", sort_order: 0, location_id: null, npc_id: null,
  quest_beat_id: null, found_at: null, found_session_id: null, passage_id: null, ai_provenance: null,
  created_at: "2026-11-19T10:00:00Z", updated_at: "2026-11-19T10:00:00Z", ...over,
});

describe("canon clues", () => {
  beforeEach(() => {
    fake.reset();
    session.user = { id: "dm-1" };
  });

  it("reads only the asked campaign's clues, so one campaign's clues never show in another", async () => {
    fake.seed("canon_clues", [row({ id: "mine" }), row({ id: "other", campaign_id: "c2" })]);
    expect((await fetchCanonClues("c1")).map((c) => c.id)).toEqual(["mine"]);
  });

  it("throws the read's error instead of showing a secret with no clues", async () => {
    fake.failNext("canon_clues", { message: "boom" });
    await expect(fetchCanonClues("c1")).rejects.toMatchObject({ message: "boom" });
  });

  it("stamps the signed-in user and the campaign on a new clue", async () => {
    await createCanonClue("c1", { secret_id: "s1", title: "A locket", location_id: "p1" });
    expect(fake.rows("canon_clues")).toMatchObject([{ user_id: "dm-1", campaign_id: "c1", secret_id: "s1", location_id: "p1" }]);
  });

  it("says so when a write changed no row, which is what a refusal by RLS looks like", async () => {
    await expect(updateCanonClue("missing", { title: "x" })).rejects.toThrow("gone");
  });
});

describe("cluesAt", () => {
  const all = [row({ id: "a", location_id: "p1" }), row({ id: "b", location_id: "p2" }), row({ id: "c", npc_id: "p1" }), row({ id: "d", quest_beat_id: "p1" })] as unknown as CanonClue[];

  it("lists only the clues placed at that very place, not another place, person or beat that shares an id", () => {
    expect(cluesAt(all, "location", "p1").map((c) => c.id)).toEqual(["a"]);
    expect(cluesAt(all, "npc", "p1").map((c) => c.id)).toEqual(["c"]);
    expect(cluesAt(all, "quest_beat", "p1").map((c) => c.id)).toEqual(["d"]);
  });

  it("lists nothing where no clue lies, so the block renders nothing", () => {
    expect(cluesAt(all, "location", "p9")).toEqual([]);
  });
});

describe("foundPatch", () => {
  it("stamps the time and the running session when ticked", () => {
    expect(foundPatch(true, "sess-1", new Date("2026-11-20T20:00:00Z"))).toEqual({ found_at: "2026-11-20T20:00:00.000Z", found_session_id: "sess-1" });
  });

  it("keeps no session when none is running", () => {
    expect(foundPatch(true, null).found_session_id).toBeNull();
  });

  it("clears the session with the time when unticked: the table refuses a found session with no found time", () => {
    expect(foundPatch(false, "sess-1")).toEqual({ found_at: null, found_session_id: null });
  });
});
