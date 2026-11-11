/*
 * Reading what each laid-out page says, from the DOM it was laid out in
 * (#1176). The browser half of printCheck.ts, kept apart so the comparison
 * stays free of DOM types.
 */
import type { ExpectedPage } from "@/scriptorium/lib/printCheck";

/** The footer, the page numbers, furniture and margin boxes: printed, and known. */
const IGNORABLE_SELECTOR = ".sc-footer span, .sc-furniture, .pagedjs_margin-content";

/** Pixels a line may sit outside the content box and still count as on the page (sub-pixel rounding). */
const EDGE_TOLERANCE_PX = 2;

function insideBox(rect: DOMRect, box: DOMRect): boolean {
  return (
    rect.left >= box.left - EDGE_TOLERANCE_PX &&
    rect.right <= box.right + EDGE_TOLERANCE_PX &&
    rect.top >= box.top - EDGE_TOLERANCE_PX &&
    rect.bottom <= box.bottom + EDGE_TOLERANCE_PX
  );
}

function textBoxes(node: Text): DOMRect[] {
  const range = document.createRange();
  range.selectNodeContents(node);
  return Array.from(range.getClientRects());
}

/** The words of a text node that straddles the edge of the page box, each judged on its own. */
function visibleWords(node: Text, box: DOMRect): string {
  const text = node.data;
  const kept: string[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    const range = document.createRange();
    range.setStart(node, match.index);
    range.setEnd(node, match.index + match[0].length);
    const rects = Array.from(range.getClientRects());
    if (rects.length > 0 && rects.every((r) => insideBox(r, box))) kept.push(match[0]);
  }
  return kept.join(" ");
}

/**
 * The text the laid-out page SHOWS. Paged.js can leave lines in the DOM that
 * sit past the page (a column too many): the editor does not show them and
 * neither does the printer, so they are not what the PDF is held to. Without
 * a layout (a test DOM) every text counts.
 */
function visibleText(content: HTMLElement): string {
  const box = content.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return content.textContent ?? "";
  const parts: string[] = [];
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const rects = textBoxes(text);
    if (rects.length === 0) continue; // not drawn at all (display: none)
    parts.push(rects.every((r) => insideBox(r, box)) ? text.data : visibleWords(text, box));
  }
  return parts.join(" ");
}

/**
 * Reads what each laid-out `.pagedjs_page` says. `labels` are the printed
 * numbers the layout worked out, one per page (null where a page has none).
 * The pages must be in the document, laid out, when this runs.
 */
export function expectedPagesFromDom(pages: HTMLElement[], labels: (string | null)[]): ExpectedPage[] {
  return pages.map((page, index) => {
    const content = page.querySelector<HTMLElement>(".pagedjs_page_content");
    return {
      index,
      label: labels[index] ?? null,
      text: content ? visibleText(content) : "",
      ignorable: Array.from(page.querySelectorAll(IGNORABLE_SELECTOR))
        .map((el) => el.textContent ?? "")
        .filter((t) => t.trim().length > 0),
    };
  });
}
