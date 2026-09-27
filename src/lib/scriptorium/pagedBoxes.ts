/*
 * Long-box classification for the Paged.js book (#915 story 6 round 2).
 *
 * Every `.sc-note` (sidebar) and `.sc-descriptive` (read-aloud) box defaults
 * to `break-inside: avoid` (pagedPreviewCss.ts) — right for a short box (it
 * reads better jumping whole to the next page/column than splitting), wrong
 * for a long one, which instead left the bottom third of the page before it
 * blank while the whole box jumped ahead.
 *
 * classifyLongBoxes() runs on the HTML string BEFORE Paged.js lays the page
 * out — the same pre-layout timing as pagedToc.ts's expandTocPlaceholder and
 * pagedTables.ts's promoteTableHeaders, because the `sc-box--long` class has
 * to already be there when the chunker decides where to break. It's a pure
 * DOM transform on a detached container, easily unit tested with jsdom/
 * happy-dom, same as the rest of this pipeline.
 */

/**
 * A box above this many TEXT characters (tags stripped) is long enough that
 * `break-inside: avoid` does more harm than good. Calibrated against the
 * Sugarwell booklet's own boxes (measured against production data): the
 * longest box that stayed comfortably short was 643 characters (a two-part
 * puzzle description); the two that produced a round-1 blank-page bug were
 * 863 ("Running the Dungeon", p7) and 1006 ("The Adventure in Brief", p29)
 * characters. 700 sits just above the short end and comfortably below both
 * known-long boxes.
 */
export const LONG_BOX_CHAR_THRESHOLD = 700;

function textLength(el: Element): number {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().length;
}

/**
 * Add `sc-box--long` to every `.sc-note`/`.sc-descriptive` box whose text
 * exceeds the threshold above, in place. No-op (and cheap to check) when the
 * html has neither.
 */
export function classifyLongBoxes(html: string): string {
  if (!html.includes("sc-note") && !html.includes("sc-descriptive")) return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll(".sc-note, .sc-descriptive").forEach((box) => {
    if (textLength(box) > LONG_BOX_CHAR_THRESHOLD) box.classList.add("sc-box--long");
  });
  return container.innerHTML;
}
