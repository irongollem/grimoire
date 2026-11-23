import { describe, expect, it } from "vitest";
import { CANON_SECTIONS, plainTextToTiptap, sectionCounts, sectionOfPart, startSteps, type CanonSectionId } from "./canonParts";
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
    expect(counts).toEqual({ premise: 2, truths: 1, moving: 0, secrets: 0, world: 0, life: 0, lore: 1, backstories: 0, chronicle: 0, table: 0 });
  });

  it("counts secrets and open questions as one part, so the contents column adds up to what the part lists", () => {
    const counts = sectionCounts([entry("secret", "1"), entry("question", "2"), entry("question", "3"), entry("truth", "4")]);
    expect(counts.secrets).toBe(3);
  });

  // Bug caught (#1255 item 9): an answered question or an ended force kept counting, so the contents column and the
  // start strip said something was open or moving when it was not.
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
    expect(startSteps(sectionCounts([canonEntry({ id: "2", part: "force", closed_as: "faded", closed_at: "t" })]), false)[2].done).toBe(false);
  });

  it("counts forces under What is moving, and keeps it between Truths and Secrets as the contents column draws it", () => {
    expect(sectionCounts([entry("force", "1"), entry("force", "2"), entry("truth", "3")]).moving).toBe(2);
    expect(CANON_SECTIONS.map((s) => s.numeral)).toEqual(["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "✦"]);
    expect(CANON_SECTIONS.find((s) => s.id === "moving")?.parts).toEqual(["force"]);
  });

  it("puts How the world works before Who and what lives here and Lore, and gives them no entries to count", () => {
    const ids = CANON_SECTIONS.map((s) => s.id);
    expect(ids.indexOf("world")).toBe(ids.indexOf("lore") - 2);
    expect(CANON_SECTIONS.find((s) => s.id === "world")?.parts).toEqual([]);
  });

  // Bug caught (#1255 item 31): the ecology listed after Lore, or took a part of its own so that a truth about a habitat
  // was counted twice (under Truths and under Life), or the parts after it kept their old numerals.
  it("puts Who and what lives here (VI) right after How the world works, renumbers the parts after it, and counts no entries", () => {
    const life = CANON_SECTIONS.find((s) => s.id === "life");
    const ids = CANON_SECTIONS.map((s) => s.id);
    expect(ids.indexOf("life")).toBe(ids.indexOf("world") + 1);
    expect(life).toMatchObject({ numeral: "VI", short: "Life", parts: [], counted: false });
    expect(Object.fromEntries(CANON_SECTIONS.map((s) => [s.id, s.numeral]))).toMatchObject({ lore: "VII", backstories: "VIII", chronicle: "IX" });
    expect(sectionCounts([entry("truth", "1")]).life).toBe(0);
  });

  // Bug caught: the Chronicle or What the table added listed before Lore, or the table's part numbered like a chapter.
  it("puts the Chronicle after Lore and What the table added last, with no entries of their own to count", () => {
    const ids = CANON_SECTIONS.map((s) => s.id);
    expect(ids.slice(-4)).toEqual(["lore", "backstories", "chronicle", "table"]);
    expect(CANON_SECTIONS.find((s) => s.id === "chronicle")?.parts).toEqual([]);
    expect(CANON_SECTIONS.find((s) => s.id === "table")?.parts).toEqual([]);
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

describe("startSteps", () => {
  const counts = (over: Partial<Record<CanonSectionId, number>> = {}) =>
    Object.fromEntries(CANON_SECTIONS.map((s) => [s.id, over[s.id] ?? 0])) as Record<CanonSectionId, number>;

  // Bug caught: the pitch judged by the premise count, so a theme alone ticked "Write the pitch".
  it("marks each step from its own part, and the pitch from hasPitch", () => {
    const steps = startSteps(counts({ premise: 3, truths: 1 }), false);
    expect(steps.map((s) => [s.part, s.done])).toEqual([["premise", false], ["truths", true], ["moving", false], ["secrets", false]]);
    expect(startSteps(counts(), true)[0].done).toBe(true);
  });

  // Bug caught: the strip never going away, because completion was not detectable from the steps.
  it("is all done only when every step is", () => {
    expect(startSteps(counts({ truths: 1, moving: 1, secrets: 1 }), true).every((s) => s.done)).toBe(true);
    expect(startSteps(counts({ truths: 1, moving: 1 }), true).every((s) => s.done)).toBe(false);
  });
});
