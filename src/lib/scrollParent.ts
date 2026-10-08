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
