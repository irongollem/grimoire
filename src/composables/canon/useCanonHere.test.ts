import { describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

import { fetchCanonHere, parseCanonHere } from "./useCanonHere";

describe("parseCanonHere", () => {
  it("accepts the shape the RPC returns", () => {
    const clue = { id: "k", title: "t", secret_id: "s", secret_title: "S", found_at: null, found_session_id: null };
    const passage = { id: "g", title: "t", entry_id: "e", entry_title: "E" };
    const lore = { id: "l", title: "The Fall", told: 1, total: 2 };
    const entry = { id: "t", title: "The bridge", part: "truth", knowledge: "some", revealed_at: null };
    expect(parseCanonHere({ clues: [clue], passages: [passage], lore: [lore], knows: [entry], about: [entry] })).toEqual({ clues: [clue], passages: [passage], lore: [lore], knows: [entry], about: [entry] });
    // A place or a beat has no lore, knows or about list; each reads as none.
    const bare = parseCanonHere({ clues: [], passages: [] });
    expect([bare.lore, bare.knows, bare.about]).toEqual([[], [], []]);
  });

  // Bug: an entry of an unknown part (or a truth with a made-up mark) read as fine, so the sheet offered "Tell the party" on it.
  it("throws on an entry with a part or mark the canon does not have", () => {
    const bad = { id: "t", title: "x", part: "rumour", knowledge: null, revealed_at: null };
    expect(() => parseCanonHere({ clues: [], passages: [], knows: [bad] })).toThrow();
    expect(() => parseCanonHere({ clues: [], passages: [], about: [{ ...bad, part: "truth", knowledge: "most" }] })).toThrow();
  });

  it("throws on a payload without both lists, so a changed RPC shows as an error and not as an empty block", () => {
    expect(() => parseCanonHere({ clues: [] })).toThrow();
    expect(() => parseCanonHere(null)).toThrow();
  });
});

describe("fetchCanonHere", () => {
  // Bug: an item or a handout was asked as a place or a person, so its clues were never found (the RPC reads p_kind).
  it.each(["item", "document"] as const)("asks get_canon_here for kind %s as itself", async (kind) => {
    rpc.mockResolvedValue({ data: { clues: [], passages: [] }, error: null });
    await fetchCanonHere(kind, "x1");
    expect(rpc).toHaveBeenLastCalledWith("get_canon_here", { p_kind: kind, p_id: "x1" });
  });
});
