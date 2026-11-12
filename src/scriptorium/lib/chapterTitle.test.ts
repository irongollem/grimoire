import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { chapterTitle, countWords } from "./chapterTitle";

const heading = (text: string): JSONContent => ({
  type: "heading",
  attrs: { level: 1 },
  content: [{ type: "text", text }],
});
const para = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

describe("chapterTitle", () => {
  it("names the chapter after its first top-level heading, trimmed", () => {
    expect(chapterTitle(doc(para("intro"), heading("  The Flooded Mine "), heading("Second")))).toBe(
      "The Flooded Mine",
    );
  });

  it("joins a heading's marked-up runs instead of keeping only the first", () => {
    const split: JSONContent = {
      type: "heading",
      content: [{ type: "text", text: "Dragon's " }, { type: "text", text: "Lair", marks: [{ type: "bold" }] }],
    };
    expect(chapterTitle(doc(split))).toBe("Dragon's Lair");
  });

  it("ignores a heading nested in a secret block, lens pair or any other wrapper", () => {
    const secret: JSONContent = { type: "secretBlock", content: [heading("DM Secret")] };
    const pair: JSONContent = { type: "lensPair", content: [heading("Deep half")] };
    expect(chapterTitle(doc(secret, pair, heading("Public Title")))).toBe("Public Title");
    expect(chapterTitle(doc(secret, pair, para("no heading here")))).toBe("");
  });

  it("is empty for a document with no content", () => {
    expect(chapterTitle({ type: "doc" })).toBe("");
  });
});

describe("countWords", () => {
  it("counts words across blocks without fusing the last word of one to the first of the next", () => {
    expect(countWords(doc(heading("Two words"), para("and three more")))).toBe(5);
  });

  it("is zero for an empty chapter", () => {
    expect(countWords(doc({ type: "paragraph" }))).toBe(0);
  });
});
