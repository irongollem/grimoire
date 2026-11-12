import { describe, expect, it } from "vitest";
import { followParagraph, stayOnPage } from "./anchorChange";
import type { PageFurnitureItem } from "@/scriptorium/types";

function art(over: Partial<PageFurnitureItem>): PageFurnitureItem {
  return { id: "f1", kind: "art", anchor: { type: "page", chapterId: "c1", page: 2 }, x: 20, y: 60, width: 30, z: "over", props: { src: "a" }, ...over };
}

describe("changing what a picture stays with", () => {
  // Fails on: "With its paragraph" keeping the page-relative y, which story 3 now reads as an offset from the paragraph, so the picture jumps by the paragraph's own distance from the top.
  it("With its paragraph keeps the picture where it is drawn", () => {
    const moved = followParagraph(art({ y: 60 }), "b9", 35);
    expect(moved.anchor).toEqual({ type: "block", blockId: "b9" });
    // Drawn at 60% of the page, paragraph at 35%: 25% below the paragraph's top.
    expect(moved.y).toBe(25);
  });

  // Fails on: a following picture's offset being kept as a page coordinate when it is pinned to its page.
  it("On page keeps a following picture where it is drawn", () => {
    const stayed = stayOnPage(art({ anchor: { type: "block", blockId: "b9" }, y: 25 }), { chapterId: "c1", page: 2 }, 60);
    expect(stayed?.anchor).toEqual({ type: "page", chapterId: "c1", page: 2 });
    expect(stayed?.y).toBe(60);
  });

  it("does not guess where a following picture is drawn", () => {
    expect(stayOnPage(art({ anchor: { type: "block", blockId: "b9" }, y: 25 }), { chapterId: "c1", page: 2 }, null)).toBeNull();
  });

  // Fails on: a cornered picture's inset being turned into a paragraph offset; it is pinned to the paper's edges.
  it("leaves a cornered picture's inset alone", () => {
    const cornered = art({ corner: "bottom-right", x: 3, y: 4 });
    expect(followParagraph(cornered, "b9", 35)).toMatchObject({ x: 3, y: 4, anchor: { type: "block", blockId: "b9" } });
  });
});
