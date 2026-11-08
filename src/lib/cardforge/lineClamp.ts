/**
 * Line-clamped text in a saved card image.
 *
 * Card backs clamp their flavor footer and their last ability entry with
 * `-webkit-line-clamp`, and the browser draws the "…" where it cuts. A saved
 * card is drawn inside an SVG `foreignObject` (`useCardImageExport`), where
 * Chrome clamps the lines but draws no "…", so a PNG ended mid-word: "(a single
 * white feather" (8 Nov 2026). So before a card is saved, the text that fits is
 * measured on the live card and written, with its "…", into the copy that is
 * drawn. The live card is never changed.
 */

export const ELLIPSIS = "…";
/** Marks a clamped box on the live card so its copy can be found in the clone. */
export const CLAMP_ATTR = "data-clamp-export";

/** The length of the text a node holds, counting only its text nodes. */
export function textLength(el: Node): number {
  let n = 0;
  const walker = el.ownerDocument!.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) n += t.nodeValue?.length ?? 0;
  return n;
}

/**
 * Keeps the first `keep` characters of `el`'s text, in document order, drops
 * everything after them (text, icons, nested spans), and ends what is kept
 * with "…". Trailing spaces and a dangling comma, colon or semicolon go first,
 * so a cut never reads "feather, …".
 */
export function truncateText(el: Element, keep: number): void {
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    const len = t.data.length;
    if (seen + len < keep) {
      seen += len;
      continue;
    }
    const range = doc.createRange();
    range.setStart(t, keep - seen);
    range.setEnd(el, el.childNodes.length);
    range.deleteContents();
    t.data = t.data.replace(/[\s,;:]+$/u, "") + ELLIPSIS;
    return;
  }
}

/**
 * The largest `n` in [0, total] for which `fits(n)` holds, assuming fitting is
 * monotonic (less text never needs more room). Zero when nothing fits.
 */
export function longestFit(total: number, fits: (n: number) => boolean): number {
  if (fits(total)) return total;
  let lo = 0;
  let hi = total;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** A box the browser is clamping with a "…" right now, whose text overflows it. */
function isCutShort(el: HTMLElement): boolean {
  const clamp = getComputedStyle(el).webkitLineClamp;
  return clamp !== "" && clamp !== "none" && el.scrollHeight > el.clientHeight + 1;
}

/**
 * For every box inside `root` that the browser is cutting short, how many
 * characters of its text fit with a "…" added, measured on an unclamped copy
 * laid out beside it at the same width. Each such box is tagged with
 * `CLAMP_ATTR` so `applyClamps` can find its copy; call the returned `untag`
 * when the image is made.
 */
export function measureClamps(root: HTMLElement): { keep: Map<string, number>; untag: () => void } {
  const keep = new Map<string, number>();
  const tagged: HTMLElement[] = [];
  const boxes = Array.from(root.querySelectorAll<HTMLElement>("*")).filter(isCutShort);
  boxes.forEach((box, i) => {
    const probe = box.cloneNode(true) as HTMLElement;
    Object.assign(probe.style, {
      position: "absolute",
      visibility: "hidden",
      boxSizing: "border-box",
      width: `${box.offsetWidth}px`,
      height: "auto",
      maxHeight: "none",
      display: "block",
      webkitLineClamp: "none",
      overflow: "visible",
    });
    box.after(probe);
    try {
      const pristine = probe.cloneNode(true) as HTMLElement;
      const fits = (n: number) => {
        probe.replaceChildren(...Array.from(pristine.cloneNode(true).childNodes));
        truncateText(probe, n);
        return probe.offsetHeight <= box.offsetHeight + 0.5;
      };
      const id = String(i);
      keep.set(id, longestFit(textLength(pristine), fits));
      box.setAttribute(CLAMP_ATTR, id);
      tagged.push(box);
    } finally {
      probe.remove();
    }
  });
  return { keep, untag: () => tagged.forEach((b) => b.removeAttribute(CLAMP_ATTR)) };
}

/** Writes the measured text, with its "…", into the copy of the card that is drawn. */
export function applyClamps(clone: Node, keep: Map<string, number>): void {
  if (!(clone instanceof Element)) return;
  for (const box of Array.from(clone.querySelectorAll(`[${CLAMP_ATTR}]`))) {
    const n = keep.get(box.getAttribute(CLAMP_ATTR) ?? "");
    if (n !== undefined) truncateText(box, n);
    box.removeAttribute(CLAMP_ATTR);
  }
}
