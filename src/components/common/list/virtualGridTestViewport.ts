import { afterAll, beforeAll } from "vitest";

/**
 * VirtualGrid mounts only what fits its scroller, and jsdom has no layout, so
 * every box reads 0 tall and nothing would render. Call this at the top of a
 * suite that mounts a list: it gives the document a tall viewport and every
 * element a plausible height, which makes a screenful of items "visible"
 * without changing what is under test. After mounting, `await
 * flushMicrotasks()`: the grid finds its scroller on mount and items follow.
 * `viewportPx` is the scroller's height and `itemPx` every other box's.
 *
 * Both `offsetHeight` and `clientHeight` are faked: virtual-core measures items
 * by `offsetHeight` and, since 3.19.9, the scroller by `clientHeight`.
 */
const FAKED = ["offsetHeight", "clientHeight"] as const;

export function useVirtualGridViewport({ viewportPx = 2600, itemPx = 260 } = {}): void {
  const originals = FAKED.map((prop) => [prop, Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop)] as const);
  beforeAll(() => {
    for (const prop of FAKED) {
      Object.defineProperty(HTMLElement.prototype, prop, {
        configurable: true,
        get(this: HTMLElement) {
          return this === document.documentElement ? viewportPx : itemPx;
        },
      });
    }
  });
  afterAll(() => {
    for (const [prop, original] of originals) {
      if (original) Object.defineProperty(HTMLElement.prototype, prop, original);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop];
    }
  });
}

/** Lets the grid find its scroller and render the items that follow. */
export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
