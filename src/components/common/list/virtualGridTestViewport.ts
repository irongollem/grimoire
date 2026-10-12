import { afterAll, beforeAll } from "vitest";

/**
 * VirtualGrid mounts only what fits its scroller, and jsdom has no layout, so
 * every box reads 0 tall and nothing would render. Call this at the top of a
 * suite that mounts a list: it gives the document a tall viewport and every
 * element a plausible height, which makes a screenful of items "visible"
 * without changing what is under test. After mounting, `await
 * flushMicrotasks()`: the grid finds its scroller on mount and items follow.
 */
export function useVirtualGridViewport(): void {
  const VIEWPORT_PX = 2600;
  const ITEM_PX = 260;
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this === document.documentElement ? VIEWPORT_PX : ITEM_PX;
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
