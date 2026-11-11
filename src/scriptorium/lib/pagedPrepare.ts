/*
 * The one pre-layout pass over a document's HTML, shared by the live preview
 * (ScriptoriumPreviewPane.vue) and the PDF export (useScriptoriumPdf.ts).
 * Each step has to run before Paged.js decides where to break, and the two
 * callers used to chain them by hand; one function keeps the preview and the
 * exported PDF paginating identically.
 */
import type { ScriptoriumPageSize } from "@/scriptorium/types";
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

/**
 * Mark the chapter's first title, so a look can dress a chapter's opening (the
 * Grimoire ribbon). Runs per chapter, so each chapter of a book gets one. A
 * heading inside a cover or a box is not the chapter's title.
 */
export function markChapterOpener(html: string): string {
  if (!html.includes("<h1")) return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  const title = Array.from(container.querySelectorAll("h1")).find(
    (h) => !h.closest(".sc-cover, .sc-note, .sc-descriptive"),
  );
  if (!title) return html;
  title.classList.add("sc-chapter-opener");
  return container.innerHTML;
}

export function preparePagedBody(html: string, opts: PreparePagedBodyOptions): string {
  // The TOC expands to full height first so heading page numbers stay right
  // even when it overflows onto extra pages (#465).
  const toc = expandTocPlaceholder(stripTrailingEmptyParagraphs(html), {
    showPageNumbers: opts.showPageNumbers,
    pageSize: opts.pageSize,
    headings: opts.bookHeadings,
  });
  const body = markChapterOpener(groupWrappedImages(classifyLongBoxes(promoteTableHeaders(toc))));
  return opts.isTwoColumn ? `<div class="phb-two-col">${body}</div>` : body;
}
