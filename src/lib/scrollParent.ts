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
  for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}
