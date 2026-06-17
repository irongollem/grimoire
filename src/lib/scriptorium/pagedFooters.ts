/*
 * Footer injection for the Paged.js book preview (Phase B, #330).
 *
 * Paged.js reads break/geometry CSS but can't express Scriptorium's
 * content-driven page numbering (skip/reset markers, cover suppression, start
 * offset). So footers are injected into the rendered pages afterwards, reusing
 * the shared numbering algorithm — giving the same behaviour as the legacy
 * preview and PDF export.
 *
 * A footer is rendered only on numbered pages (label !== null); cover pages,
 * skipped pages, and page-numbers-off all get no footer, matching the legacy
 * `v-if="label !== null"` rule. Footer text therefore rides with the number.
 */

import { flagsFromHtml, computePageLabels } from "./pageNumbering";

export interface PagedFooterOptions {
  showPageNumbers: boolean;
  footerText: string;
  start: number;
}

/**
 * Inject `.sc-footer` elements into each `.pagedjs_page` in `container`,
 * styled by the shared theme CSS. Idempotent — clears prior footers first.
 */
export function injectPagedFooters(container: HTMLElement, opts: PagedFooterOptions): void {
  const pages = Array.from(container.querySelectorAll<HTMLElement>(".pagedjs_page"));
  const labels = computePageLabels(
    pages.map((p) => flagsFromHtml(p.innerHTML)),
    { showPageNumbers: opts.showPageNumbers, start: opts.start },
  );

  pages.forEach((page, i) => {
    page.querySelector(".sc-footer")?.remove();
    const label = labels[i];
    if (label === null) return; // covers, skips, numbers-off → no footer

    const box = page.querySelector<HTMLElement>(".pagedjs_pagebox") ?? page;
    const footer = document.createElement("div");
    // Recto (even index = right page) → number on the right; verso → left.
    footer.className = `sc-footer ${i % 2 === 0 ? "sc-footer--recto" : "sc-footer--verso"}`;

    const numLeft = document.createElement("span");
    numLeft.className = "sc-footer-num sc-footer-num--left";
    numLeft.textContent = label;

    const text = document.createElement("span");
    text.className = "sc-footer-text";
    text.textContent = opts.footerText;

    const numRight = document.createElement("span");
    numRight.className = "sc-footer-num sc-footer-num--right";
    numRight.textContent = label;

    footer.append(numLeft, text, numRight);
    box.appendChild(footer);
  });
}
