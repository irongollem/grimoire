/**
 * Where a modal should look like it grew from.
 *
 * A detail modal opened from a grid card should expand out of that card rather
 * than fade in from nowhere. But the card and the modal never meet: the card
 * lives inside a list component, the modal is teleported to `body` and mounted
 * by a route change, and a `DOMRect` is not something you can hand through the
 * router. So the click leaves the rect here and the modal collects it on mount.
 *
 * Single-slot and consuming on purpose. An origin is only meaningful for the
 * one navigation that recorded it, so every other way of arriving at a detail
 * route — a deep link, a Back, a link from another entity — finds nothing and
 * falls back to a plain fade. That is the right animation for "this did not
 * come from anywhere on screen", which makes the absence a feature rather than
 * a case anyone has to handle.
 */

/** A `DOMRect` minus the parts a modal animation has no use for. */
export interface ModalOrigin {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface StoredOrigin extends ModalOrigin {
  key: string;
  at: number;
}

let stored: StoredOrigin | null = null;

/**
 * Past this, assume the navigation that recorded the origin never happened — a
 * cancelled guard, a click that ended up opening something else — and that the
 * element it describes has scrolled or gone. A modal opening a full second
 * after the click is not the modal that click started.
 */
const MAX_AGE_MS = 1000;

/**
 * Records the rect a modal opened from. `key` is the destination it was opened
 * towards (a route path), so an origin cannot be picked up by an unrelated
 * modal that happens to mount next.
 */
export function rememberModalOrigin(key: string, rect: ModalOrigin): void {
  stored = {
    key,
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    at: Date.now(),
  };
}

/**
 * Reads and clears the origin recorded for `key`, or null when this modal was
 * not opened from a remembered element.
 *
 * Clears even on a key mismatch: a stored origin that the wrong modal asked for
 * is by definition left over from a navigation that did not end where it said
 * it would, and leaving it to be collected later is how a modal inherits a
 * stranger's animation.
 */
export function takeModalOrigin(key: string): ModalOrigin | null {
  const origin = stored;
  if (!origin) return null;
  stored = null;
  if (origin.key !== key) return null;
  if (Date.now() - origin.at > MAX_AGE_MS) return null;
  const { top, left, width, height } = origin;
  return { top, left, width, height };
}

/** Drops any pending origin. For tests, and for a navigation that bails out. */
export function clearModalOrigin(): void {
  stored = null;
}
