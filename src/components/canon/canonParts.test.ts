import { describe, expect, it } from "vitest";
import { plainTextToTiptap, sectionCounts } from "./canonParts";
import type { CanonEntry } from "@/types/canon.types";

const entry = (part: CanonEntry["part"], id: string): CanonEntry => ({
  id, user_id: "u", campaign_id: "c", part, premise_kind: part === "premise" ? "theme" : null,
  knowledge: part === "truth" ? "all" : null, title: "", body: null, sort_order: 0, player_visible_to: [],
  image_url: null, ai_provenance: null, created_at: "", updated_at: "",
});

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
    expect(counts).toEqual({ premise: 2, truths: 1 });
  });
});
