/**
 * The printed book's stylesheet (#1085): A5 pages in the reader's paper and type, a leather cover, and the running
 * heads and folios as Paged.js margin boxes. The article layouts (`bookArticles.css`) are the reader's own and ride
 * along unchanged; the rules after them only adapt what the web flow decided by columns (a picture that opens an
 * entry taking a whole page) to a page that is cut by Paged.js.
 */

import { artUrl } from "@/lib/assets/artUrl";
import { LEATHERS } from "@/lib/openBook/leather";
import type { OpenBookLeather } from "@/types/openBook.types";
import articlesCss from "@/components/openBook/reader/articles/bookArticles.css?inline";

/** A5, the size the book prints at. */
export const PAGE_WIDTH_MM = 148;
export const PAGE_HEIGHT_MM = 210;

const PAPER = "#f2ece0";

/** The printed page box: what is left of the sheet inside the margins. Sizes the pictures. */
const MARGIN_TOP_MM = 20;
const MARGIN_BOTTOM_MM = 24;
const MARGIN_INNER_MM = 18;
const MARGIN_OUTER_MM = 14;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_INNER_MM - MARGIN_OUTER_MM;
const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - MARGIN_TOP_MM - MARGIN_BOTTOM_MM;

const SANS = `Alegreya, Georgia, serif`;

/** Running heads and folios. Chapter on the left-hand page, the entry's title on the right-hand one. */
const MARGIN_BOXES = `
@page body:left {
  margin: ${MARGIN_TOP_MM}mm ${MARGIN_INNER_MM}mm ${MARGIN_BOTTOM_MM}mm ${MARGIN_OUTER_MM}mm;
  @top-left { content: string(chapter); }
  @bottom-left { content: var(--ob-folio); }
}
@page body:right {
  margin: ${MARGIN_TOP_MM}mm ${MARGIN_OUTER_MM}mm ${MARGIN_BOTTOM_MM}mm ${MARGIN_INNER_MM}mm;
  @top-right { content: string(entry); }
  @bottom-right { content: var(--ob-folio); }
}
@page front:left {
  margin: ${MARGIN_TOP_MM}mm ${MARGIN_INNER_MM}mm ${MARGIN_BOTTOM_MM}mm ${MARGIN_OUTER_MM}mm;
  @bottom-left { content: var(--ob-folio); }
}
@page front:right {
  margin: ${MARGIN_TOP_MM}mm ${MARGIN_OUTER_MM}mm ${MARGIN_BOTTOM_MM}mm ${MARGIN_INNER_MM}mm;
  @bottom-right { content: var(--ob-folio); }
}
`;

const PAGE_RULES = `
@page {
  size: ${PAGE_WIDTH_MM}mm ${PAGE_HEIGHT_MM}mm;
  margin: ${MARGIN_TOP_MM}mm ${MARGIN_OUTER_MM}mm ${MARGIN_BOTTOM_MM}mm ${MARGIN_INNER_MM}mm;
}
@page plain { margin: ${MARGIN_TOP_MM}mm ${MARGIN_OUTER_MM}mm ${MARGIN_BOTTOM_MM}mm ${MARGIN_OUTER_MM}mm; }
${MARGIN_BOXES}
`;

/** Margin-box type, shared by heads and folios. */
const MARGIN_TYPE = `
.pagedjs_margin-content { font-family: Cinzel, Georgia, serif; font-size: 0.6875rem; letter-spacing: 0.1em; text-transform: uppercase; color: #5f5347; }
.pagedjs_margin-bottom-left .pagedjs_margin-content,
.pagedjs_margin-bottom-right .pagedjs_margin-content { font-size: 0.875rem; font-weight: 600; letter-spacing: 0.08em; }
.pagedjs_margin-top-left .pagedjs_margin-content,
.pagedjs_margin-top-right .pagedjs_margin-content { font-family: ${SANS}; font-weight: 700; padding-bottom: 0.25rem; }
`;

