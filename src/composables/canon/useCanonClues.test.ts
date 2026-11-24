import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ user: { id: "dm-1" } as { id: string } | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => session.user }));

import { cluePlacement, createCanonClue, fetchCanonClues, foundPatch, updateCanonClue } from "./useCanonClues";

const row = (over: Record<string, unknown>): Record<string, unknown> => ({
  id: "k1", user_id: "dm-1", campaign_id: "c1", secret_id: "s1", title: "A locket", sort_order: 0, location_id: null, npc_id: null,
  quest_beat_id: null, item_id: null, document_id: null, found_at: null, found_session_id: null, passage_id: null, ai_provenance: null,
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

  // Bug: a clue placed in an item was written to another place's column (or to none), so the item never showed it.
  it("files a clue in an item under item_id alone, and a handout under document_id alone", async () => {
    expect(cluePlacement({ kind: "item", id: "i1" })).toEqual({ item_id: "i1" });
    expect(cluePlacement({ kind: "document", id: "d1" })).toEqual({ document_id: "d1" });
    await createCanonClue("c1", { secret_id: "s1", title: "A locket", ...cluePlacement({ kind: "item", id: "i1" }) });
    const [saved] = fake.rows("canon_clues");
    expect(saved).toMatchObject({ item_id: "i1" });
    expect(saved).not.toHaveProperty("location_id");
    expect(saved).not.toHaveProperty("document_id");
  });

  it("says so when a write changed no row, which is what a refusal by RLS looks like", async () => {
    await expect(updateCanonClue("missing", { title: "x" })).rejects.toThrow("gone");
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
