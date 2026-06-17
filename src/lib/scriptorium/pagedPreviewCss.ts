/*
 * Per-document `@page` CSS for the Paged.js live preview (Phase B, #330).
 *
 * Generated fresh per render and passed to Paged.js as inline CSS (polisher
 * accepts `{ "paged.css": cssText }`). Covers page geometry, the parchment
 * page chrome, and the running footer (text + page number with recto/verso
 * alternation). Footer text is baked in here because @page margin boxes can't
 * read it from a reactive source.
 *
 * Known follow-ups (tracked on #330) not yet handled here: page-number start
 * offset, skip/reset counting, and footer suppression on cover pages. The
 * live paged preview is opt-in (beta toggle) until these reach parity with the
 * legacy manual preview.
 */

import type { ScriptoriumPageSize, ScriptoriumTheme } from "@/types/scriptorium.types";

/** @page size keyword per page size. */
const PAGE_SIZE_KEYWORD: Record<ScriptoriumPageSize, string> = {
  A4: "A4",
  A5: "A5",
  Letter: "letter",
};

export interface PagedPreviewCssOptions {
  pageSize: ScriptoriumPageSize;
  theme: ScriptoriumTheme;
  showPageNumbers: boolean;
  footerText: string;
  inkFriendly: boolean;
}

/** Escape a string for safe use inside a CSS `content: "…"` declaration. */
export function escapeCssString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildPagedPreviewCss(opts: PagedPreviewCssOptions): string {
  const { pageSize, showPageNumbers, footerText, inkFriendly } = opts;
  const size = PAGE_SIZE_KEYWORD[pageSize];
  const footer = escapeCssString(footerText ?? "");

  // Page geometry + parchment chrome on the rendered page boxes. The page
  // background is intentionally omitted in ink-friendly mode.
  const pageChrome = inkFriendly
    ? "background: #fff;"
    : "background: url('/assets/scriptorium/page-background.webp') center / cover no-repeat, var(--sc-page-bg, #f9f6ef);";

  // Centered running footer text (shown whenever the document defines one).
  const footerTextBox = footer
    ? `
  @bottom-center {
    content: "${footer}";
    font-style: italic;
    font-variant: small-caps;
    font-size: 12px;
    color: var(--sc-accent, #7d1c1c);
  }`
    : "";

  // Page number on the outer edge (recto = right page → bottom-right;
  // verso = left page → bottom-left).
  const pageNumberBoxes = showPageNumbers
    ? `
@page :right { @bottom-right { content: counter(page); font-weight: 600; font-size: 12px; color: var(--sc-accent, #7d1c1c); } }
@page :left  { @bottom-left  { content: counter(page); font-weight: 600; font-size: 12px; color: var(--sc-accent, #7d1c1c); } }`
    : "";

  return `
@page {
  size: ${size};
  margin: 56px 68px 53px;${footerTextBox}
}
${pageNumberBoxes}
/* Break hints MUST live in the stylesheet handed to Paged.js — its chunker
   reads break properties from the CSS passed to its polisher, not from the
   app's global theme CSS. Both the explicit pageBreak node (.sc-page-break)
   and a legacy <hr> force a new page. */
hr, .sc-page-break {
  break-before: page;
  display: block;
  height: 0;
  margin: 0;
  border: none;
}
.pagedjs_page {
  ${pageChrome}
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
  margin: 0 auto 1.5rem;
}
.pagedjs_pages { display: flex; flex-direction: column; align-items: center; }
`.trim();
}
