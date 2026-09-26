/*
 * Table-header promotion for the Paged.js book (#915 story 6).
 *
 * Tiptap's Table extension (prosemirror-tables) renders every row — including
 * a toggled header row — inside ONE <tbody>, with no <thead> at all. That's
 * fine for the editor (its own interactive NodeView owns that DOM), but it
 * means a table's header row can never repeat across a forced page/column
 * break in the printed book: `display: table-header-group` only fires on a
 * genuine <thead>, and Paged.js reads real table structure, not a CSS class.
 *
 * promoteTableHeaders() runs on the HTML string BEFORE Paged.js lays the page
 * out — the same timing as pagedToc.ts's expandTocPlaceholder, a pre-layout
 * pass, not a post-layout DOM patch, because the header has to already be a
 * <thead> when the chunker decides where to break. It:
 *
 *   1. Moves any LEADING run of all-<th> rows into a real <thead>, leaving
 *      the rest in <tbody>. This also covers a genuine two-row header (e.g. a
 *      class table's "Spell Slots per Spell Level" column group, built with
 *      colspan/rowspan) since every leading all-header row is promoted, not
 *      just the first.
 *   2. Classifies each column as short/long content (see COLUMN_SHORT_MAX)
 *      and marks every cell in a short column `sc-table-col-center`, every
 *      cell in a long column `sc-table-col-left` — phb2014's table CSS
 *      (theme-base.css) reads these to centre a numbers/codes column and
 *      left-align a prose one; onednd2024 doesn't reference the classes and
 *      is unaffected. Skipped for a table using colspan/rowspan: a flat
 *      child-index doesn't reflect the visual grid once cells span multiple
 *      columns, so guessing there would risk misclassifying rather than
 *      leaving the safe default (left-align).
 *
 * Both steps are pure DOM operations on a detached container, like the rest
 * of this pipeline (pagedToc.ts, entityEmbeds.ts) — no Paged.js, no app
 * globals, easily unit tested with jsdom/happy-dom.
 */

/**
 * A column reads as "short" when every one of its body cells' trimmed text is
 * at or under this length — long enough for an ability score, a die
 * expression ("3d6"), an ordinal rank ("20th") or a short bonus ("+13"), too
 * short for a sentence of prose. Documented here rather than left as a bare
 * number because "why 6" is the first question anyone reading this file has.
 */
export const COLUMN_SHORT_MAX = 6;

function isHeaderRow(row: Element): boolean {
  const cells = Array.from(row.children);
  return cells.length > 0 && cells.every((c) => c.tagName === "TH");
}

function hasSpans(rows: Element[]): boolean {
  return rows.some((r) =>
    Array.from(r.children).some((c) => {
      const cell = c as HTMLTableCellElement;
      return cell.colSpan > 1 || cell.rowSpan > 1;
    }),
  );
}

function promoteOneTable(table: HTMLTableElement): void {
  // A table that already carries a <thead> (none of ours do today, but a
  // future import path might) is left exactly as it is.
  if (table.querySelector("thead")) return;

  const body = table.querySelector("tbody");
  const rows = Array.from((body ?? table).children).filter(
    (el): el is HTMLTableRowElement => el.tagName === "TR",
  );
  if (rows.length === 0) return;

  let headerRowCount = 0;
  while (headerRowCount < rows.length && isHeaderRow(rows[headerRowCount])) headerRowCount++;

  if (headerRowCount > 0) {
    const doc = table.ownerDocument;
    const thead = doc.createElement("thead");
    rows.slice(0, headerRowCount).forEach((r) => thead.appendChild(r));
    table.insertBefore(thead, table.firstChild);
  }

  if (hasSpans(rows)) return;

  // Classify from the body rows only — a header cell's own (usually short)
  // label shouldn't decide a prose column's alignment.
  const bodyRows = rows.slice(headerRowCount);
  if (bodyRows.length === 0) return;
  const columnCount = Math.max(...rows.map((r) => r.children.length));
  for (let col = 0; col < columnCount; col++) {
    const values = bodyRows
      .map((r) => r.children[col]?.textContent?.trim() ?? "")
      .filter((t) => t.length > 0);
    if (values.length === 0) continue;
    const short = values.every((t) => t.length <= COLUMN_SHORT_MAX);
    const cls = short ? "sc-table-col-center" : "sc-table-col-left";
    rows.forEach((r) => {
      r.children[col]?.classList.add(cls);
    });
  }
}

/**
 * Promote every table's leading header row(s) into a real `<thead>` and
 * classify its columns for alignment, in place. No-op (and cheap to check)
 * when the html has no table at all.
 */
export function promoteTableHeaders(html: string): string {
  if (!html.includes("<table")) return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("table").forEach((t) => promoteOneTable(t as HTMLTableElement));
  return container.innerHTML;
}
