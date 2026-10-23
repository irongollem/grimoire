/**
 * Cuts the printed book into A5 pages with Paged.js (#1085), the way Scriptorium's PDF export does: in an off-screen
 * host of the main document, because Paged.js needs real layout and injects its page rules into `document.head`.
 * What comes back is plain strings (the laid-out pages and the rules Paged.js added), so the host and those rules
 * are gone from the app before the caller goes on to print.
 */

import { Previewer } from "pagedjs";
import { pagedStyleElements, removePagedStyles } from "@/lib/scriptorium/pagedStyles";
import { compactPrintImages } from "@/lib/scriptorium/printImages";
import { applyFolios } from "./folios";
import { DOCUMENT_CSS } from "./bookCss";

export interface LaidOutBook {
  /** The `.pagedjs_pages` markup. */
  pagesHtml: string;
  /** The page-sizing and margin-box rules Paged.js injected, serialised. */
  pagedStyles: string;
  pageCount: number;
}

/** Paged.js writes through `insertRule`, so a style element's `textContent` is empty; read its rules instead. */
function serializeStyle(el: HTMLStyleElement): string {
  try {
    return Array.from(el.sheet?.cssRules ?? []).map((r) => r.cssText).join("\n");
  } catch {
    return el.textContent ?? "";
  }
}

/**
 * Paged.js keeps the running-head text of each page in custom properties on the page's `style`, written as a string
 * with no closing quote (`"I · The Atlas`). The browser tolerates that when it is set from script, but read back
 * from the serialised HTML it swallows every property after it, and the heads print empty. Close them.
 */
/** Whether a CSS string value opens a quote it never closes. */
export function isOpenString(value: string): boolean {
  let open = false;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\") i++;
    else if (value[i] === '"') open = !open;
  }
  return open;
}

export function closePagedStrings(pages: Iterable<HTMLElement>): void {
  for (const page of pages) {
    for (const name of Array.from(page.style)) {
      if (!name.startsWith("--pagedjs-string-")) continue;
      const value = page.style.getPropertyValue(name).trim();
      if (isOpenString(value)) page.style.setProperty(name, `${value}"`);
    }
  }
}

/** The faces the book is set in. Loaded before layout: a face still arriving would be measured as its fallback. */
const BOOK_FONTS = [
  "400 1rem Cinzel",
  "600 1rem Cinzel",
  "700 1rem Cinzel",
  "400 1rem Alegreya",
  "500 1rem Alegreya",
  "700 1rem Alegreya",
  "italic 400 1rem Alegreya",
  "italic 700 1rem Alegreya",
];

export async function layoutBook(markup: string, css: string): Promise<LaidOutBook> {
  const host = document.createElement("div");
  // px on purpose: the width Paged.js lays out against, at 96 dpi; a rem width would follow the root font size.
  host.style.cssText = "position:fixed; left:-99999px; top:0; width:794px;";
  document.body.appendChild(host);

  const documentRules = document.createElement("style");
  documentRules.textContent = DOCUMENT_CSS;
  document.head.appendChild(documentRules);

  const previewer = new Previewer();
  try {
    // A face that cannot load falls back as it would for a reader; the layout goes on.
    await Promise.all(BOOK_FONTS.map((face) => document.fonts.load(face, "Aa").catch(() => [])));
    await previewer.preview(markup, [{ "open-book.css": css }], host);
    await document.fonts.ready;
    // Pictures redrawn at print size, before the pages are copied (see printImages.ts).
    await compactPrintImages(host);
    closePagedStrings(host.querySelectorAll<HTMLElement>(".pagedjs_page"));
    applyFolios(host);
    return {
      pagedStyles: pagedStyleElements(previewer).map(serializeStyle).join("\n"),
      pagesHtml: host.innerHTML,
      pageCount: host.querySelectorAll(".pagedjs_page").length,
    };
  } finally {
    documentRules.remove();
    host.remove();
    removePagedStyles(previewer);
  }
}
