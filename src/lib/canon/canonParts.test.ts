import { describe, expect, it } from "vitest";
import { CANON_SECTIONS, plainTextToTiptap, sectionCounts } from "./canonParts";
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
  it("counts a truth under Truths and not under Premise, so the contents column shows each part's own number", () => {
    const counts = sectionCounts([entry("premise", "1"), entry("premise", "2"), entry("truth", "3"), entry("lore", "4")]);
    expect(counts).toEqual({ premise: 2, truths: 1, moving: 0, secrets: 0, world: 0, lore: 1, chronicle: 0, table: 0 });
  });

  it("counts secrets and open questions as one part, so the contents column adds up to what the part lists", () => {
    const counts = sectionCounts([entry("secret", "1"), entry("question", "2"), entry("question", "3"), entry("truth", "4")]);
    expect(counts.secrets).toBe(3);
  });

  it("counts forces under What is moving, and keeps it between Truths and Secrets as the contents column draws it", () => {
    expect(sectionCounts([entry("force", "1"), entry("force", "2"), entry("truth", "3")]).moving).toBe(2);
    expect(CANON_SECTIONS.map((s) => s.numeral)).toEqual(["I", "II", "III", "IV", "V", "VI", "VII", "✦"]);
    expect(CANON_SECTIONS.find((s) => s.id === "moving")?.parts).toEqual(["force"]);
  });

  it("puts How the world works right before Lore, and gives it no entries to count", () => {
    const ids = CANON_SECTIONS.map((s) => s.id);
    expect(ids.indexOf("world")).toBe(ids.indexOf("lore") - 1);
    expect(CANON_SECTIONS.find((s) => s.id === "world")?.parts).toEqual([]);
  });

  // Bug caught: the Chronicle or What the table added listed before Lore, or the table's part numbered like a chapter.
  it("puts the Chronicle after Lore and What the table added last, with no entries of their own to count", () => {
    const ids = CANON_SECTIONS.map((s) => s.id);
    expect(ids.slice(-3)).toEqual(["lore", "chronicle", "table"]);
    expect(CANON_SECTIONS.find((s) => s.id === "chronicle")?.parts).toEqual([]);
    expect(CANON_SECTIONS.find((s) => s.id === "table")?.parts).toEqual([]);
  });
});
