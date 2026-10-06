/*
 * Fits a linked monster/NPC entry onto its page by shrinking its art, measured
 * against the real layout (#915 story 6, round 3).
 *
 * An entry (`.sc-statblock-entry`, scriptoriumImport.ts) is `break-inside:
 * avoid`, and the art is the one part of it that can give way. Until this
 * pass the art was capped by a formula that estimated the band's printed
 * height from its character count (`--sc-band-est`), fitted on the Sugarwell
 * booklet in September. Typography changed after that and every wide band
 * printed 19 to 41px taller than the formula said, so the Caramel Crusher's
 * entry no longer fit its page. What Paged.js does with an unbreakable block
 * that fits no page is the reason this matters: it logs "Unable to layout
 * item" and resumes at the node AFTER it (pagedjs layout.js, `new
 * BreakToken(after)`), so the rest of the entry, the creature's lore, was
 * silently missing from the book. Measuring the page instead of predicting it
 * holds through any later font or spacing change.
 *
 * One handler, registered once for every Paged.js render in the app (the live
 * preview and the PDF export are the only two):
 *   - afterParsed: load every entry's art first, so an image placed on a page
 *     has its real size the moment it is measured, not 0 until it arrives.
 *     (beforeParsed is too early: it gets the HTML string, not a tree.)
 *   - layout: before Paged.js looks for overflow on a page, an entry that
 *     does not fit (see entryFits) loses its bottom margin, then gets
 *     the tallest art that lets it end on the page, down to a floor. One that
 *     still does not fit is allowed to split, which moves its tail to the
 *     next page instead of losing it.
 *   - afterRendered: let go of the preloaded images.
 */
import { Handler, registerHandlers } from "pagedjs";

const ENTRY_SELECTOR = ".sc-statblock-entry";
const ART_SELECTOR = "img.sc-entity-art";
/** Below this a figure stops reading as one (the same floor the CSS used). */
export const ENTRY_ART_FLOOR_PX = 96;
/** Lets an entry that cannot fit break across pages (pagedPreviewCss.ts). */
export const ENTRY_SPLIT_CLASS = "sc-statblock-entry--split";

/** Loads every entry image in `root` and keeps the decoded copies alive until
 *  layout, so the copies Paged.js clones onto pages come from the memory
 *  cache with their size known. A failed image is skipped: it lays out as a
 *  broken image either way. */
export async function preloadEntryArt(root: ParentNode): Promise<HTMLImageElement[]> {
  const sources = new Set<string>();
  root.querySelectorAll<HTMLImageElement>(`${ENTRY_SELECTOR} ${ART_SELECTOR}`).forEach((img) => {
    const src = img.getAttribute("src");
    if (src) sources.add(src);
  });
  return Promise.all(
    Array.from(sources, async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode().catch(() => undefined);
      return img;
    }),
  );
}

/** The page's content box, in client-rect space. */
export interface PageBox {
  bottom: number;
  right: number;
}

/**
 * Gives every entry in `wrapper` that does not fit its page no bottom margin
 * and the tallest art that still lets it fit, found by binary search on the
 * art's max-height. Subtracting the overflow once is not enough: lore that
 * wraps beside a shorter figure runs longer, so each height is measured.
 * `page` is in client-rect space, the same (possibly zoomed) space as the
 * entry's own rect, so the preview's zoom never enters the arithmetic. An
 * entry that does not fit even at the floor, or has no art to shrink, gets
 * ENTRY_SPLIT_CLASS.
 */
export function fitEntryArt(wrapper: HTMLElement, page: PageBox): void {
  wrapper.querySelectorAll<HTMLElement>(ENTRY_SELECTOR).forEach((entry) => {
    const fits = () => entryFits(entry, wrapper, page);
    if (fits()) return;
    // An entry that reaches the page bottom ends the page whether it fits or
    // splits, so its bottom margin only pushes it off.
    entry.style.marginBottom = "0";
    if (fits()) return;
    const art = entry.querySelector<HTMLImageElement>(ART_SELECTOR);
    const tallest = art ? art.offsetHeight - 1 : 0;
    if (!art || tallest < ENTRY_ART_FLOOR_PX) {
      entry.classList.add(ENTRY_SPLIT_CLASS);
      return;
    }
    const tryHeight = (h: number) => {
      art.style.maxHeight = `${h}px`;
      return fits();
    };
    if (!tryHeight(ENTRY_ART_FLOOR_PX)) {
      entry.classList.add(ENTRY_SPLIT_CLASS);
      return;
    }
    let lo = ENTRY_ART_FLOOR_PX; // fits
    let hi = tallest; // not yet known
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (tryHeight(mid)) lo = mid;
      else hi = mid - 1;
    }
    art.style.maxHeight = `${lo}px`;
  });
}

/**
 * Whether an entry ends on its page. Two tests, because the entry's own rect
 * can say it fits when it does not. The page content box is itself a
 * multicol (one page-wide column per page), and the book's two-column wrapper
 * inside it is another. An entry spans that wrapper (`column-span: all`), and
 * there its top margin is not dropped at the top of the page, so an entry
 * whose border box fits exactly still overflows the wrapper by its margins.
 * The wrapper then runs on into an off-page column; Paged.js counts the page
 * as fitting, the entry's rect still reads as in place, and the page prints
 * empty. That is what happened to the Caramel Crusher (1,012px of entry, an
 * 18.4px margin, a 1,013.5px page). The spill shows as width: any element
 * between the entry and the page that reaches past the page's right edge.
 */
function entryFits(entry: HTMLElement, wrapper: HTMLElement, page: PageBox): boolean {
  if (marginBottomEdge(entry) - page.bottom > 0.5) return false;
  for (let el: HTMLElement | null = entry; el && el !== wrapper; el = el.parentElement) {
    if (el.getBoundingClientRect().right - page.right > 1) return false;
  }
  return true;
}

/** Where an entry's margin box ends, in client-rect space. */
function marginBottomEdge(entry: HTMLElement): number {
  const rect = entry.getBoundingClientRect();
  const margin = parseFloat(getComputedStyle(entry).marginBottom) || 0;
  if (!margin) return rect.bottom;
  const scale = entry.offsetHeight ? rect.height / entry.offsetHeight : 1;
  return rect.bottom + margin * scale;
}

interface PagedLayout {
  bounds: DOMRect;
}

class EntryFitHandler extends Handler {
  /** The decoded copies, held so the browser keeps them in its memory cache
   *  while pages are laid out, and let go once the book is done. */
  private preloaded: HTMLImageElement[] = [];

  async afterParsed(parsed: ParentNode): Promise<void> {
    this.preloaded = await preloadEntryArt(parsed);
  }

  layout(wrapper: HTMLElement, layout: PagedLayout): void {
    fitEntryArt(wrapper, layout.bounds);
  }

  afterRendered(): void {
    this.preloaded.length = 0;
  }
}

let registered = false;

/** Registers the handler with Paged.js. Paged.js keeps handlers in a module
 *  list shared by every Previewer, so this runs once however often it is
 *  called; both renderers call it before their first preview. */
export function registerPagedEntryFit(): void {
  if (registered) return;
  registered = true;
  registerHandlers(EntryFitHandler);
}
