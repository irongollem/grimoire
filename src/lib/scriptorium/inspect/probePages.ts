import { CHAPTER_ID_ATTR } from "../furniture/renderFurniture";
import { BLANK_PAGE_ATTR } from "../pageNumbering";
import type { PageProbe } from "./notePlacement";

const BLOCK = "[data-block-id]";

export interface ProbedPage {
  el: HTMLElement;
  probe: PageProbe;
}

/** The outermost `data-block-id` element at or above `target`: a note pins to a top-level block, not to a cell inside one. */
export function topBlockOf(target: Element): Element | null {
  let block = target.closest(BLOCK);
  while (block) {
    const outer = block.parentElement?.closest(BLOCK) ?? null;
    if (!outer) break;
    block = outer;
  }
  return block;
}

/** Measures every page of the host. `top` is in the page's own pixels, so a zoomed page measures the same as a full-size one. */
export function probePages(host: HTMLElement): ProbedPage[] {
  return Array.from(host.querySelectorAll<HTMLElement>(".pagedjs_page")).map((el, index) => {
    const rect = el.getBoundingClientRect();
    const scale = el.offsetWidth > 0 && rect.width > 0 ? rect.width / el.offsetWidth : 1;
    const blocks = Array.from(el.querySelectorAll(BLOCK))
      .filter((block) => topBlockOf(block) === block)
      .flatMap((block) => {
        const id = block.getAttribute("data-block-id");
        return id ? [{ id, top: (block.getBoundingClientRect().top - rect.top) / scale }] : [];
      });
    return {
      el,
      probe: { index, chapterId: el.getAttribute(CHAPTER_ID_ATTR), blank: el.hasAttribute(BLANK_PAGE_ATTR), blocks },
    };
  });
}
