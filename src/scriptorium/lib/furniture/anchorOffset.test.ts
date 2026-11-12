import { describe, it, expect } from "vitest";
import { clampTop, drawnTopPct, followsBlock, offsetFromDrawnTop, reanchored, topPct } from "./anchorOffset";
import { movedNoticeText } from "./movedNotice";
import { createFurnitureItem } from "./model";

describe("anchor offset", () => {
  it("a paragraph moving to the next page takes its picture with it to the same place beside it", () => {
    // 5% below its paragraph, wherever the paragraph is: 30% down page 2, then 10% down page 3.
    expect(drawnTopPct(5, 30, 20)).toBe(35);
    expect(drawnTopPct(5, 10, 20)).toBe(15);
  });

  it("a picture can start above its paragraph", () => {
    expect(drawnTopPct(-8, 30, 20)).toBe(22);
  });

  it("a picture never leaves the page when its paragraph sits at the foot", () => {
    expect(clampTop(95 + 5, 20)).toBe(80);
    expect(drawnTopPct(5, 95, 20)).toBe(80);
    expect(drawnTopPct(-50, 10, 20)).toBe(0);
  });

  it("a picture whose height is not known yet is only held on the page", () => {
    expect(drawnTopPct(5, 98, null)).toBe(100);
  });

  it("reads a drawn top back as the offset from the block, negative above it", () => {
    expect(offsetFromDrawnTop(35, 30)).toBe(5);
    expect(offsetFromDrawnTop(22, 30)).toBe(-8);
  });

  it("dragging the anchor to another paragraph keeps the picture where it is", () => {
    const item = createFurnitureItem("art", { type: "block", blockId: "a" }, { x: 10, y: 5 });
    // Drawn at 35% down; the new paragraph starts at 50%: the picture is 15% above it.
    const moved = reanchored(item, 35, "b", 50);
    expect(moved.anchor).toEqual({ type: "block", blockId: "b" });
    expect(drawnTopPct(moved.y, 50, 20)).toBe(35);
  });

  it("only a free picture or splatter follows a block", () => {
    const block = { type: "block", blockId: "a" } as const;
    expect(followsBlock(createFurnitureItem("art", block))).toBe(true);
    expect(followsBlock({ ...createFurnitureItem("art", block), corner: "top-left" })).toBe(false);
    expect(followsBlock(createFurnitureItem("art", { type: "page", chapterId: "c", page: 1 }))).toBe(false);
    expect(followsBlock(createFurnitureItem("watermark", block))).toBe(false);
  });

  it("a page with no height gives no top", () => {
    expect(topPct(10, 0, 0)).toBeNull();
    expect(topPct(150, 50, 1000)).toBe(10);
  });

  it("the footer line names the page for one picture and the count for several", () => {
    expect(movedNoticeText([3])).toBe("The picture moved to page 3 with its paragraph.");
    expect(movedNoticeText([3, 4])).toBe("2 pictures moved with their paragraphs.");
  });
});
