/*
 * Per-document `@page` CSS for the Paged.js live preview (Phase B, #330).
 *
 * Generated fresh per render and passed to Paged.js as inline CSS (polisher
 * accepts `{ "paged.css": cssText }`). Covers page geometry, the parchment
 * page chrome, and the break hints. Footers (page numbers, text, skip/reset,
 * cover suppression) are NOT here — Paged.js can't express content-driven
 * numbering, so they're injected after layout by injectPagedFooters().
 */

import type { ScriptoriumPageSize } from "@/types/scriptorium.types";
import { EDITOR_PAGE_DIMENSIONS_PX } from "@/lib/scriptorium/editorConstants";

/** @page size keyword per page size. */
const PAGE_SIZE_KEYWORD: Record<ScriptoriumPageSize, string> = {
  A4: "A4",
  A5: "A5",
  Letter: "letter",
};

export interface PagedPreviewCssOptions {
  pageSize: ScriptoriumPageSize;
  inkFriendly: boolean;
}

// @page vertical margins (top 56 + bottom 53) — keep in sync with the @page
// rule below; covers are sized to the resulting content area so they fill their
// page exactly without overflowing into a fragment.
export function buildPagedPreviewCss(opts: PagedPreviewCssOptions): string {
  const { pageSize, inkFriendly } = opts;
  const size = PAGE_SIZE_KEYWORD[pageSize];
  // Covers live on a zero-margin named page, so they fill the whole sheet
  // edge-to-edge (full bleed). Height = the full page minus a couple px: an
  // exact fit rounds up and overflows into a blank continuation page.
  const coverHeightPx = EDITOR_PAGE_DIMENSIONS_PX[pageSize].h - 4;

  // Parchment chrome on the rendered page boxes (omitted in ink-friendly mode).
  const pageChrome = inkFriendly
    ? "background: #fff;"
    : "background: url('/assets/scriptorium/page-background.webp') center / cover no-repeat, var(--sc-page-bg, #f9f6ef);";

  return `
@page {
  size: ${size};
  margin: 56px 68px 53px;
}
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
/* Cover pages own a full, edge-to-edge page. They sit on a zero-margin named
   page so the art bleeds to the sheet edges, with an explicit full-page height
   (the cover's inner art/overlay are absolutely positioned, so it has no
   intrinsic height). break-before starts it on a fresh page; its full height
   pushes following content to the next page (no break-after → no trailing
   blank); break-inside: avoid keeps it from splitting. */
@page sc-cover {
  size: ${size};
  margin: 0;
}
.sc-cover {
  page: sc-cover;
  break-inside: avoid;
  height: ${coverHeightPx}px;
}
.pagedjs_page {
  ${pageChrome}
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
  margin: 0 auto 1.5rem;
}
/* Position context for injected .sc-footer (absolute, bottom:0). */
.pagedjs_pagebox { position: relative; }
.pagedjs_pages { display: flex; flex-direction: column; align-items: center; }
`.trim();
}