const BOOK_CSS = `
.pb {
  --ob-page-w: ${CONTENT_WIDTH_MM}mm;
  --ob-page-h: ${CONTENT_HEIGHT_MM}mm;
  --ob-live: #6e1f1a;
  --ob-gilt: #c9962e;
  --ob-fg: #2b2019;
  --ob-muted: #5f5347;
  --ob-border: #cfc3ad;
  --ob-input: #8a7d6c;
  --ob-display: Cinzel, Georgia, serif;
  --ob-serif: Alegreya, Georgia, serif;
  --bk-sans: ${SANS};
  color: #2b2019;
  font-family: Alegreya, Georgia, serif;
  font-size: 1rem;
}
.pb * { box-sizing: border-box; }
/* The articles name Source Sans 3, which the printed file does not carry; Alegreya does the small caps. */
.pb .book-article, .pb .book-almanac, .pb .book-index { --bk-sans: ${SANS}; }
.pb h1, .pb h2, .pb h3 { orphans: 2; widows: 2; }
.pb p { orphans: 2; widows: 2; }
.pb img { max-width: 100%; }

/* The sheet: the reader's paper. */
.pagedjs_page { background-color: ${PAPER}; background-image: url('${artUrl("/assets/vellum/paper.webp")}'); background-size: 39rem 39rem; }

/* Cover */
.pb-cover { position: relative; width: ${PAGE_WIDTH_MM}mm; height: 100%; margin: 0; overflow: hidden;
  background-color: var(--pb-hide); background-image: var(--pb-leather); background-size: 26rem 26rem; background-blend-mode: luminosity; }
.pb-cover[data-grain="natural"] { background-blend-mode: normal; }
.pb-spine { position: absolute; inset: 0 auto 0 0; width: 7%; background: rgb(0 0 0 / 0.32); box-shadow: inset -2px 0 3px rgb(0 0 0 / 0.45); }
.pb-spine span { position: absolute; left: 0; width: 100%; height: 0.4375rem; background: rgb(0 0 0 / 0.35); box-shadow: 0 1px 0 rgb(255 255 255 / 0.08); }
.pb-tool { position: absolute; inset: 4.75% 5.4% 4.75% 11.8%; border: 1px solid #b8862a; box-shadow: inset 0 0 0 7px transparent, inset 0 0 0 8px #b8862a; }
.pb-tool i { position: absolute; width: 0.5625rem; height: 0.5625rem; background: #c9962e; transform: rotate(45deg); }
.pb-tool i:nth-child(1) { left: -5px; top: -5px; }
.pb-tool i:nth-child(2) { right: -5px; top: -5px; }
.pb-tool i:nth-child(3) { left: -5px; bottom: -5px; }
.pb-tool i:nth-child(4) { right: -5px; bottom: -5px; }
.pb-cover-text { position: absolute; inset: 4.75% 5.4% 4.75% 11.8%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2rem; text-align: center; padding: 2.5rem 1.75rem; }
.pb-vol, .pb-cover-title, .pb-cover-sub { color: #d9ad52; text-shadow: 0 1px 0 rgb(0 0 0 / 0.55); }
.pb-vol { font-family: ${SANS}; font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.3em; }
.pb-cover-title { margin: 0; font-family: Cinzel, Georgia, serif; font-weight: 700; letter-spacing: 0.08em; line-height: 1.1; text-transform: uppercase; font-size: 2.1rem; overflow-wrap: anywhere; }
.pb-cover-sub { margin: 0; font-style: italic; font-size: 1.0625rem; line-height: 1.45; max-width: 15rem; }
.pb-compass { width: 7rem; height: 7rem; color: #c9962e; filter: drop-shadow(0 1px 0 rgb(0 0 0 / 0.5)); }
.pb-compass svg { width: 100%; height: 100%; display: block; }
.pb-plate-frame { padding: 0.375rem; background: #b8862a; box-shadow: 0 3px 8px rgb(0 0 0 / 0.5), inset 0 0 0 1px #7a5a14; width: 80%; }
.pb-plate-frame > div { box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.4); overflow: hidden; height: 9rem; }
.pb-plate-frame img, .pb-cover-art img { width: 100%; height: 100%; object-fit: cover; display: block; max-width: none; }
.pb-cover-art { position: absolute; inset: 0 0 0 7%; overflow: hidden; }
.pb-cover-label { position: absolute; top: 9%; left: 16%; right: 9%; display: flex; justify-content: center; }
.pb-label { padding: 1.25rem 1.5rem 1.125rem; text-align: center; background-color: var(--pb-hide); background-image: var(--pb-leather); background-size: 26rem 26rem; background-blend-mode: luminosity; box-shadow: 0 4px 10px rgb(0 0 0 / 0.55), inset 0 0 0 1px #b8862a, inset 0 0 0 6px transparent, inset 0 0 0 7px #b8862a, inset 0 0 30px rgb(0 0 0 / 0.45); }
.pb-cover[data-grain="natural"] .pb-label { background-blend-mode: normal; }
.pb-label .pb-cover-title { margin-top: 0.375rem; font-size: 1.5rem; }
.pb-cover-foot { position: absolute; left: 16%; right: 9%; bottom: 9%; margin: 0; text-align: center; font-style: italic; font-size: 1.0625rem; line-height: 1.45; color: #e6d6b0; text-shadow: 0 1px 3px rgb(0 0 0 / 0.8); }

/* Title page and chapter title pages */
.pb-title, .pb-chapter { page: plain; break-before: page; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 1rem; height: var(--ob-page-h); break-inside: avoid; }
.pb-title { gap: 1.25rem; }
.pb-title .pb-compass { width: 4.5rem; height: 4.5rem; color: var(--ob-live); filter: none; }
.pb-title h1 { margin: 0; font-family: Cinzel, Georgia, serif; font-weight: 700; font-size: 2.25rem; letter-spacing: 0.05em; line-height: 1.12; }
.pb-title-sub { margin: 0; font-style: italic; font-size: 1.25rem; color: #5f5347; max-width: 20rem; line-height: 1.4; }
.pb-title-release { margin: 0; font-family: Cinzel, Georgia, serif; font-size: 0.8125rem; letter-spacing: 0.14em; text-transform: uppercase; color: #5f5347; }
.pb-title-note { margin: 0; font-style: italic; color: #5f5347; max-width: 20rem; }
.pb-colophon { position: absolute; bottom: 0; margin: 0; font-style: italic; font-size: 0.875rem; color: #5f5347; }
.pb-title { position: relative; }
.pb-rule { width: 6rem; height: 1px; background: var(--ob-live); opacity: 0.6; position: relative; display: block; }
.pb-rule::after { content: ""; position: absolute; left: 50%; top: 50%; width: 0.5rem; height: 0.5rem; background: var(--ob-gilt); transform: translate(-50%, -50%) rotate(45deg); }
.pb-chapter { string-set: chapter attr(data-chapter), entry attr(data-title); }
.pb-chapter-num { font-family: Cinzel, Georgia, serif; font-weight: 700; font-size: 3.5rem; letter-spacing: 0.06em; color: var(--ob-live); line-height: 1; }
.pb-chapter h1 { margin: 0; font-family: Cinzel, Georgia, serif; font-weight: 700; font-size: 1.75rem; letter-spacing: 0.04em; }

/* Contents */
.pb-contents { page: front; break-before: page; string-set: chapter attr(data-chapter), entry attr(data-title); }
.pb-contents h1 { margin: 0 0 1rem; text-align: center; font-family: Cinzel, Georgia, serif; font-weight: 700; font-size: 1.75rem; }
.pb-toc, .pb-toc ol { list-style: none; margin: 0; padding: 0; }
.pb-toc a { display: flex; align-items: baseline; gap: 0.5rem; color: #2b2019; text-decoration: none; }
.pb-toc a::after { content: attr(data-pg); font-family: Cinzel, Georgia, serif; font-size: 0.875rem; color: #5f5347; min-width: 1.5rem; text-align: right; }
.pb-toc-chapter { margin-top: 0.75rem; break-after: avoid; }
.pb-toc-chapter a { padding: 0.25rem 0; }
.pb-toc-num { font-family: Cinzel, Georgia, serif; font-weight: 700; font-size: 0.9375rem; color: var(--ob-live); letter-spacing: 0.06em; min-width: 2rem; }
.pb-toc-chapter .pb-toc-name { font-size: 1.1875rem; font-weight: 700; }
.pb-toc-entry a { padding: 0.0625rem 0 0.0625rem 2.5rem; }
.pb-toc-entry .pb-toc-name { font-size: 0.9375rem; }
.pb-toc-back { margin-top: 0.75rem; }
.pb-toc-back .pb-toc-name { font-style: italic; font-size: 1.0625rem; }
.pb-toc-leader { flex: 1 1 auto; border-bottom: 1px dotted #8a7d6c; transform: translateY(-0.2rem); min-width: 1rem; }

/* Entries: each starts on its own page */
.pb-entry { page: body; break-before: page; string-set: chapter attr(data-chapter), entry attr(data-title); }
.pb-entry .book-article, .pb-entry .book-almanac, .pb-entry .book-index { width: 100%; }
.pb-entry a { text-decoration: none; }

/* The picture that opens an entry shares its page with the title instead of taking a page of its own. */
.pb .book-article > .book-plate:first-child { display: block; height: auto; margin: 0 0 0.75rem; text-align: center; break-after: auto; }
.pb .book-article > .book-plate:first-child .book-plate-frame { display: inline-block; max-width: 100%; }
.pb .book-article > .book-plate:first-child .book-plate-inner > img,
.pb .book-article > .book-plates-row:first-child .book-plate-inner > img { width: auto; height: auto; max-width: 100%; max-height: calc(var(--ob-page-h) * 0.4); object-fit: contain; }
.pb .book-article > .book-plates-row:first-child:has(.book-plate) { height: auto; break-after: auto; margin: 0 0 0.75rem; }
.pb .book-plate-lead .book-plate-inner > img { max-height: calc(var(--ob-page-h) * 0.4); }
.pb .book-prose img { max-height: calc(var(--ob-page-h) * 0.6); width: auto; object-fit: contain; }
.pb .book-plate-inner > img { max-height: calc(var(--ob-page-h) * 0.55); }
.pb .book-plate-square .book-plate-inner > img { max-height: none; }
.pb .book-refs-grid { grid-template-columns: 1fr; gap: 0; }
.pb .book-title { font-size: 1.875rem; }

/* A name in a reference row is as wide as its words, so the link's underline does not run the whole row. */
.pb .book-ref > .book-xref { justify-self: start; }

/* Index */
.pb-pg { color: #5f5347; font-family: Cinzel, Georgia, serif; font-size: 0.8125rem; }
.pb-pg::after { content: attr(data-pg); }
.pb .pb-index-section .book-ref { grid-template-columns: 1fr auto 2rem; align-items: baseline; }
.pb .pb-index-section .book-ref .pb-pg { text-align: right; }
.pb .pb-index-section .book-ref-note { font-family: ${SANS}; font-size: 0.75rem; }
.pb .pb-index-section h2 { font-size: 1.75rem; }

/* Colour and page art survive printing. */
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

/**
 * What Paged.js cannot be given. It reads `break-*` out of a stylesheet and strips it, so a break rule in the text
 * above does nothing to the browser's own layout, while the reader's articles (loaded into this document by the
 * components that import them) still carry `break-after: column` on the picture that opens an entry. This sheet is
 * therefore put in the document itself, for the length of the layout.
 */
export const DOCUMENT_CSS = `
.pb .book-article > .book-plate:first-child,
.pb .book-article > .book-plates-row:first-child:has(.book-plate) { break-after: auto; }
`;

/** Paged.js lays the book out against this; the final document carries it too. */
export function buildPagedCss(): string {
  return `${PAGE_RULES}${MARGIN_TYPE}${articlesCss}${BOOK_CSS}`;
}

/** The cover's own sheet: a hair shorter than the page, so Chrome never adds a blank one, over the hide's colour. */
export function coverSheetCss(leather: OpenBookLeather): string {
  return `.pb-cover-sheet { width: ${PAGE_WIDTH_MM}mm; height: calc(${PAGE_HEIGHT_MM}mm - 1px); overflow: hidden; break-after: page; background-color: ${LEATHERS[leather].tint}; }`;
}
