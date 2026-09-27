/*
 * Table-of-contents population for the Paged.js book (Phase B, #330; two-pass
 * accuracy + PDF parity, #465).
 *
 * The page a heading lands on is decided by layout, so the TOC can only be
 * numbered after rendering. The catch: if the TOC is filled AFTER layout while
 * it was laid out as a tiny placeholder, a long (overflowing) TOC pushes the
 * body down and the page numbers it just read are wrong.
 *
 * Fix — expand, then fill:
 *   1. `expandTocPlaceholder` replaces the empty `<nav data-type="toc">` with a
 *      full TOC (every heading, page numbers blank) BEFORE Paged.js runs, so the
 *      TOC occupies its true height and headings land on their final pages even
 *      when the TOC spills onto extra pages.
 *   2. `fillPagedTocPages` writes the real page numbers into that rendered TOC
 *      afterwards — a text-only change that doesn't reflow.
 *
 * Both the live preview and the print/PDF path run the same two steps, so the
 * exported PDF gets a fully numbered TOC too.
 */

import type { ScriptoriumPageSize } from "@/types/scriptorium.types";
import { flagsFromHtml, computePageLabels } from "./pageNumbering";
import { escapeHtml } from "@/lib/escapeHtml";

export interface PagedTocOptions {
  showPageNumbers: boolean;
  start: number;
}

interface TocItem {
  level: number;
  text: string;
  page: string | null;
}

// Chapter titles and section headings only — a document heading below h2
// (an h3, or a stat block's own section labels, which deliberately aren't
// document headings at all — see scriptoriumImport.ts) is too fine-grained
// for a table of contents and was how a single linked monster stat block
// added six "Special Abilities"/"Actions"/"Reactions" entries to the TOC of
// a 29-page book (#915 story 6).
const HEADING_SEL = "h1, h2";

/**
 * A heading counts for the TOC unless it's inside the TOC itself, a cover, a
 * read-aloud box, a sidebar note, or (with one exception) a linked entity
 * embed — a monster/NPC's own body headings aren't the document's structure.
 *
 * The exception: a monster entry's own name heading
 * (`.sc-statblock-entry-heading`, scriptoriumImport.ts) IS meant to be listed,
 * exactly like a Monster Manual's own per-creature entries — only the stat
 * block's internal section labels (Traits/Actions/…, deliberately h4 rather
 * than a heading level the TOC ever sees) and an NPC embed's own Identity/
 * Lore sub-headings stay excluded.
 */
function isContentHeading(h: HTMLElement): boolean {
  if (h.classList.contains("sc-statblock-entry-heading")) {
    return !h.closest('nav[data-type="toc"]') && !h.closest(".sc-toc");
  }
  return (
    !h.closest('nav[data-type="toc"]') &&
    !h.closest(".sc-toc") &&
    !h.closest(".sc-cover") &&
    !h.closest('[data-type="entity-embed"]') &&
    !h.closest(".sc-note") &&
    !h.closest(".sc-descriptive")
  );
}

/**
 * How many columns the printed TOC list uses. A5's narrow measure can't hold
 * more than one clean column without truncation creeping back in (the same
 * failure this story fixed). A4/Letter comfortably read two; past 20 entries
 * — a long multi-chapter book — two columns run the list down several extra
 * pages, so three narrower columns fit more without truncating or shrinking
 * the type.
 */
export function tocColumnCount(pageSize: ScriptoriumPageSize, entryCount: number): 1 | 2 | 3 {
  if (pageSize === "A5") return 1;
  return entryCount > 20 ? 3 : 2;
}

/** Content headings (level + text) under `root`, in document order. */
function collectHeadings(root: ParentNode): { level: number; text: string }[] {
  const out: { level: number; text: string }[] = [];
  root.querySelectorAll<HTMLElement>(HEADING_SEL).forEach((h) => {
    if (!isContentHeading(h)) return;
    const text = h.textContent?.trim() ?? "";
    if (!text) return;
    out.push({ level: Number(h.tagName[1]), text });
  });
  return out;
}

export function renderTocHtml(items: TocItem[], pageSize: ScriptoriumPageSize = "A4"): string {
  const usable = items.filter((i) => i.text);
  if (usable.length === 0) {
    return `<nav class="sc-toc" aria-label="Table of Contents"><p class="sc-toc-empty">No headings yet.</p></nav>`;
  }
  const lis = usable
    .map((i) => {
      const level = i.level === 1 ? "sc-toc-h1" : i.level === 2 ? "sc-toc-h2" : "sc-toc-h3";
      const pageCell =
        i.page !== null
          ? `<span class="sc-toc-leader" aria-hidden="true"></span><span class="sc-toc-page">${i.page}</span>`
          : "";
      return `<li class="sc-toc-item ${level}"><span class="sc-toc-link"><span class="sc-toc-text">${escapeHtml(i.text)}</span>${pageCell}</span></li>`;
    })
    .join("");
  const cols = tocColumnCount(pageSize, usable.length);
  return `<nav class="sc-toc" aria-label="Table of Contents"><h2 class="sc-toc-heading">Contents</h2><ol class="sc-toc-list sc-toc-cols-${cols}">${lis}</ol></nav>`;
}

/**
 * Expand the `<nav data-type="toc">` placeholder into a full-height TOC (entries
 * from the document headings, page numbers reserved-but-blank) BEFORE layout.
 * Returns the html unchanged if there's no placeholder. When page numbering is
 * off, entries carry no page cell. Page numbers are written later by
 * fillPagedTocPages.
 */
export function expandTocPlaceholder(
  html: string,
  opts: { showPageNumbers: boolean; pageSize?: ScriptoriumPageSize },
): string {
  if (!html.includes('data-type="toc"')) return html;
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const placeholder = tmp.querySelector('nav[data-type="toc"]');
  if (!placeholder) return html;
  const items: TocItem[] = collectHeadings(tmp).map((h) => ({
    level: h.level,
    text: h.text,
    page: opts.showPageNumbers ? "" : null,
  }));
  placeholder.outerHTML = renderTocHtml(items, opts.pageSize ?? "A4");
  return tmp.innerHTML;
}

/**
 * Fill the (already-expanded) TOC's page-number cells from the laid-out pages,
 * matching each content heading to its physical-page footer label in document
 * order. No-op when page numbers are off or there's no rendered TOC.
 */
export function fillPagedTocPages(container: HTMLElement, opts: PagedTocOptions): void {
  if (!opts.showPageNumbers) return;
  const toc = container.querySelector(".sc-toc");
  if (!toc) return;

  const pages = Array.from(container.querySelectorAll<HTMLElement>(".pagedjs_page"));
  const labels = computePageLabels(
    pages.map((p) => flagsFromHtml(p.innerHTML)),
    { showPageNumbers: true, start: opts.start },
  );

  const headingLabels: string[] = [];
  pages.forEach((page, i) => {
    page.querySelectorAll<HTMLElement>(HEADING_SEL).forEach((h) => {
      if (!isContentHeading(h)) return;
      if (!h.textContent?.trim()) return;
      headingLabels.push(labels[i] ?? "");
    });
  });

  toc.querySelectorAll<HTMLElement>(".sc-toc-page").forEach((cell, idx) => {
    cell.textContent = headingLabels[idx] ?? "";
  });
}
