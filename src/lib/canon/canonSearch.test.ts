import { describe, expect, it } from "vitest";
import { canonEntry } from "@/test/canonEntry";
import { excerptAround, matchesQuery, searchCanon } from "./canonSearch";
import type { CanonClue, CanonForceStep, CanonLorePassage } from "@/types/canon.types";

const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const clue = (over: Partial<CanonClue>): CanonClue => ({ id: "c1", secret_id: "s1", title: "x", ...over }) as CanonClue;
const step = (over: Partial<CanonForceStep>): CanonForceStep => ({ id: "st1", force_id: "f1", title: "x", ...over }) as CanonForceStep;
const passage = (over: Partial<CanonLorePassage>): CanonLorePassage => ({ id: "p1", entry_id: "l1", title: "", body: null, ...over }) as CanonLorePassage;
const none = { entries: [], clues: [], steps: [], passages: [] };

describe("matchesQuery", () => {
  it("matches a word anywhere in the text, in any case", () => {
    expect(matchesQuery("The Drowned God", "drowned")).toBe(true);
    expect(matchesQuery("The Drowned God", "mill")).toBe(false);
  });

  // Bug caught: a query of spaces hiding every row.
  it("treats an empty or blank query as matching everything", () => {
    expect(matchesQuery("x", "   ")).toBe(true);
  });
});

describe("excerptAround", () => {
  // Bug caught: the excerpt showing the stored Tiptap JSON, braces and node names included.
  it("reads the plain words of a rich body and trims around the match with ellipses", () => {
    const text = `${"a ".repeat(40)}flood${" b".repeat(40)}`;
    const found = excerptAround(doc(text), "FLOOD")!;
    expect(found.startsWith("…")).toBe(true);
    expect(found.endsWith("…")).toBe(true);
    expect(found).toContain("flood");
    expect(found).not.toContain("paragraph");
  });

  it("is null when the body does not hold the words, or there is no body", () => {
    expect(excerptAround(doc("dry"), "flood")).toBeNull();
    expect(excerptAround(null, "flood")).toBeNull();
  });
});

describe("searchCanon", () => {
  const entries = [
    canonEntry({ id: "t1", part: "truth", knowledge: "all", title: "The river gives back." }),
    canonEntry({ id: "s1", part: "secret", title: "The mill burned on purpose", body: doc("The miller paid for the fire.") }),
    canonEntry({ id: "f1", part: "force", title: "The Stain spreads" }),
    canonEntry({ id: "l1", part: "lore", title: "The Fall" }),
    canonEntry({ id: "q1", part: "question", title: "Who set the fire?" }),
  ];

  // Bug caught: a blank query listing the whole canon, so the page showed a list of everything in place of the part.
  it("finds nothing for a blank query", () => {
    expect(searchCanon("  ", { ...none, entries })).toEqual([]);
  });

  // Bug caught: the search matching titles only, as the per-part fields did.
  it("finds a word in an entry's body, not only its title", () => {
    const groups = searchCanon("miller", { ...none, entries });
    expect(groups.map((g) => g.section)).toEqual(["secrets"]);
    expect(groups[0].hits[0]).toMatchObject({ entryId: "s1", excerpt: expect.stringContaining("miller") });
  });

  // Bug caught: a title hit carrying an excerpt too, so the row repeats what the title already says.
  it("gives a title hit no excerpt", () => {
    expect(searchCanon("river", { ...none, entries })[0].hits[0]).toMatchObject({ entryId: "t1", excerpt: null });
  });

  // Bug caught: a clue, a step or a passage found but opening nothing, or opening itself (they have no page of their own).
  it("finds clues, force steps and passages and points each at the entry it belongs to", () => {
    const groups = searchCanon("lamp", {
      ...none,
      entries,
      clues: [clue({ title: "A lamp in the cellar" })],
      steps: [step({ title: "Lamps go out" })],
      passages: [passage({ title: "The last lamp", body: null }), passage({ id: "p2", title: "", body: doc("A lamplighter's oath") })],
    });
    expect(groups.map((g) => [g.section, g.hits.map((h) => [h.entryId, h.kind])])).toEqual([
      ["moving", [["f1", "Step"]]],
      ["secrets", [["s1", "Clue"]]],
      ["lore", [["l1", "Passage"], ["l1", "Passage"]]],
    ]);
  });

  // Bug caught: a clue of a secret the arc filter left out, or that is gone, still showing and opening nothing.
  it("leaves out a clue, step or passage whose entry is not in the entries it was given", () => {
    const groups = searchCanon("lamp", { ...none, entries: [entries[2]], clues: [clue({ title: "lamp" })], passages: [passage({ title: "lamp" })], steps: [] });
    expect(groups).toEqual([]);
  });

  // Bug caught: groups in the order they were found, so Lore could read above Truths against the contents column.
  it("orders the groups as the contents column does, and counts a question with the secrets", () => {
    const groups = searchCanon("the", { ...none, entries });
    expect(groups.map((g) => g.section)).toEqual(["truths", "moving", "secrets", "lore"]);
    expect(groups.find((g) => g.section === "secrets")!.hits.map((h) => h.entryId)).toEqual(["s1", "q1"]);
  });
});
