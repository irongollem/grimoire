/*
 * The one pre-layout pass over a document's HTML, shared by the live preview
 * (ScriptoriumPreviewPane.vue) and the PDF export (useScriptoriumPdf.ts).
 * Each step has to run before Paged.js decides where to break, and the two
 * callers used to chain them by hand; one function keeps the preview and the
 * exported PDF paginating identically.
 */
import type { ScriptoriumPageSize } from "@/types/scriptorium.types";
import { classifyLongBoxes } from "./pagedBoxes";
import { groupWrappedImages } from "./pagedFloats";
import { promoteTableHeaders } from "./pagedTables";
import { expandTocPlaceholder } from "./pagedToc";
import type { BookHeading } from "./pagedToc";
import { stripTrailingEmptyParagraphs } from "./stripTrailingEmpty";

export interface PreparePagedBodyOptions {
  showPageNumbers: boolean;
  pageSize: ScriptoriumPageSize;
  isTwoColumn: boolean;
  /**
   * The headings of the whole book, for a chapter laid out on its own: its
   * contents page lists the book, not just the chapter it sits in.
   */
  bookHeadings?: BookHeading[];
}

export function preparePagedBody(html: string, opts: PreparePagedBodyOptions): string {
  // The TOC expands to full height first so heading page numbers stay right
  // even when it overflows onto extra pages (#465).
  const toc = expandTocPlaceholder(stripTrailingEmptyParagraphs(html), {
    showPageNumbers: opts.showPageNumbers,
    pageSize: opts.pageSize,
    headings: opts.bookHeadings,
  });
  const body = groupWrappedImages(classifyLongBoxes(promoteTableHeaders(toc)));
  return opts.isTwoColumn ? `<div class="phb-two-col">${body}</div>` : body;
}
