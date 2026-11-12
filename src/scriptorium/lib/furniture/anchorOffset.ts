/*
 * Where a picture that follows its paragraph is drawn (#1176 story 3).
 *
 * A block-anchored item's `y` is the offset of its top from the top of its
 * anchor block, in % of the page height (negative: the picture starts above the
 * paragraph), and `x` stays a % of the page width. When text is written and the
 * paragraph moves, the picture moves with it and keeps its place beside it,
 * instead of keeping a place on the page the paragraph has left.
 *
 * Pure: the preview/print pass and the editor layer both measure the block and
 * the page, and everything else is decided here, so they cannot drift.
 */
import type { PageFurnitureItem } from "@/scriptorium/types";
import { fillsPage } from "@/scriptorium/lib/furniture/model";

/** Only a free picture or splatter follows a block; a cornered item is pinned to the page, a watermark and a credit place themselves. */
export function followsBlock(item: PageFurnitureItem): boolean {
  return item.anchor.type === "block" && !item.corner && !fillsPage(item) && (item.kind === "art" || item.kind === "watercolor");
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Keeps an item's top inside the page: 0 to 100 minus its height (when the height is known). */
export function clampTop(topPct: number, heightPct: number | null): number {
  const max = Math.max(0, 100 - (heightPct ?? 0));
  return Math.max(0, Math.min(max, topPct));
}

/** The top, in % of the page, a block-anchored item is drawn at. */
export function drawnTopPct(offsetPct: number, anchorTopPct: number, heightPct: number | null): number {
  return clampTop(anchorTopPct + offsetPct, heightPct);
}

/** The `y` that keeps an item drawn at `drawnTop` where it is, when it follows a block whose top is `anchorTop`. */
export function offsetFromDrawnTop(drawnTop: number, anchorTop: number): number {
  return Math.max(-100, Math.min(100, round1(drawnTop - anchorTop)));
}

/** A block's top as a % of its page, from any two tops and a page height in one unit; null when the page has no height. */
export function topPct(blockTop: number, pageTop: number, pageHeight: number): number | null {
  return pageHeight > 0 ? ((blockTop - pageTop) / pageHeight) * 100 : null;
}

/** The item moved to follow another block, staying exactly where it is drawn. */
export function reanchored(
  item: PageFurnitureItem,
  drawnTop: number,
  newBlockId: string,
  newAnchorTop: number,
): PageFurnitureItem {
  return { ...item, anchor: { type: "block", blockId: newBlockId }, y: offsetFromDrawnTop(drawnTop, newAnchorTop) };
}

/**
 * Put a drawn element at its place. `box` is the page box it sits in, which
 * gives the page height; the element's own height is measured after it is in
 * the page (an image that has not loaded has none yet, so it is placed again
 * when it does). Sizes come from layout, never from a screen scale, so a
 * transform on the page changes nothing.
 */
export function placeAtAnchor(el: HTMLElement, item: PageFurnitureItem, box: HTMLElement, anchorTop: number): void {
  el.dataset.anchorTop = String(anchorTop);
  const apply = () => {
    const h = el.offsetHeight > 0 && box.offsetHeight > 0 ? (el.offsetHeight / box.offsetHeight) * 100 : null;
    el.style.top = `${drawnTopPct(item.y, anchorTop, h)}%`;
  };
  apply();
  if (el instanceof HTMLImageElement && !el.complete) el.addEventListener("load", apply, { once: true });
}
