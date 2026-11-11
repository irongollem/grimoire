/*
 * What the panel says about the page the caret is on (#1176, frame 02).
 *
 * "16 of 28", "3 · The Understage, page 3 of 4", and the paper line. Pure, so
 * the wording is tested without a laid-out book.
 */
import type { ScriptoriumPageSize } from "@/scriptorium/types";

/** What the shell knows about the open chapter and the book's layout. */
export interface PanelPageContext {
  /** "Grimoire · A4 · Two columns". */
  paperLabel: string;
  /** The open chapter's place in the book, 1-based, and its name. */
  chapterNumber: number;
  chapterTitle: string;
  /** A handout is one chapter on one paper: no chapter line, and its own "page 1 of 1". */
  isHandout: boolean;
  /** The label of the chapter's first page in the book ("175", "iv"), when the book has been laid out. */
  firstPageLabel: string | null;
  /** Pages in the whole book, when laid out. */
  bookPageCount: number | null;
}

export interface PageDescription {
  /** The big number: the book's page when it is a number, else the chapter's. */
  number: string;
  /** "of 28", or null when the book has not been laid out. */
  of: string | null;
  /** "3 · The Understage, page 3 of 4"; null for a handout. */
  where: string | null;
}

/** The book's page number for a page of the open chapter, or null when the chapter's first label is not a number. */
export function bookPageNumber(firstPageLabel: string | null, chapterPage: number): number | null {
  if (firstPageLabel === null || !/^\d+$/.test(firstPageLabel)) return null;
  return Number(firstPageLabel) + chapterPage - 1;
}

export function describePage(ctx: PanelPageContext, chapterPage: number, chapterPageCount: number): PageDescription {
  const inBook = bookPageNumber(ctx.firstPageLabel, chapterPage);
  const title = ctx.chapterTitle.trim();
  const chapter = title ? `${ctx.chapterNumber} · ${title}` : `Chapter ${ctx.chapterNumber}`;
  return {
    number: String(inBook ?? chapterPage),
    of: ctx.bookPageCount === null ? null : `of ${ctx.bookPageCount}`,
    where: ctx.isHandout ? null : `${chapter}, page ${chapterPage} of ${chapterPageCount}`,
  };
}

export function paperLine(lookLabel: string, pageSize: ScriptoriumPageSize, isTwoColumn: boolean): string {
  return `${lookLabel} · ${pageSize} · ${isTwoColumn ? "Two columns" : "One column"}`;
}
