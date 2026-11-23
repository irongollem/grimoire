import { describe, expect, it } from "vitest";
import { canonEntry } from "@/test/canonEntry";
import type { PartyMember } from "@/types/party.types";
import { matchesQuery, narrowToArc, partyInArc } from "./canonNarrow";

describe("narrowToArc", () => {
  const entries = [
    canonEntry({ id: "t-in", part: "truth", arc_id: "a1" }),
    canonEntry({ id: "t-out", part: "truth", arc_id: "a2" }),
    canonEntry({ id: "t-none", part: "truth", arc_id: null }),
    canonEntry({ id: "q-in", part: "question", arc_id: "a1" }),
    canonEntry({ id: "prem", part: "premise", premise_kind: "theme", arc_id: null }),
  ];

  // Bug caught: an entry of another arc, or of no arc, showing under the chosen one.
  it("keeps only the entries of the chosen arc in every narrowed part", () => {
    expect(narrowToArc(entries, "a1").map((e) => e.id)).toEqual(["t-in", "q-in", "prem"]);
  });

  // Bug caught: the premise (which can belong to no arc) vanishing the moment an arc is chosen.
  it("never narrows the premise", () => {
    expect(narrowToArc(entries, "a-none").map((e) => e.id)).toEqual(["prem"]);
  });

  it("shows everything with no arc chosen", () => {
    expect(narrowToArc(entries, null)).toHaveLength(5);
  });
});

describe("partyInArc", () => {
  const party = [{ id: "m1", name: "Tansy" }, { id: "m2", name: "Pim" }, { id: "m3", name: "Wren" }] as PartyMember[];
  const backstories = [
    canonEntry({ id: "b1", part: "backstory", party_member_id: "m1", arc_id: "a1" }),
    canonEntry({ id: "b2", part: "backstory", party_member_id: "m2", arc_id: "a2" }),
  ];

  // Bug caught: a character with no backstory, or one in another arc, kept in a narrowed Backstories part.
  it("keeps only the characters whose backstory is in the arc", () => {
    expect(partyInArc(party, backstories, "a1").map((m) => m.id)).toEqual(["m1"]);
  });

  it("keeps the whole party with no arc chosen", () => {
    expect(partyInArc(party, backstories, null)).toHaveLength(3);
  });
});

describe("matchesQuery", () => {
  it("matches a word anywhere in the title, in any case", () => {
    expect(matchesQuery("The Drowned God", "drowned")).toBe(true);
    expect(matchesQuery("The Drowned God", "mill")).toBe(false);
  });

  // Bug caught: a query of spaces hiding every row.
  it("treats an empty or blank query as matching everything", () => {
    expect(matchesQuery("x", "   ")).toBe(true);
  });
});
