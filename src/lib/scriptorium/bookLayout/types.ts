import type { PagedStylesheet } from "pagedjs";
import type { ScriptoriumPageSize, ScriptoriumTheme } from "@/types/scriptorium.types";
import type { PageFurnitureItem } from "@/types/scriptorium.types";
import type { RenderFurnitureOptions } from "../furniture/renderFurniture";

/** One chapter of the book: the unit that is laid out, and laid out again, on its own. */
export interface BookChapterInput {
  id: string;
  html: string;
}

/**
 * Everything but the chapters' text that decides how the book comes out.
 * `pageSize`, `isTwoColumn`, `inkFriendly`, `theme` and `showPageNumbers`
 * change how a chapter lays out, so a change to one lays every chapter out
 * again. `pageNumberStart` and `footerText` only change what is written onto
 * the laid-out pages, so they cost no layout at all.
 */
export interface BookLayoutSettings {
  pageSize: ScriptoriumPageSize;
  isTwoColumn: boolean;
  showPageNumbers: boolean;
  pageNumberStart: number;
  footerText: string;
  inkFriendly: boolean;
  theme: ScriptoriumTheme;
}

export interface BookLayoutInput {
  chapters: BookChapterInput[];
  settings: BookLayoutSettings;
  /** What Paged.js consumes: the per-document `@page` CSS. */
  stylesheets: PagedStylesheet[];
  /** Page furniture, drawn in the post-pass. Block anchors and (chapter, page) anchors both resolve. */
  furniture?: { items: PageFurnitureItem[]; options?: RenderFurnitureOptions };
}

export interface BookLayoutOptions {
  /** Laid out first (the chapter being edited); the others follow in book order. */
  focusChapterId?: string | null;
  /** Checked between chapters and after each one: true abandons the layout (resolves null). */
  shouldAbort?: () => boolean;
  /** Called after each chapter is settled (laid out or taken from the cache). */
  onChapter?: (progress: { done: number; total: number; chapterId: string; fromCache: boolean }) => void;
}

/** One physical page of the book, in order. */
export interface BookPageInfo {
  chapterId: string;
  /** 1-based within its chapter; null for a blank page, which belongs to no chapter's pages. */
  pageInChapter: number | null;
  /** 0-based position among all the book's pages, blanks included. */
  globalIndex: number;
  blank: boolean;
  /** The printed page number; null for a cover, a skipped page or a blank. */
  label: string | null;
}

export interface BookChapterSpan {
  id: string;
  /** Pages the chapter's own text takes (its blank page excluded). 0 for an empty chapter. */
  pageCount: number;
  /** 0-based physical index of the chapter's first and last page; null for an empty chapter. */
  firstIndex: number | null;
  lastIndex: number | null;
  /** The printed numbers of its first and last numbered page ("Pages 175 to 191"); null if none is numbered. */
  firstLabel: string | null;
  lastLabel: string | null;
}

export interface BookLayoutResult {
  /** All physical pages, blank ones included. */
  pageCount: number;
  pages: BookPageInfo[];
  chapters: BookChapterSpan[];
  /** Which chapters were laid out by Paged.js this call; the rest came from the cache. */
  laidOutChapterIds: string[];
  layoutMs: number;
}

export interface BookLayout {
  /**
   * Lays the book out into the host, one Paged.js run per chapter, then writes
   * labels, footers, contents-page numbers and furniture onto all the pages in
   * book order. Resolves null when `shouldAbort` called it off.
   */
  layout(input: BookLayoutInput, options?: BookLayoutOptions): Promise<BookLayoutResult | null>;
  /** The `<style>` elements the newest run left in the document head (what the export serialises). */
  styleElements(): HTMLStyleElement[];
  /**
   * Moves every page into one `.pagedjs_pages` wrapper, for the export, which
   * cuts the markup into runs of whole pages. Drops the cache: the chapters'
   * own containers are gone.
   */
  flattenPages(): void;
  /** Takes the laid-out book and its styles out of the document. */
  dispose(): void;
}
