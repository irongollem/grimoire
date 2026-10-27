/*
 * Spans a table across the page when it does not fit its column, measured
 * against the real layout (#1115).
 *
 * A table is as wide as its longest words plus its cell padding, whatever
 * width it is given. Four columns of prose in half a page cannot be that
 * narrow: one of Sothery's faction tables came out 334px wide in a 317px
 * column and printed across the gutter and into the page margin. A book sets
 * such a table across both columns, which is what the author does by hand
 * with a wide block. Words are not broken instead (see the table cell rule in
 * theme-base.css). Whether a table fits depends on the face, the size and the
 * words, so the page decides, not a column count.
 *
 * One handler, registered once for every Paged.js render in the app, like
 * pagedEntryFit.ts: at each layout check it measures every table in a
 * column and gives one wider than its column TABLE_SPAN_CLASS, on the page
 * and in the parsed source Paged.js clones a continuation from.
 */
import { Handler, registerHandlers } from "pagedjs";
import { sourceIn, type SourceOf } from "@/lib/scriptorium/pagedSource";

/** Sets a table across every column of the page (theme-base.css). */
export const TABLE_SPAN_CLASS = "sc-table--span";

/** The width of one column of a multicol box, in layout px. */
function columnWidth(multicol: HTMLElement): number {
  const style = getComputedStyle(multicol);
  const count = parseInt(style.columnCount, 10);
  if (!(count > 1)) return multicol.clientWidth;
  const gap = parseFloat(style.columnGap) || 0;
  const inner = multicol.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  return (inner - gap * (count - 1)) / count;
}

/**
 * Gives every table that sits directly in a multicol column of `wrapper` and
 * is wider than that column TABLE_SPAN_CLASS. The width is a row's, not the
 * table's: a table broken across two columns reports both columns as its
 * offsetWidth, and a row never breaks (`tr { break-inside: avoid }`).
 */
export function spanWideTables(wrapper: HTMLElement, sourceOf?: SourceOf): void {
  wrapper.querySelectorAll<HTMLTableElement>(".phb-two-col > table").forEach((table) => {
    if (table.classList.contains(TABLE_SPAN_CLASS)) return;
    const row = table.rows[0];
    const column = table.parentElement as HTMLElement;
    if (!row || row.offsetWidth <= columnWidth(column) + 0.5) return;
    table.classList.add(TABLE_SPAN_CLASS);
    sourceOf?.(table)?.classList.add(TABLE_SPAN_CLASS);
  });
}

class TableFitHandler extends Handler {
  /** The parsed book, which Paged.js clones every page's elements from. */
  private parsed: ParentNode | null = null;

  afterParsed(parsed: ParentNode): void {
    this.parsed = parsed;
  }

  layout(wrapper: HTMLElement): void {
    spanWideTables(wrapper, sourceIn(this.parsed));
  }

  afterRendered(): void {
    this.parsed = null;
  }
}

let registered = false;

/** Registers the handler with Paged.js, once (see registerPagedEntryFit). */
export function registerPagedTableFit(): void {
  if (registered) return;
  registered = true;
  registerHandlers(TableFitHandler);
}
