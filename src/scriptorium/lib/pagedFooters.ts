/*
 * Footer injection for the Paged.js book preview (Phase B, #330).
 *
 * Paged.js reads break/geometry CSS but can't express Scriptorium's
 * content-driven page numbering (skip/reset markers, cover suppression, start
 * offset). So footers are injected into the rendered pages afterwards, reusing
 * the shared numbering algorithm — giving the same behaviour as the legacy
 * preview and PDF export.
 *
 * A footer is drawn on numbered pages, and on a page left out of the count
 * only when that page keeps its running title (#1176 story 6, pageHasFooter).
 * Covers, "no footer" pages and page-numbers-off get none. The editor draws
 * the very same footer element (buildFooter) from what the preview measured.
 */

import { flagsFromPage, computePageLabels, pageHasFooter, type PageNumberFlags } from "./pageNumbering";

export interface PagedFooterOptions {
  showPageNumbers: boolean;
  start: number;
  /**
   * The running title of each page, in page order (lib/footerTitle.ts says
   * which: the book's on a left page, the chapter's or custom text on a right).
   */
  titles: string[];
  /**
   * Labels already worked out for these pages (the book layout computes them
   * once for footers and the contents page alike). Without it they are derived
   * from the pages.
   */
  labels?: (string | null)[];
  /** The numbering flags of each page, when the caller already has them. */
  flags?: PageNumberFlags[];
}

/** Recto (even index = right page) → number on the right; verso → left. */
export function isRectoIndex(index: number): boolean {
  return index % 2 === 0;
}

/** The footer element a page carries; the editor builds the same one. */
export function buildFooter(doc: Document, f: { label: string | null; title: string; recto: boolean }): HTMLElement {
  const footer = doc.createElement("div");
  footer.className = `sc-footer ${f.recto ? "sc-footer--recto" : "sc-footer--verso"}`;

  const text = doc.createElement("span");
  text.className = "sc-footer-text";
  text.textContent = f.title;

  // A page that keeps its title but is left out of the count has no number to print.
  if (f.label === null) {
    footer.append(text);
    return footer;
  }
  const numLeft = doc.createElement("span");
  numLeft.className = "sc-footer-num sc-footer-num--left";
  numLeft.textContent = f.label;
  const numRight = doc.createElement("span");
  numRight.className = "sc-footer-num sc-footer-num--right";
  numRight.textContent = f.label;
  footer.append(numLeft, text, numRight);
  return footer;
}

/**
 * Inject `.sc-footer` elements into each `.pagedjs_page` in `container`,
 * styled by the shared theme CSS. Idempotent — clears prior footers first.
 */
export function injectPagedFooters(container: HTMLElement, opts: PagedFooterOptions): void {
  const pages = Array.from(container.querySelectorAll<HTMLElement>(".pagedjs_page"));
  const flags = opts.flags ?? pages.map(flagsFromPage);
  const labels =
    opts.labels ??
    computePageLabels(flags, {
      showPageNumbers: opts.showPageNumbers,
      start: opts.start,
    });

  pages.forEach((page, i) => {
    page.querySelector(".sc-footer")?.remove();
    if (!pageHasFooter(flags[i], labels[i], opts.showPageNumbers)) return;
    const box = page.querySelector<HTMLElement>(".pagedjs_pagebox") ?? page;
    box.appendChild(
      buildFooter(page.ownerDocument, { label: labels[i], title: opts.titles[i], recto: isRectoIndex(i) }),
    );
  });
}
