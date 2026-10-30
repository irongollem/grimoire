/*
 * Blank pages for the book layout. Every chapter opens on a right-hand page, so
 * a chapter that ends on a right-hand page (an odd number of pages, page 1
 * being a recto) is followed by a blank left-hand page. The last chapter needs
 * none: nothing opens after it.
 *
 * A blank page is a real page of the book, counted in the numbering, with no
 * footer and no number printed. It carries `data-blank-page` so the Inspect
 * view can say why it is empty; that sentence is drawn by the interface and
 * never reaches print.
 */
import { BLANK_PAGE_ATTR } from "../pageNumbering";

/** True when a chapter of `pageCount` pages needs a blank page after it. */
export function needsBlankPageAfter(pageCount: number, isLastChapter: boolean): boolean {
  return !isLastChapter && pageCount > 0 && pageCount % 2 === 1;
}

/**
 * An empty page with the same box as `model` (one of the chapter's own pages):
 * its geometry, margins and chrome, none of its content, footer, furniture or
 * named-page variant (a cover's zero margins are not the blank's).
 */
export function createBlankPage(model: HTMLElement, chapterId: string, globalIndex: number): HTMLElement {
  const page = model.cloneNode(true) as HTMLElement;
  page.querySelectorAll(".pagedjs_page_content").forEach((c) => c.replaceChildren());
  page.querySelectorAll(".sc-footer, .sc-furniture").forEach((e) => e.remove());
  for (const cls of Array.from(page.classList)) {
    const isNamedVariant = /^pagedjs_.+_page$/.test(cls) && !PLAIN_PAGE_CLASSES.has(cls);
    if (isNamedVariant) page.classList.remove(cls);
  }
  page.classList.remove("pagedjs_first_page", "pagedjs_left_page", "pagedjs_right_page");
  page.classList.add("pagedjs_blank_page", globalIndex % 2 === 0 ? "pagedjs_right_page" : "pagedjs_left_page");
  page.removeAttribute("data-chapter-page");
  page.removeAttribute("id");
  page.setAttribute("data-chapter-id", chapterId);
  page.setAttribute(BLANK_PAGE_ATTR, "");
  return page;
}

const PLAIN_PAGE_CLASSES = new Set(["pagedjs_page", "pagedjs_blank_page"]);
