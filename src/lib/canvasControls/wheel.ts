// What a wheel event means on a design canvas, as a pure decision. Shared by
// every canvas that follows the Photoshop/Figma controls (the Cartographer,
// the quest story flow, the notice board, the NPC web, the family tree).
//
// The convention is the one Photoshop and Figma share: the plain wheel and a
// two-finger trackpad swipe PAN, and zoom needs a modifier (Ctrl, Cmd or Alt).
// A trackpad pinch reaches the browser as a wheel event with ctrlKey set and
// small fractional deltas, so it lands on the zoom branch for free.
//
// The editor used to zoom on every wheel event. On a trackpad that made the
// map lurch whenever a swipe was meant to scroll it, because a swipe is a
// stream of wheel events too (issue #1096).

export type WheelIntent =
  | { kind: "zoom"; factor: number }
  | { kind: "pan"; dx: number; dy: number };

export interface WheelEventLike {
  deltaX: number;
  deltaY: number;
  /** 0 = pixels, 1 = lines, 2 = pages. */
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

// Browsers report a notch as ~100 px on most mice, but Firefox can report
// lines or pages. These bring them all to pixels.
const LINE_PX = 16;
const PAGE_PX = 800;

// A trackpad pinch sends many small deltas (a pixel or a few each), a mouse
// notch one big one (~100 px). Zooming by e^(-0.01 * delta) gives a pinch the
// responsive feel Figma has, but would make one notch a 2.7x jump. So a single
// event's delta is capped at the size of a 10% step: a pinch keeps its full
// sensitivity, and a notch (or a fast fling) zooms exactly 10%.
const ZOOM_PER_PX = 0.01;
const MAX_ZOOM_DELTA_PX = Math.log(1.1) / ZOOM_PER_PX;

function toPixels(delta: number, deltaMode: number): number {
  if (deltaMode === 1) return delta * LINE_PX;
  if (deltaMode === 2) return delta * PAGE_PX;
  return delta;
}

export function resolveWheel(ev: WheelEventLike): WheelIntent {
  const dx = toPixels(ev.deltaX, ev.deltaMode);
  const dy = toPixels(ev.deltaY, ev.deltaMode);

  if (ev.ctrlKey || ev.metaKey || ev.altKey) {
    // Scrolling up (negative deltaY) zooms in, proportional to the delta so a
    // pinch's tiny steps stay smooth.
    const capped = Math.max(-MAX_ZOOM_DELTA_PX, Math.min(MAX_ZOOM_DELTA_PX, dy));
    return { kind: "zoom", factor: Math.exp(-capped * ZOOM_PER_PX) };
  }

  // A mouse sends only deltaY for Shift+wheel and expects it to scroll
  // sideways; macOS already moves the amount into deltaX, so keep that as is.
  if (ev.shiftKey && dx === 0) return { kind: "pan", dx: dy, dy: 0 };

  return { kind: "pan", dx, dy };
}
