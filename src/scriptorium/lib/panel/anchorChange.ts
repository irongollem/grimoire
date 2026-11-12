/*
 * Changing what a picture stays with (#1176).
 *
 * `y` means two things (story 3): a page coordinate for a picture that stays on
 * its page, an offset from the anchor paragraph's top for one that follows a
 * paragraph. Switching between them must convert, never carry the number over,
 * or the picture jumps by the paragraph's own distance from the page top.
 */
import type { PageFurnitureItem } from "@/scriptorium/types";
import { offsetFromDrawnTop } from "@/scriptorium/lib/furniture/anchorOffset";

/**
 * Follow a paragraph without moving: `y` is where the picture is drawn now
 * (a page coordinate, for a picture that stays on its page) and `blockTop` is
 * the paragraph's top, both in % of the page. A cornered picture is pinned to
 * the page's edges, not a paragraph, so its inset stays.
 */
export function followParagraph(item: PageFurnitureItem, blockId: string, blockTop: number): PageFurnitureItem {
  const anchor = { type: "block", blockId } as const;
  if (item.corner) return { ...item, anchor };
  return { ...item, anchor, y: offsetFromDrawnTop(item.y, blockTop) };
}

/** Stay on a page without moving: `drawnTop` is where a following picture is drawn now (% of the page). */
export function stayOnPage(
  item: PageFurnitureItem,
  page: { chapterId: string; page: number },
  drawnTop: number | null,
): PageFurnitureItem | null {
  const anchor = { type: "page", chapterId: page.chapterId, page: page.page } as const;
  if (item.corner || item.anchor.type === "page") return { ...item, anchor };
  if (drawnTop === null) return null;
  return { ...item, anchor, y: Math.max(0, Math.min(100, Math.round(drawnTop * 10) / 10)) };
}
