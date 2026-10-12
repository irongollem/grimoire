import { afterAll, beforeAll } from "vitest";

/**
 * VirtualGrid mounts only what fits its scroller, and jsdom has no layout, so
 * every box reads 0 tall and nothing would render. Call this at the top of a
 * suite that mounts a list: it gives the document a tall viewport and every
 * element a plausible height, which makes a screenful of items "visible"
 * without changing what is under test. After mounting, `await
 * flushMicrotasks()`: the grid finds its scroller on mount and items follow.
 * `viewportPx` is the scroller's height and `itemPx` every other box's.
 */
export function useVirtualGridViewport({ viewportPx = 2600, itemPx = 260 } = {}): void {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this === document.documentElement ? viewportPx : itemPx;
      },
    });
  });
  afterAll(() => {
    if (original) Object.defineProperty(HTMLElement.prototype, "offsetHeight", original);
  });
}

/** Lets the grid find its scroller and render the items that follow. */
export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
