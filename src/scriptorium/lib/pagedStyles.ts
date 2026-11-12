import type { Previewer } from "pagedjs";

/**
 * The <style> elements one Previewer added to document.head, in document
 * order (the order the cascade reads them in).
 *
 * The live preview and the PDF export both lay pages out with Paged.js in the
 * same document, and the export spans a render-pdf round trip of up to a
 * minute. Diffing the head before and after a render therefore catches the
 * other one's styles too: the export used to capture the preview's rules into
 * the PDF and then delete them from under the live preview. Asking the
 * Previewer which elements are its own cannot cross that line.
 */
export function pagedStyleElements(previewer: Previewer): HTMLStyleElement[] {
  const own = new Set<HTMLStyleElement>(previewer.polisher.inserted);
  if (previewer.polisher.styleEl) own.add(previewer.polisher.styleEl);
  return Array.from(document.head.querySelectorAll("style")).filter((s) => own.has(s));
}

/** Takes one Previewer's styles back out of the head, and nobody else's. */
export function removePagedStyles(previewer: Previewer): void {
  previewer.polisher.styleEl?.remove();
  for (const s of previewer.polisher.inserted) s.remove();
}
