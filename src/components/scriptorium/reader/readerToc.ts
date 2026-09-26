/*
 * Reader-only table of contents (#915 story 7).
 *
 * The `tocBlock` node (src/lib/tiptap/tocBlock.ts) renders as an empty
 * `<nav>` placeholder everywhere except the paginated book: only
 * `injectPagedToc` (src/lib/scriptorium/pagedToc.ts), run against the
 * Paged.js-laid-out physical pages, knows what page each heading landed on
 * and fills it in. The phone reader has no pages to lay out, so rather than
 * reproducing that pipeline for a screen it doesn't apply to, it lists the
 * document's real headings itself and scrolls straight to one by its
 * `blockId`.
 *
 * This walks the LIVE RENDERED DOM (mirroring `pagedToc.ts`'s own
 * `collectHeadings`), not the stored JSON, and that is a deliberate choice,
 * not a style preference: `BlockId` (src/lib/tiptap/blockId.ts) assigns a
 * missing id to every heading the moment ANY editor — including the
 * read-only one `ScriptoriumDocumentView` mounts — creates, via a
 * transaction dispatched in its `onCreate`. A document saved through the
 * app's own editor already has ids in storage, but one seeded directly
 * (a fixture, an old pre-BlockId row) does not — and reading the DOM after
 * the editor has initialized sees the assigned ids either way, while reading
 * the stored JSON straight would silently show no Contents list for exactly
 * the documents that need one least reliably. See ScriptoriumReader.vue for
 * how it decides *when* the DOM is ready to read (there is no event to await
 * for this from outside; it watches for the mutation instead).
 */

export interface ReaderTocEntry {
  blockId: string;
  level: number;
  text: string;
}

/** Only h1–h3 count as navigable sections — mirrors pagedToc.ts's own
 *  HEADING_SEL, which the printed book's TOC already limits to. A cover's
 *  own title/subtitle can never match: they're hand-built `<h1>` markup
 *  (coverPage.ts) with no `data-block-id`, the attribute BlockId gives only
 *  to real content nodes. */
const HEADING_SELECTOR = "h1[data-block-id], h2[data-block-id], h3[data-block-id]";

/** Every heading under `root` with a `blockId`, in document order. A heading
 *  with no text (blank) is skipped rather than listed as a dead entry. */
export function collectReaderToc(root: ParentNode): ReaderTocEntry[] {
  const entries: ReaderTocEntry[] = [];
  root.querySelectorAll<HTMLElement>(HEADING_SELECTOR).forEach((heading) => {
    const blockId = heading.getAttribute("data-block-id");
    const text = heading.textContent?.trim() ?? "";
    if (!blockId || !text) return;
    entries.push({ blockId, level: Number(heading.tagName[1]), text });
  });
  return entries;
}
