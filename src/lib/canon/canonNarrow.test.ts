import { describe, expect, it } from "vitest";
import { canonEntry } from "@/test/canonEntry";
import { narrowToArc } from "./canonNarrow";

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

  // Bug caught: a character's backstory hidden under an arc because its entry sits in another arc (a character spans arcs).
  it("never narrows a backstory", () => {
    const backstories = [canonEntry({ id: "b-in", part: "backstory", arc_id: "a1" }), canonEntry({ id: "b-out", part: "backstory", arc_id: "a2" }), canonEntry({ id: "b-none", part: "backstory", arc_id: null })];
    expect(narrowToArc(backstories, "a1").map((e) => e.id)).toEqual(["b-in", "b-out", "b-none"]);
  });

  it("shows everything with no arc chosen", () => {
    expect(narrowToArc(entries, null)).toHaveLength(5);
  });
});
