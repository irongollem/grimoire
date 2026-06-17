/*
 * Table-of-contents population for the Paged.js book (Phase B, #330).
 *
 * The legacy preview numbered TOC entries by `<hr>`-split array index. With
 * Paged.js, the page a heading lands on is decided by layout, so the TOC is
 * filled AFTER render: walk the rendered pages, map each heading to its
 * physical page's footer label (shared numbering — matches the footers), and
 * replace the `<nav data-type="toc">` placeholder with a rendered TOC.
 *
 * Single-pass: page numbers are read from the layout where the TOC is still an
 * (empty) placeholder. This is exact as long as the filled TOC fits on the
 * same page(s) the placeholder occupied — true for typical front-matter TOCs.
 * A heading-dense doc whose TOC overflows to extra pages would shift later
 * numbers; the exact fix is a second re-layout pass (tracked on #330).
 */

import { flagsFromHtml, computePageLabels } from "./pageNumbering";

export interface PagedTocOptions {
  showPageNumbers: boolean;
  start: number;
}

interface TocItem {
  level: number;
  text: string;
  page: string | null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderTocHtml(items: TocItem[]): string {
  const usable = items.filter((i) => i.text);
  if (usable.length === 0) {
    return `<nav class="sc-toc" aria-label="Table of Contents"><p class="sc-toc-empty">No headings yet.</p></nav>`;
  }
  const lis = usable
    .map((i) => {
      const indent = i.level === 1 ? "" : i.level === 2 ? "sc-toc-h2" : "sc-toc-h3";
      const pageCell =
        i.page !== null
          ? `<span class="sc-toc-leader" aria-hidden="true"></span><span class="sc-toc-page">${i.page}</span>`
          : "";
      return `<li class="sc-toc-item ${indent}"><span class="sc-toc-link"><span class="sc-toc-text">${escapeHtml(i.text)}</span>${pageCell}</span></li>`;
    })
    .join("");
  return `<nav class="sc-toc" aria-label="Table of Contents"><h2 class="sc-toc-heading">Contents</h2><ol class="sc-toc-list">${lis}</ol></nav>`;
}

/**
 * Replace the TOC placeholder in `container` with a rendered TOC built from the
 * headings across the rendered pages. No-op if there's no placeholder.
 */
export function injectPagedToc(container: HTMLElement, opts: PagedTocOptions): void {
  const placeholder = container.querySelector('nav[data-type="toc"]');
  if (!placeholder) return;

  const pages = Array.from(container.querySelectorAll<HTMLElement>(".pagedjs_page"));
  const labels = computePageLabels(
    pages.map((p) => flagsFromHtml(p.innerHTML)),
    { showPageNumbers: opts.showPageNumbers, start: opts.start },
  );

  const items: TocItem[] = [];
  pages.forEach((page, i) => {
    page.querySelectorAll<HTMLElement>("h1, h2, h3").forEach((h) => {
      // Skip headings inside the TOC itself.
      if (h.closest('nav[data-type="toc"]') || h.closest(".sc-toc")) return;
      const text = h.textContent?.trim() ?? "";
      if (!text) return;
      items.push({ level: Number(h.tagName[1]), text, page: labels[i] });
    });
  });

  placeholder.outerHTML = renderTocHtml(items);
}
