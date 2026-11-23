import { describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

import { fetchCanonHere, parseCanonHere } from "./useCanonHere";

describe("parseCanonHere", () => {
  it("accepts the shape the RPC returns", () => {
    const clue = { id: "k", title: "t", secret_id: "s", secret_title: "S", found_at: null, found_session_id: null };
    const passage = { id: "g", title: "t", entry_id: "e", entry_title: "E" };
    expect(parseCanonHere({ clues: [clue], passages: [passage] })).toEqual({ clues: [clue], passages: [passage] });
  });

  it("throws on a payload without both lists, so a changed RPC shows as an error and not as an empty block", () => {
    expect(() => parseCanonHere({ clues: [] })).toThrow();
    expect(() => parseCanonHere(null)).toThrow();
  });

  it("throws on a clue row missing its secret's title", () => {
    expect(() => parseCanonHere({ clues: [{ id: "k", title: "t", secret_id: "s", found_at: null, found_session_id: null }], passages: [] })).toThrow();
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
