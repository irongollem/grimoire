/**
 * Loop toggle without a visible control: a Perform pad has exactly one
 * gesture (tap to fire), so a second action has to ride on top of it rather
 * than adding a button that would compete with "aim and hit."
 *
 * Two independent triggers, because a timed gesture alone is a game few
 * people discover and fewer land reliably:
 *
 *  - **Double-tap / double-click** — a second tap within `doubleTapMs` of the
 *    first. Detected on the click event itself, so it works for touch, mouse
 *    and keyboard activation alike with no separate listener to keep in sync.
 *    The pad's normal tap action still fires on every click; two rapid fires
 *    toggle play state twice, which nets back to where it started, so nothing
 *    here needs to suppress it.
 *  - **Long-press / right-click** — held past `longPressMs`, or a genuine
 *    right-click with no hold behind it. Some touch browsers (Android) also
 *    fire a native `contextmenu` for a long-press on a plain button, on top
 *    of our own timer; `longPressHandled` remembers our timer already
 *    answered so the browser's version only suppresses its menu instead of
 *    toggling loop a second time.
 */

export interface PadLoopGestureOptions {
  onToggleLoop: () => void;
  /** Window for a second click to count as a double-tap. */
  doubleTapMs?: number;
  /** How long a hold has to last before it counts as a long-press. */
  longPressMs?: number;
  /** Pointer travel past this cancels a long-press in progress (a scroll or drag, not a hold). */
  moveThresholdPx?: number;
}

export interface PadLoopGesture {
  /** Call from `@click`. Returns whether the caller should still run its normal tap action. */
  onClick: () => boolean;
  onPointerdown: (event: PointerEvent) => void;
  onPointermove: (event: PointerEvent) => void;
  onPointerup: () => void;
  onPointercancel: () => void;
  onContextmenu: (event: MouseEvent) => void;
}

export function usePadLoopGesture(options: PadLoopGestureOptions): PadLoopGesture {
  const doubleTapMs = options.doubleTapMs ?? 300;
  const longPressMs = options.longPressMs ?? 500;
  const moveThresholdPx = options.moveThresholdPx ?? 10;

  let lastTapAt = 0;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressHandled = false;
  let startX = 0;
  let startY = 0;

  function clearLongPressTimer(): void {
    if (longPressTimer === null) return;
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  function onPointerdown(event: PointerEvent): void {
    // Right-button pointerdown is handled by onContextmenu instead; starting a
    // hold timer for it too would race the two paths against each other.
    if (event.button !== 0) return;
    longPressHandled = false;
    startX = event.clientX;
    startY = event.clientY;
    clearLongPressTimer();
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      longPressHandled = true;
      options.onToggleLoop();
    }, longPressMs);
  }

  function onPointermove(event: PointerEvent): void {
    if (longPressTimer === null) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.hypot(dx, dy) > moveThresholdPx) clearLongPressTimer();
  }

  function onPointerup(): void {
    clearLongPressTimer();
  }

  function onPointercancel(): void {
    clearLongPressTimer();
  }

  function onClick(): boolean {
    if (longPressHandled) {
      // The long-press already fired the toggle; this is the click the
      // browser still sends on release, and it must not also fire the pad.
      longPressHandled = false;
      return false;
    }
    const now = Date.now();
    const isDoubleTap = now - lastTapAt <= doubleTapMs;
    // Reset rather than extend the window on a hit, so a third quick tap
    // starts a fresh pair instead of re-triggering the toggle.
    lastTapAt = isDoubleTap ? 0 : now;
    if (isDoubleTap) options.onToggleLoop();
    return true;
  }

  function onContextmenu(event: MouseEvent): void {
    event.preventDefault();
    if (longPressHandled) {
      longPressHandled = false;
      return;
    }
    options.onToggleLoop();
  }

  return { onClick, onPointerdown, onPointermove, onPointerup, onPointercancel, onContextmenu };
}
