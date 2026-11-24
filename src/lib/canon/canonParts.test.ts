import { describe, expect, it } from "vitest";
import { CANON_SECTIONS, plainTextToTiptap, sectionCounts, sectionFromWord, sectionOfPart } from "./canonParts";
import type { CanonEntry } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const entry = (part: CanonEntry["part"], id: string): CanonEntry =>
  canonEntry({ id, part, premise_kind: part === "premise" ? "theme" : null, knowledge: part === "truth" ? "all" : null, title: "" });

describe("plainTextToTiptap", () => {
  it("makes one paragraph per blank-line block, so a started pitch keeps the default text's paragraphs", () => {
    const doc = JSON.parse(plainTextToTiptap("First block.\n\nSecond block."));
    expect(doc.content.map((p: { content: { text: string }[] }) => p.content[0].text)).toEqual(["First block.", "Second block."]);
  });

  it("keeps a single newline as a hard break instead of a newline inside a text node", () => {
    const doc = JSON.parse(plainTextToTiptap("a\nb"));
    expect(doc.content[0].content).toEqual([{ type: "text", text: "a" }, { type: "hardBreak" }, { type: "text", text: "b" }]);
  });

  it("is never an empty document, which an editor cannot open", () => {
    expect(JSON.parse(plainTextToTiptap("  \n\n "))).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});

describe("sectionCounts", () => {
  it("counts a truth under Truths and not under Premise, so the contents column shows each chapter's own number", () => {
    const counts = sectionCounts([entry("premise", "1"), entry("premise", "2"), entry("truth", "3"), entry("lore", "4")]);
    expect(counts).toEqual({ premise: 2, world: 0, truths: 1, lore: 1, peoples: 0, life: 0, arcs: 0, moving: 0, secrets: 0, backstories: 0 });
  });

  it("counts secrets and open questions as one chapter, so the contents column adds up to what the chapter lists", () => {
    const counts = sectionCounts([entry("secret", "1"), entry("question", "2"), entry("question", "3"), entry("truth", "4")]);
    expect(counts.secrets).toBe(3);
  });

  // Bug caught (#1255 item 9): an answered question or an ended force kept counting, so the contents column said
  // something was open or moving when it was not.
  it("leaves out answered questions and ended forces", () => {
    const rows = [
      entry("force", "1"),
      canonEntry({ id: "2", part: "force", closed_as: "stopped", closed_at: "t" }),
      entry("question", "3"),
      canonEntry({ id: "4", part: "question", closed_as: "answered", closed_at: "t" }),
      entry("secret", "5"),
    ];
    const counts = sectionCounts(rows);
    expect(counts.moving).toBe(1);
    expect(counts.secrets).toBe(2);
  });
});

describe("the Arcs chapter", () => {
  // Bug caught: arcs counted from entries (always 0), so the contents said "0" beside a story with three acts.
  it("takes its count from the arcs the caller read, and leads the story group", () => {
    expect(sectionCounts([entry("truth", "1")], 3).arcs).toBe(3);
    expect(CANON_SECTIONS.filter((s) => s.group === "story")[0]?.id).toBe("arcs");
  });
});

describe("the book's chapters", () => {

  // Bug caught: the Chronicle or the table's lines still named as chapters, so a stored or linked id opened a part the page no longer draws.
  it("is not a chapter for the Chronicle or what the table added, and a ?section=table link lands on Truths", () => {
    expect(CANON_SECTIONS.map((s) => s.id)).not.toContain("chronicle");
    expect(CANON_SECTIONS.map((s) => s.id)).not.toContain("table");
    expect(sectionFromWord("table")).toBe("truths");
    expect(sectionFromWord("chronicle")).toBeNull();
    expect(sectionFromWord("forces")).toBe("moving");
  });
});

describe("sectionOfPart", () => {
  // Bug caught: a search hit on an open question landed on the Truths part (the old ternary's fallback), so the contents column and the scroll pointed at the wrong section.
  it.each([
    ["question", "secrets"],
    ["secret", "secrets"],
    ["premise", "premise"],
    ["force", "moving"],
    ["backstory", "backstories"],
    ["truth", "truths"],
    ["lore", "lore"],
  ] as const)("puts a %s entry in the %s part", (part, section) => {
    expect(sectionOfPart(part)).toBe(section);
  });
});
