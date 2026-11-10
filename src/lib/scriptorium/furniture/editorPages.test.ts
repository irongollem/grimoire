import { describe, it, expect } from "vitest";
import { itemsByPage, neighbourBlockId, pageForAnchor, pageRect, placementFromBox } from "./editorPages";
import { createFurnitureItem } from "./model";
import type { PageBox } from "@/lib/tiptap/pageFlow";

const G = { width: 800, height: 1000, marginTop: 50 };
const pages: PageBox[] = [
  { page: 1, startPos: 0, contentTop: 50, contentHeight: 900 },
  { page: 2, startPos: 40, contentTop: 1124, contentHeight: 900 },
];
const blocks: Record<string, number> = { a: 5, b: 60 };
const blockPos = (id: string) => blocks[id] ?? null;

describe("editor page furniture", () => {
  it("a block-anchored item is drawn on the page its block is on", () => {
    expect(pageForAnchor({ type: "block", blockId: "b" }, "c1", pages, blockPos)?.page).toBe(2);
    expect(pageForAnchor({ type: "block", blockId: "a" }, "c1", pages, blockPos)?.page).toBe(1);
  });

  it("an item whose block is gone, or that is on another chapter, is not drawn", () => {
    expect(pageForAnchor({ type: "block", blockId: "gone" }, "c1", pages, blockPos)).toBeNull();
    expect(pageForAnchor({ type: "page", chapterId: "other", page: 1 }, "c1", pages, blockPos)).toBeNull();
    expect(pageForAnchor({ type: "page", chapterId: "c1", page: 9 }, "c1", pages, blockPos)).toBeNull();
  });

  it("groups items by their page and leaves out the ones that are on none", () => {
    const x = createFurnitureItem("art", { type: "page", chapterId: "c1", page: 2 });
    const y = createFurnitureItem("art", { type: "block", blockId: "a" });
    const z = createFurnitureItem("art", { type: "page", chapterId: "other", page: 1 });
    const grouped = itemsByPage([x, y, z], "c1", pages, blockPos);
    expect(grouped.get(pages[1])).toEqual([x]);
    expect(grouped.get(pages[0])).toEqual([y]);
    expect(grouped.size).toBe(2);
  });

  it("a page's sheet starts a top margin above its text area", () => {
    expect(pageRect(pages[1], G)).toEqual({ top: 1074, left: 0, width: 800, height: 1000 });
  });

  it("an item placed from an image keeps the image's place as a percentage of its page", () => {
    // Image drawn 200px right and 150px into page 2's sheet, 400px wide.
    const got = placementFromBox({ top: 1074 + 150, left: 200, width: 400 }, pages[1], G);
    expect(got).toEqual({ x: 25, y: 15, width: 50 });
  });

  it("a placement never leaves the page", () => {
    const got = placementFromBox({ top: -20, left: 900, width: 2000 }, pages[0], G);
    expect(got).toEqual({ x: 100, y: 0, width: 100 });
  });

  it("anchors a placed image to the block before it, else the one after, else none", () => {
    expect(neighbourBlockId(["a", null, "c"], 1)).toBe("a");
    expect(neighbourBlockId([null, null, "c"], 1)).toBe("c");
    expect(neighbourBlockId([null], 0)).toBeNull();
  });
});
