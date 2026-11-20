import { describe, expect, it } from "vitest";
import { parseCanonHere } from "./useCanonHere";

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
