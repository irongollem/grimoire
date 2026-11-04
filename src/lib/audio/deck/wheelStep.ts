/**
 * Scrolling the one-row bar steps through the page's rows (#1136), one row at a
 * time: a trackpad sends dozens of small wheel events for one swipe and a mouse
 * one big event per notch, and both should move the bar a row, not race it to
 * the last one.
 *
 * Vue-free, with the clock passed in, so it can be tested without timers.
 */

/** Scroll this far (in pixels) before the bar moves a row. */
export const WHEEL_STEP_PX = 40;
/** Keep scrolling and the bar moves another row this often, never faster. */
export const WHEEL_REPEAT_MS = 350;

/** Feed it every wheel event's vertical distance; it answers which way to move, if at all. */
export function createWheelStep(
  now: () => number,
  stepPx: number = WHEEL_STEP_PX,
  repeatMs: number = WHEEL_REPEAT_MS,
): (deltaY: number) => -1 | 0 | 1 {
  let travelled = 0;
  let lastStep = Number.NEGATIVE_INFINITY;

  return (deltaY) => {
    const at = now();
    // Turning back starts a fresh count, so a reversal is never cancelled out by what came before.
    if (travelled !== 0 && Math.sign(deltaY) !== Math.sign(travelled)) travelled = 0;
    travelled += deltaY;
    if (Math.abs(travelled) < stepPx || at - lastStep < repeatMs) return 0;
    const direction = travelled > 0 ? 1 : -1;
    travelled = 0;
    lastStep = at;
    return direction;
  };
}

/** A wheel event's vertical distance in pixels, whatever unit the browser reported it in. */
export function wheelPixels(event: Pick<WheelEvent, "deltaY" | "deltaMode">): number {
  if (event.deltaMode === 1) return event.deltaY * 16; // lines (Firefox with a mouse)
  if (event.deltaMode === 2) return event.deltaY * 400; // pages
  return event.deltaY;
}
