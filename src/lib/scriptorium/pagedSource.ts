/*
 * The parsed source of a Paged.js render, for the layout handlers that change
 * an element on a page (pagedEntryFit.ts, pagedTableFit.ts). Paged.js builds
 * every page from clones of the parsed book, and a piece of an element that
 * continues on the next page is cloned from the source again, so a change made
 * only on the page would be lost from that continuation.
 */

/** The node Paged.js clones an element on a page from, or null. */
export type SourceOf = (el: Element) => Element | null;

/** Finds an element's source by the data-ref Paged.js gives every parsed
 *  element and its clones keep. */
export function sourceIn(parsed: ParentNode | null): SourceOf {
  return (el) => {
    const ref = el.getAttribute("data-ref");
    return ref && parsed ? parsed.querySelector(`[data-ref="${CSS.escape(ref)}"]`) : null;
  };
}
