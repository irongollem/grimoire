/*
 * What the printed book tells the editor (#1176, frames 06 and 09).
 *
 * Two things only the layout knows are drawn on the editor's page as they print:
 * the contents page (headings from every chapter, page numbers from where they
 * landed) and how each linked monster entry was fitted to its page. The book
 * editor provides this; the preview writes it after each layout; the contents
 * block and the linked entries read it. Nothing here is a second layout: it is
 * what the one layout wrote.
 */
import { ref, shallowRef, type InjectionKey, type Ref, type ShallowRef } from "vue";
import { readPrintedEntryFits, type EntryFit } from "@/scriptorium/lib/entryFit";

export interface PrintedBook {
  /** The contents page's markup as printed, or null before the first layout or with no contents page. */
  contents: Ref<string | null>;
  /** How the printer fitted each linked entry, by block id. */
  entryFits: ShallowRef<ReadonlyMap<string, EntryFit>>;
}

export const PRINTED_BOOK_KEY: InjectionKey<PrintedBook> = Symbol("scriptorium-printed-book");

export function createPrintedBook(): PrintedBook {
  return { contents: ref<string | null>(null), entryFits: shallowRef(new Map()) };
}

/** Writes what a finished layout in `container` says into `book`. */
export function recordPrintedBook(book: PrintedBook, container: ParentNode): void {
  book.contents.value = printedContentsHtml(container);
  book.entryFits.value = readPrintedEntryFits(container);
}

/**
 * The contents of the laid-out book as markup for the page: its heading and its
 * whole list, or null when the book has no contents page. A long list runs over
 * several pages and the layout splits it into one fragment per page, so the
 * entries are gathered from all of them into one list under the first
 * fragment's heading and column count.
 */
export function printedContentsHtml(container: ParentNode): string | null {
  const navs = Array.from(container.querySelectorAll<HTMLElement>("nav.sc-toc"));
  const first = navs[0];
  if (!first) return null;
  const items = navs.flatMap((nav) => Array.from(nav.querySelectorAll<HTMLElement>("li.sc-toc-item")));
  if (items.length === 0) return first.innerHTML;
  const heading = first.querySelector<HTMLElement>(".sc-toc-heading")?.outerHTML ?? "";
  const listClass = first.querySelector<HTMLElement>("ol.sc-toc-list")?.className ?? "sc-toc-list";
  return `${heading}<ol class="${listClass}">${items.map((li) => li.outerHTML).join("")}</ol>`;
}
