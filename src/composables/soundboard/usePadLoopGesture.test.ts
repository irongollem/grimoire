import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { usePadLoopGesture } from "./usePadLoopGesture";

function pointerEvent(over: Partial<PointerEvent> = {}): PointerEvent {
  return { button: 0, clientX: 0, clientY: 0, ...over } as PointerEvent;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("double-tap", () => {
  it("does nothing on a single click", () => {
    const onToggleLoop = vi.fn();
    const gesture = usePadLoopGesture({ onToggleLoop });

    expect(gesture.onClick()).toBe(true);
    expect(onToggleLoop).not.toHaveBeenCalled();
  });

  it("toggles loop on a second click inside the window, and still asks the caller to fire", () => {
    const onToggleLoop = vi.fn();
    const gesture = usePadLoopGesture({ onToggleLoop, doubleTapMs: 300 });

    expect(gesture.onClick()).toBe(true);
    vi.advanceTimersByTime(150);
    expect(gesture.onClick()).toBe(true);

    expect(onToggleLoop).toHaveBeenCalledTimes(1);
  });

  it("does not toggle when the second click arrives after the window", () => {
    const onToggleLoop = vi.fn();
    const gesture = usePadLoopGesture({ onToggleLoop, doubleTapMs: 300 });

    gesture.onClick();
    vi.advanceTimersByTime(400);
    gesture.onClick();

    expect(onToggleLoop).not.toHaveBeenCalled();
  });

  it("a third quick click does not re-trigger — pairs reset rather than chain", () => {
    const onToggleLoop = vi.fn();
    const gesture = usePadLoopGesture({ onToggleLoop, doubleTapMs: 300 });

    gesture.onClick(); // 1st
    vi.advanceTimersByTime(100);
    gesture.onClick(); // 2nd — toggles
    vi.advanceTimersByTime(100);
    gesture.onClick(); // 3rd — starts a fresh pair, no toggle

    expect(onToggleLoop).toHaveBeenCalledTimes(1);
  });
});

describe("long-press", () => {
  it("toggles loop once the hold outlasts the threshold, without waiting for release", () => {
    const onToggleLoop = vi.fn();
    const gesture = usePadLoopGesture({ onToggleLoop, longPressMs: 500 });

    gesture.onPointerdown(pointerEvent());
    vi.advanceTimersByTime(500);

    expect(onToggleLoop).toHaveBeenCalledTimes(1);
  });

  it("suppresses the click that follows a long-press release", () => {
    const onToggleLoop = vi.fn();
    const gesture = usePadLoopGesture({ onToggleLoop, longPressMs: 500 });

    gesture.onPointerdown(pointerEvent());
    vi.advanceTimersByTime(500);
    gesture.onPointerup();

    expect(gesture.onClick()).toBe(false);
    expect(onToggleLoop).toHaveBeenCalledTimes(1);
  });

  it("a quick tap never fires the long-press timer", () => {
    const onToggleLoop = vi.fn();
    const gesture = usePadLoopGesture({ onToggleLoop, longPressMs: 500 });

    gesture.onPointerdown(pointerEvent());
    vi.advanceTimersByTime(100);
    gesture.onPointerup();
    vi.advanceTimersByTime(1000);

    expect(onToggleLoop).not.toHaveBeenCalled();
    expect(gesture.onClick()).toBe(true);
  });

  it("cancels the hold when the pointer travels past the move threshold — a scroll, not a press", () => {
    const onToggleLoop = vi.fn();
    const gesture = usePadLoopGesture({ onToggleLoop, longPressMs: 500, moveThresholdPx: 10 });

    gesture.onPointerdown(pointerEvent({ clientX: 0, clientY: 0 }));
    gesture.onPointermove(pointerEvent({ clientX: 30, clientY: 0 }));
    vi.advanceTimersByTime(500);

    expect(onToggleLoop).not.toHaveBeenCalled();
  });

  it("cancels the hold on pointercancel", () => {
    const onToggleLoop = vi.fn();
    const gesture = usePadLoopGesture({ onToggleLoop, longPressMs: 500 });

    gesture.onPointerdown(pointerEvent());
    gesture.onPointercancel();
    vi.advanceTimersByTime(500);

    expect(onToggleLoop).not.toHaveBeenCalled();
  });

  it("ignores a right-button pointerdown — that path belongs to onContextmenu", () => {
    const onToggleLoop = vi.fn();
    const gesture = usePadLoopGesture({ onToggleLoop, longPressMs: 500 });

    gesture.onPointerdown(pointerEvent({ button: 2 }));
    vi.advanceTimersByTime(500);

    expect(onToggleLoop).not.toHaveBeenCalled();
  });
});

describe("right-click", () => {
  it("toggles loop and suppresses the native menu", () => {
    const onToggleLoop = vi.fn();
    const gesture = usePadLoopGesture({ onToggleLoop });
    const event = { preventDefault: vi.fn() } as unknown as MouseEvent;

    gesture.onContextmenu(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(onToggleLoop).toHaveBeenCalledTimes(1);
  });

  it("does not double-toggle when Android also fires contextmenu after our own long-press already did", () => {
    const onToggleLoop = vi.fn();
    const gesture = usePadLoopGesture({ onToggleLoop, longPressMs: 500 });

    gesture.onPointerdown(pointerEvent());
    vi.advanceTimersByTime(500); // our timer fires the toggle
    gesture.onContextmenu({ preventDefault: vi.fn() } as unknown as MouseEvent);

    expect(onToggleLoop).toHaveBeenCalledTimes(1);
  });
});
