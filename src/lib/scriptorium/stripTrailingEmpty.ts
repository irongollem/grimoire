/*
 * Strip trailing empty paragraphs from document HTML before pagination.
 *
 * Tiptap/ProseMirror keeps a trailing empty paragraph at the end of a document
 * (an editing affordance, and required after a trailing atom like a cover page).
 * In the paged book that empty paragraph lands on its own page after a
 * full-height element — a stray blank final page. It carries no content, so we
 * drop trailing empties from the render input (the editor/saved doc keep it).
 */

/** Matches one trailing paragraph that holds nothing but whitespace / <br>. */
const TRAILING_EMPTY_PARAGRAPH = /<p\b[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*$/i;

export function stripTrailingEmptyParagraphs(html: string): string {
  let out = html.trimEnd();
  while (TRAILING_EMPTY_PARAGRAPH.test(out)) {
    out = out.replace(TRAILING_EMPTY_PARAGRAPH, "").trimEnd();
  }
  return out;
}
