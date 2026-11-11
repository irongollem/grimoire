/*
 * Page furniture on the editor's own pages (#1175).
 *
 * In Split mode the chapter editor draws the preview's pages and knows where
 * each begins (PageBox, src/scriptorium/tiptap/pageFlow.ts). These pure helpers turn
 * that into what the furniture layer needs: which page an item is on, where
 * that page's sheet sits in the editor, and, for a picture being placed from
 * the text, what its drawn box is as a percentage of its page. All px here is
 * the unscaled 96 dpi page model, never screen pixels.
 */
import type { FurnitureAnchor, PageFurnitureItem } from "@/scriptorium/types";
import { pageAt, type PageBox } from "@/scriptorium/tiptap/pageFlow";

export interface SheetGeometry {
  width: number;
  height: number;
  /** Only the top margin matters: a PageBox starts at its text area. */
  marginTop: number;
}

export interface PageRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The whole sheet of a page, in the editor root's coordinates. */
export function pageRect(page: PageBox, g: SheetGeometry): PageRect {
  return { top: page.contentTop - g.marginTop, left: 0, width: g.width, height: g.height };
}

/** The page of this chapter an anchor lands on, or null when it is on none (another chapter, a deleted block). */
export function pageForAnchor(
  anchor: FurnitureAnchor,
  chapterId: string,
  pages: readonly PageBox[],
  blockPos: (blockId: string) => number | null,
): PageBox | null {
  if (anchor.type === "page") {
    return anchor.chapterId === chapterId ? (pages.find((p) => p.page === anchor.page) ?? null) : null;
  }
  const pos = blockPos(anchor.blockId);
  return pos === null ? null : pageAt(pages, pos);
}

/** This chapter's furniture grouped by the editor page it is drawn on. */
export function itemsByPage(
  items: readonly PageFurnitureItem[],
  chapterId: string,
  pages: readonly PageBox[],
  blockPos: (blockId: string) => number | null,
): Map<PageBox, PageFurnitureItem[]> {
  const out = new Map<PageBox, PageFurnitureItem[]>();
  for (const item of items) {
    const page = pageForAnchor(item.anchor, chapterId, pages, blockPos);
    if (!page) continue;
    const list = out.get(page);
    if (list) list.push(item);
    else out.set(page, [item]);
  }
  return out;
}

const pct = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));

/** An image's drawn box (root coordinates) as the x / y / width of art placed on `page`. */
export function placementFromBox(
  box: { top: number; left: number; width: number },
  page: PageBox,
  g: SheetGeometry,
): { x: number; y: number; width: number } {
  const sheet = pageRect(page, g);
  return {
    x: pct(((box.left - sheet.left) / sheet.width) * 100),
    y: pct(((box.top - sheet.top) / sheet.height) * 100),
    width: pct((box.width / sheet.width) * 100),
  };
}

/** The nearest block id before position `index`, else the nearest after it, else null. */
export function neighbourBlockId(ids: readonly (string | null)[], index: number): string | null {
  for (let i = index - 1; i >= 0; i--) if (ids[i]) return ids[i];
  for (let i = index + 1; i < ids.length; i++) if (ids[i]) return ids[i];
  return null;
}
