/**
 * The nearest ancestor that actually scrolls `el` — the element whose
 * `scrollTop` moves when the page under it does.
 *
 * Not `window`: below `lg` the layout's `<main>` is the scroller (DefaultLayout
 * pins the shell to `h-dvh`), and from `lg` a list page's own body is. So
 * anything that reads or resets a scroll position has to find out which one it
 * is in rather than assume — the router's `scrollBehavior` scrolls `window`,
 * which never scrolls here, and that is why it never reset anything.
 *
 * Null when nothing between `el` and the document scrolls.
 */
export function scrollParentOf(el: Element): HTMLElement | null {
  let nearest: HTMLElement | null = null;
  for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY !== "auto" && overflowY !== "scroll") continue;
    nearest ??= node;
    // An auto-overflow box only scrolls if something bounds its height. Page
    // wrappers that are `lg:h-full` grow with their content below lg, so on a
    // phone they are as tall as the page and scroll nothing: the player Workshop
    // reported a 56,527px "scroller" and VirtualGrid mounted all 176 recipes
    // (8 Oct 2026). No taller than the viewport is the test; a scroller that
    // tall is the layout's own, further out.
    if (node.clientHeight <= window.innerHeight) return node;
  }
  // Nothing bounded (or no layout at all, as in jsdom): the nearest, as before.
  return nearest;
}

export type ScrollBlock = "start" | "center" | "nearest";

/**
 * Brings `el` into view by scrolling only its own scroller (`scrollParentOf`), never the ones further out.
 *
 * `el.scrollIntoView()` scrolls every ancestor that can scroll, and that includes boxes that are `overflow: hidden`
 * and the document itself. The app shell is one: it pins the sidebar, the page and the docked soundboard deck to the
 * screen, and a jump made with `scrollIntoView` slid the whole shell up, so the deck rose into the middle of the page
 * with empty paper under it (the Canon page's backstory link, 24 Nov 2026). This moves the one scroller that should move.
 */
export function scrollWithin(el: HTMLElement, { block = "start", smooth = false }: { block?: ScrollBlock; smooth?: boolean } = {}): void {
  const scroller = scrollParentOf(el);
  if (!scroller) return;
  const box = scroller.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const offset = rect.top - box.top;
  let top: number;
  if (block === "start") top = scroller.scrollTop + offset;
  else if (block === "center") top = scroller.scrollTop + offset - (box.height - rect.height) / 2;
  else if (offset < 0) top = scroller.scrollTop + offset;
  else if (rect.bottom > box.bottom) top = scroller.scrollTop + (rect.bottom - box.bottom);
  else return;
  scroller.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
}
