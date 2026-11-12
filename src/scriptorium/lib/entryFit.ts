/*
 * What the printer did to a linked monster's entry to fit it on its page, handed
 * to the editor so the entry takes the same room there (#1176).
 *
 * The layout shrinks an entry's art, drops its bottom margin, sets a column
 * entry wide or lets it split (pagedEntryFit.ts), all measured against the real
 * page. The editor draws the same entry from the same data, so without this it
 * showed the art at full height and the entry taller than its printed page.
 * Read off the printed pages after each layout, keyed by the entry's block id.
 */

const ENTRY = ".sc-statblock-entry";
const ART = "img.sc-entity-art";

export interface EntryFit {
  /** The size the printer settled on, or null when the entry has no size class. */
  size: "column" | "wide" | null;
  /** The art's inline max-height the fit pass set, "" when it left it alone. */
  artMaxHeight: string;
  marginBottom: string;
  /** The entry may break across pages. */
  split: boolean;
}

/** The fit of each printed linked entry, by block id. A split entry's first fragment is the one read. */
export function readPrintedEntryFits(container: ParentNode): Map<string, EntryFit> {
  const out = new Map<string, EntryFit>();
  container.querySelectorAll<HTMLElement>('[data-type="entity-embed"][data-block-id]').forEach((embed) => {
    const id = embed.getAttribute("data-block-id");
    const entry = embed.querySelector<HTMLElement>(ENTRY);
    if (!id || !entry || out.has(id)) return;
    out.set(id, {
      size: entry.classList.contains("sc-statblock-entry--wide")
        ? "wide"
        : entry.classList.contains("sc-statblock-entry--column")
          ? "column"
          : null,
      artMaxHeight: embed.querySelector<HTMLElement>(ART)?.style.maxHeight ?? "",
      marginBottom: entry.style.marginBottom,
      split: entry.classList.contains("sc-statblock-entry--split"),
    });
  });
  return out;
}

/** Gives the entries under `root` the fit the printer found. */
export function applyEntryFit(root: Element, fit: EntryFit): void {
  root.querySelectorAll<HTMLElement>(ENTRY).forEach((entry) => {
    if (fit.size) {
      entry.classList.remove("sc-statblock-entry--column", "sc-statblock-entry--wide");
      entry.classList.add(`sc-statblock-entry--${fit.size}`);
      entry.querySelectorAll(".sc-statblock").forEach((block) => {
        block.classList.remove("sc-statblock--column", "sc-statblock--wide");
        block.classList.add(`sc-statblock--${fit.size}`);
      });
    }
    if (fit.marginBottom) entry.style.marginBottom = fit.marginBottom;
    if (fit.split) entry.classList.add("sc-statblock-entry--split");
    if (fit.artMaxHeight) {
      const art = entry.querySelector<HTMLElement>(ART);
      if (art) art.style.maxHeight = fit.artMaxHeight;
    }
  });
}
