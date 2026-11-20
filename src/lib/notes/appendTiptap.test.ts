import { describe, expect, it } from "vitest";
import { appendTiptapDoc } from "./appendTiptap";

const doc = (...texts: string[]) =>
  JSON.stringify({ type: "doc", content: texts.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })) });

describe("appendTiptapDoc", () => {
  it("puts the second document's blocks after the first's, in order", () => {
    // Fails if the note's text replaces the backstory instead of following it.
    expect(JSON.parse(appendTiptapDoc(doc("old"), doc("new 1", "new 2")) as string).content).toHaveLength(3);
    expect(appendTiptapDoc(doc("old"), doc("new"))).toBe(doc("old", "new"));
  });

  it("becomes the added document when there is nothing yet", () => {
    expect(appendTiptapDoc(null, doc("new"))).toBe(doc("new"));
    expect(appendTiptapDoc("  ", doc("new"))).toBe(doc("new"));
  });

  it("leaves the base untouched when there is nothing to add", () => {
    expect(appendTiptapDoc(doc("old"), null)).toBe(doc("old"));
  });

  it("refuses text that is not a Tiptap document rather than overwriting it", () => {
    // Fails if legacy HTML in a backstory is destroyed by the append.
    expect(appendTiptapDoc("<p>legacy</p>", doc("new"))).toBeNull();
    expect(appendTiptapDoc(doc("old"), "<p>legacy</p>")).toBeNull();
  });
});
