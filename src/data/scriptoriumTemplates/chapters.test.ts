import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { splitIntoChapters } from "./chapters";

const h1 = (text: string): JSONContent => ({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text }] });
const h2 = (text: string): JSONContent => ({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] });
const p = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

describe("splitIntoChapters", () => {
  it("keeps the cover and contents at the head of the first chapter, not in a chapter of their own", () => {
    const chapters = splitIntoChapters(doc({ type: "coverPage" }, { type: "tocBlock" }, h1("One"), p("a"), h1("Two"), p("b")));
    expect(chapters).toHaveLength(2);
    expect(chapters[0].content.content?.map((n) => n.type)).toEqual(["coverPage", "tocBlock", "heading", "paragraph"]);
    expect(chapters[1].content.content?.[0]).toEqual(h1("Two"));
  });

  it("does not cut at a subsection heading", () => {
    expect(splitIntoChapters(doc(h1("One"), h2("Part"), p("a")))).toHaveLength(1);
  });

  it("drops the page break that dangles at a chapter's end", () => {
    const chapters = splitIntoChapters(doc(h1("One"), p("a"), { type: "pageBreak" }, h1("Two")));
    expect(chapters[0].content.content?.map((n) => n.type)).toEqual(["heading", "paragraph"]);
  });

  it("returns one chapter for a document with no headings", () => {
    expect(splitIntoChapters(doc(p("a")))).toHaveLength(1);
  });
});
