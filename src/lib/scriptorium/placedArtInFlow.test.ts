import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import type { PageFurnitureItem } from "@/types/scriptorium.types";
import { parsePlacedArt, placedArtInFlow, placedArtOfFurniture } from "./placedArtInFlow";

const para = (blockId: string, text: string): JSONContent => ({
  type: "paragraph",
  attrs: { blockId },
  content: [{ type: "text", text }],
});
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });
const types = (d: JSONContent) => d.content?.map((n) => n.type);

describe("placedArtInFlow", () => {
  it("puts the picture right after its own block, not at the end or the start", () => {
    const out = placedArtInFlow(doc(para("a", "one"), para("b", "two"), para("c", "three")), [
      { blockId: "b", src: "https://x.test/art.webp" },
    ]);
    expect(types(out)).toEqual(["paragraph", "paragraph", "image", "paragraph"]);
    expect(out.content?.[2].attrs?.src).toBe("https://x.test/art.webp");
  });

  it("an anchor to a block the player cannot see adds nothing", () => {
    const content = doc(para("a", "one"));
    expect(placedArtInFlow(content, [{ blockId: "gone", src: "https://x.test/a.webp" }])).toEqual(content);
  });

  it("anchored inside a list, the picture follows the whole list instead of landing between its items", () => {
    const list: JSONContent = {
      type: "bulletList",
      content: [{ type: "listItem", content: [para("inner", "item")] }],
    };
    const out = placedArtInFlow(doc(list, para("z", "after")), [{ blockId: "inner", src: "https://x.test/a.webp" }]);
    expect(types(out)).toEqual(["bulletList", "image", "paragraph"]);
  });

  it("two pictures on one block keep furniture order", () => {
    const out = placedArtInFlow(doc(para("a", "one")), [
      { blockId: "a", src: "https://x.test/1.webp" },
      { blockId: "a", src: "https://x.test/2.webp" },
    ]);
    expect(out.content?.slice(1).map((n) => n.attrs?.src)).toEqual(["https://x.test/1.webp", "https://x.test/2.webp"]);
  });

  it("leaves the stored chapter untouched", () => {
    const content = doc(para("a", "one"));
    placedArtInFlow(content, [{ blockId: "a", src: "https://x.test/a.webp" }]);
    expect(content.content).toHaveLength(1);
  });
});

describe("parsePlacedArt", () => {
  it("drops entries without a string blockId or src, and anything that is not a list", () => {
    expect(
      parsePlacedArt([
        { blockId: "a", src: "https://x.test/a.webp" },
        { blockId: 4, src: "https://x.test/a.webp" },
        { blockId: "b" },
        null,
        "text",
      ]),
    ).toEqual([{ blockId: "a", src: "https://x.test/a.webp" }]);
    expect(parsePlacedArt(null)).toEqual([]);
  });

  it("drops a script-capable src rather than rendering it", () => {
    expect(parsePlacedArt([{ blockId: "a", src: "javascript:alert(1)" }])).toEqual([]);
    expect(parsePlacedArt([{ blockId: "a", src: "data:text/html;base64,AAAA" }])).toEqual([]);
  });
});

describe("placedArtOfFurniture", () => {
  const item = (over: Partial<PageFurnitureItem>): PageFurnitureItem => ({
    id: "f",
    kind: "art",
    anchor: { type: "block", blockId: "a" },
    x: 0,
    y: 0,
    width: 30,
    z: "over",
    props: { src: "https://x.test/a.webp" },
    ...over,
  });

  it("takes block-anchored art only, as a page-anchored picture has no block to follow", () => {
    const art = placedArtOfFurniture([
      item({}),
      item({ anchor: { type: "page", chapterId: "c", page: 2 } }),
      item({ kind: "watercolor", props: { src: "https://x.test/w.webp" } }),
    ]);
    expect(art).toEqual([{ blockId: "a", src: "https://x.test/a.webp" }]);
  });
});
