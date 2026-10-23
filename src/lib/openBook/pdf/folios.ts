/**
 * Page numbers of the printed book (#1085), worked out after the pages are cut.
 *
 * Paged.js numbers pages with CSS counters and fills a contents list with `target-counter`. Both take the number of
 * the sheet, which counts the title page and contents ahead of chapter I; a book wants its front matter in roman
 * numerals and chapter I's opening page as page 1. So the numbers are decided here, once the pages exist, and
 * written onto them as plain values the stylesheet only prints.
 */

import { toRoman } from "@/lib/openBook/pagination";

/** The folio of each laid-out page: roman up to chapter I's title page, arabic from it, `null` where none is shown. */
export function folioLabels(pages: readonly { firstChapter: boolean; plain: boolean }[]): (string | null)[] {
  const start = pages.findIndex((p) => p.firstChapter);
  return pages.map((page, i) => {
    if (page.plain) return null;
    if (start < 0 || i < start) return toRoman(i + 1);
    return String(i - start + 1);
  });
}

/** `"4"` as a CSS string, for a custom property the margin box prints. */
export function cssString(text: string): string {
  return `"${text.replace(/["\\]/g, "\\$&")}"`;
}

/** The index of the laid-out page on which the element with this id begins, or -1. */
export function pageOfAnchor(pages: readonly ParentNode[], id: string): number {
  const selector = `[id="${id.replace(/["\\]/g, "\\$&")}"]`;
  return pages.findIndex((page) => page.querySelector(selector) !== null);
}

/**
 * Writes the folios onto the pages and the page numbers into every link that asks for one (`.pb-toc a` and the
 * index's `.pb-pg`, which carry `href="#id"`). A link whose target is not on a numbered page gets no number.
 */
export function applyFolios(host: ParentNode): void {
  const pages = Array.from(host.querySelectorAll<HTMLElement>(".pagedjs_page"));
  const labels = folioLabels(
    pages.map((p) => ({
      firstChapter: p.querySelector(".pb-first") !== null,
      plain: p.classList.contains("pagedjs_plain_page"),
    })),
  );
  // The chapter opener has no folio of its own to show, but a contents line pointing at it needs its number.
  const start = pages.findIndex((p) => p.querySelector(".pb-first") !== null);
  const numbered = labels.map((label, i) => label ?? (start >= 0 && i >= start ? String(i - start + 1) : null));

  pages.forEach((page, i) => {
    page.style.setProperty("--ob-folio", cssString(labels[i] ?? ""));
  });
  host.querySelectorAll<HTMLAnchorElement>(".pb-toc a, .pb-pg").forEach((link) => {
    const id = link.getAttribute("href")?.replace(/^#/, "");
    if (!id) return;
    const at = pageOfAnchor(pages, id);
    const label = at >= 0 ? numbered[at] : null;
    if (label) link.dataset.pg = label;
  });
}
