/**
 * The document the PDF renderer prints (#1085): the laid-out pages, the rules that cut them, and the fonts, in one
 * self-contained HTML string. Split from the export so the assembly can be tested without a browser or a network.
 */

import { escapeHtml } from "@/lib/escapeHtml";
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM, coverSheetCss } from "./bookCss";
import type { OpenBookLeather } from "@/types/openBook.types";

export interface BookDocumentParts {
  title: string;
  leather: OpenBookLeather;
  /** The fonts CSS with its font files already readable by the renderer (inlined as data: URIs). */
  fontsCss: string;
  pagedStyles: string;
  /** The cover sheet, which is not laid out by Paged.js. */
  coverHtml: string;
  pagesHtml: string;
}

/**
 * Paged.js has already folded the book's own rules into `pagedStyles` (it rewrites `@page` and `page:` into the
 * sheets it draws), so the raw stylesheet is not repeated here: Chrome would read its named pages a second time.
 */
/** Each laid-out `.pagedjs_page` is already a full sheet, so the print sheet itself has no margin. */
function printResetCss(): string {
  return `
@page { size: ${PAGE_WIDTH_MM}mm ${PAGE_HEIGHT_MM}mm; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.pagedjs_pages { display: block; }
.pagedjs_page { box-shadow: none !important; margin: 0 !important; break-after: page; }
.pagedjs_page:last-of-type { break-after: auto; }
`;
}

export function buildBookDocumentHtml(parts: BookDocumentParts): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(parts.title || "Open Book")}</title>` +
    `<style>${parts.fontsCss}</style>` +
    `<style>${parts.pagedStyles}</style>` +
    `<style>${coverSheetCss(parts.leather)}</style><style>${printResetCss()}</style></head>` +
    `<body><div class="pb"><div class="pb-cover-sheet">${parts.coverHtml}</div></div>${parts.pagesHtml}</body></html>`
  );
}

/** A file name for the download: illegal characters stripped, whitespace collapsed. */
export function bookPdfFilename(title: string, releaseNumber: number): string {
  const base =
    title
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+/, "") || "Open Book";
  return `${base} (release ${releaseNumber}).pdf`;
}

/** Where a release's PDF lives: the owner's folder, then the campaign, then a name that is new on every export. */
export function bookPdfPath(userId: string, campaignId: string, releaseId: string, uuid: string): string {
  return `${userId}/${campaignId}/${releaseId}-${uuid}.pdf`;
}
