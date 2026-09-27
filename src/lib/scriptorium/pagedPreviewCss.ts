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
import { artUrl } from "@/lib/assets/artUrl";

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
  // An image taller than the space left on a page cannot be placed: Paged.js
  // logs "Unable to layout item" and draws the same image again on the next
  // page. A full-width chapter opener in a two-column A4 book did exactly
  // that, three times over (#915 story 6). Capping images at 80% of the
  // content box (page height minus the 56 + 53 px @page margins below) leaves
  // room for the heading that usually sits above one, and object-fit keeps the
  // picture's proportions when the cap shortens it.
  const imageMaxHeightPx = Math.floor((EDITOR_PAGE_DIMENSIONS_PX[pageSize].h - 56 - 53) * 0.8);

  // Parchment chrome on the rendered page boxes (omitted in ink-friendly mode).
  const pageChrome = inkFriendly
    ? "background: #fff;"
    : `background: url('${artUrl("/assets/scriptorium/page-background.webp")}') center / cover no-repeat, var(--sc-page-bg, #f9f6ef);`;

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
   intrinsic height). break-inside: avoid keeps a cover from splitting.

   break-before: page is required, not just a full height pushing the next
   thing along — two consecutive covers (front then inside) share the SAME
   named page ("sc-cover"), and a shared page name does not by itself force a
   break between them: Paged.js placed both on page 1, with the second
   clipped invisible under the page box's own overflow:hidden (#915 story 6
   round 2 — "the inside cover doesn't render at all"). break-before makes
   every cover start its own fresh page regardless of what preceded it. No
   break-after: the LAST cover (the back cover) has nothing following it to
   push onto a new page, and a break-before on the very first cover is a
   no-op (it's already first). */
@page sc-cover {
  size: ${size};
  margin: 0;
}
.sc-cover {
  page: sc-cover;
  break-before: page;
  break-inside: avoid;
  height: ${coverHeightPx}px;
}
.pagedjs_page {
  ${pageChrome}
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
  margin: 0 auto 1.5rem;
}
/* See imageMaxHeightPx above: no image may be taller than a page can hold.
   .sc-cover-art (coverPage.ts) opts a cover's own full-bleed/art-slot image
   out of the max-height cap above — the same rule that stops an oversized
   inline image from overflowing its page was ALSO silently capping a cover's
   art at ~72% of the sheet (object-fit:contain shrinking a full-bleed photo
   to fit), leaving the rest of the page showing whatever was underneath
   instead of more art (#915 story 6 round 2). */
.pagedjs_page_content img:not(.sc-cover-art) {
  max-height: ${imageMaxHeightPx}px;
  object-fit: contain;
  break-inside: avoid;
}
/* Position context for injected .sc-footer (absolute, bottom:0). */
.pagedjs_pagebox { position: relative; }
.pagedjs_pages { display: flex; flex-direction: column; align-items: center; }

/* Only a true chapter title (h1) is allowed to strand its column — h2/h3
   flow inside their own column now (see .phb-two-col in theme-base.css) and
   must never be left alone at the bottom of one with their own section
   starting on the next page (#915 story 6). A stat block's section labels
   (h4-equivalent, .sc-statblock-section-title) get the same treatment; an
   h3 directly before a table (a table's own "caption" convention) is covered
   by the same rule, so it never separates from the table it introduces. */
h2, h3, .sc-statblock-section-title {
  break-after: avoid;
}
/* Boxed content stays in one column/page unless it is genuinely taller than
   one — "avoid" is a hint the layout falls back from when it truly can't fit,
   which is exactly the "unless taller than a column" carve-out (#915 story 6).

   A stat block/entry is deliberately NOT given the "long boxes may break"
   carve-out below (#915 story 6 round 2): its own size (column vs wide,
   estimateStatBlockSize() in scriptoriumImport.ts) is what keeps it inside
   one page's height in the first place, so relaxing avoid here would only
   let a mis-sized one split rather than surface the sizing bug. */
.sc-descriptive,
.sc-note,
.sc-quote,
.sc-statblock,
.sc-statblock-entry,
.sc-statblock-section,
.sc-ability-table,
.sc-float-group,
table {
  break-inside: avoid;
}
/* A table row never splits mid-cell — a table allowed to break across a page
   (below) still breaks BETWEEN rows, never inside one (#915 story 6 round 2:
   this used to split a check-frequency table's row as "check within / 1
   hour" across a column). */
tr {
  break-inside: avoid;
}
/* Long boxes and tables (classified before layout — pagedBoxes.ts,
   pagedTables.ts) may break after all: EVERY box/table above defaults to
   break-inside: avoid, which is right for a short one (a box/table jumping
   whole to the next page reads fine) but wrong for a long one, which instead
   left the bottom third of the page before it blank (#915 story 6 round 2).
   Naming both the base class and the "--long" modifier gives each of these
   two extra classes of specificity over the blanket rule above, so they win
   outright regardless of declaration order. */
.sc-note.sc-box--long,
.sc-descriptive.sc-box--long,
table.sc-table--long {
  break-inside: auto;
}
/* A monster/NPC entry (entityEmbed.ts) starts its own fresh page by default —
   a Monster Manual entry gets one, and the DM turns this off per node for a
   creature-family variant that should share its first entry's page(s) (e.g.
   flying sword/rug of smothering following animated armor). A normal
   document heading placed directly before such an entry (a family heading)
   keeps the page break instead: it moves from the entry to that heading so
   the two land on the same fresh page together, rather than each forcing
   its own. */
.sc-entity-embed--startpage {
  break-before: page;
}
h2:has(+ .sc-entity-embed--startpage) {
  break-before: page;
}
h2 + .sc-entity-embed--startpage {
  break-before: avoid;
}
`.trim();
}
