import { describe, expect, it } from "vitest";
import { entryMatchText, entryPlainText, normalizeForMatch } from "./proseText.ts";

describe("entryPlainText", () => {
  it("returns plain text with whitespace collapsed", () => {
    expect(entryPlainText("The imp   has\t Advantage.")).toBe("The imp has Advantage.");
  });

  it("walks stored Tiptap JSON, one line per paragraph", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Melee Weapon Attack: " }, { type: "text", text: "+4 to hit" }] },
        { type: "paragraph", content: [{ type: "text", text: "Hit: 5 damage." }] },
      ],
    });
    expect(entryPlainText(doc)).toBe("Melee Weapon Attack: +4 to hit\nHit: 5 damage.");
  });

  it("treats non-doc JSON and broken JSON as plain text", () => {
    expect(entryPlainText("{not json")).toBe("{not json");
    expect(entryPlainText('{"a":1}')).toBe('{"a":1}');
  });

  it("handles list items and hard breaks", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }] },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "a" }, { type: "hardBreak" }, { type: "text", text: "b" }] },
      ],
    });
    expect(entryPlainText(doc)).toBe("one\ntwo\na\nb");
  });
});

describe("normalizeForMatch", () => {
  it("turns dashes and typographic marks into ASCII", () => {
    expect(normalizeForMatch("Recharge 5–6, −1 to hit, the dragon’s")).toBe(
      "Recharge 5-6, -1 to hit, the dragon's",
    );
  });
});

describe("entryMatchText", () => {
  it("flattens lines into one", () => {
    expect(entryMatchText("a\n\nb  c")).toBe("a b c");
  });
});
