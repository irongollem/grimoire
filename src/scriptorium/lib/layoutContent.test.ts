// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { chapterLayoutHtml, contentForLayout } from "./layoutContent";

const p = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });
const secret = (text: string): JSONContent => ({ type: "secretBlock", attrs: { secretId: crypto.randomUUID() }, content: [p(text)] });
const lens = (bright: string, deep: string): JSONContent => ({
  type: "lensPair",
  content: [
    { type: "lensBright", content: [p(bright)] },
    { type: "lensDeep", content: [p(deep)] },
  ],
});

describe("chapterLayoutHtml", () => {
  it("never lays a DM-only block out, in a book or a handout", () => {
    const chapter = doc(p("Public"), secret("The butler did it"));
    for (const kind of ["book", "handout"] as const) {
      const html = chapterLayoutHtml(chapter, kind);
      expect(html, kind).toContain("Public");
      expect(html, kind).not.toContain("butler");
      expect(html, kind).not.toContain("secretBlock");
    }
  });

  it("finds a DM-only block nested inside another block", () => {
    const chapter = doc({ type: "blockquote", content: [p("Quoted"), secret("Nested secret")] });
    expect(chapterLayoutHtml(chapter, "book")).not.toContain("Nested secret");
  });

  it("a handout drops the Deep half of a lens pair and keeps the Bright blocks bare", () => {
    const html = chapterLayoutHtml(doc(lens("Warm room", "Fire to be let go")), "handout");
    expect(html).toContain("Warm room");
    expect(html).not.toContain("Fire to be let go");
    expect(html).not.toContain("lensPair");
  });

  it("a handout drops a Deep half even when it sits outside a pair", () => {
    const stray: JSONContent = { type: "lensDeep", content: [p("stray deep")] };
    expect(chapterLayoutHtml(doc(p("kept"), stray), "handout")).not.toContain("stray deep");
  });

  it("a book keeps both readings of a lens pair", () => {
    const html = chapterLayoutHtml(doc(lens("Warm room", "Fire to be let go")), "book");
    expect(html).toContain("Warm room");
    expect(html).toContain("Fire to be let go");
  });

  it("a chapter that was only a secret is one blank paragraph, not an empty document", () => {
    const out = contentForLayout(doc(secret("only this")), "book");
    expect(out.content).toEqual([{ type: "paragraph" }]);
  });
});
