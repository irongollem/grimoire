import { afterEach, describe, expect, it, vi } from "vitest";
import { afterFirstPaint } from "./afterFirstPaint";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("afterFirstPaint", () => {
  it("runs the task through requestIdleCallback with a timeout bound", () => {
    const ric = vi.fn((cb: () => void) => { cb(); return 7; });
    vi.stubGlobal("requestIdleCallback", ric);
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    const task = vi.fn();
    afterFirstPaint(task, 1500);
    expect(task).toHaveBeenCalledOnce();
    expect(ric).toHaveBeenCalledWith(task, { timeout: 1500 });
  });

  it("falls back to a timer where requestIdleCallback is missing", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const task = vi.fn();
    afterFirstPaint(task);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(task).toHaveBeenCalledOnce();
  });

  it("waits no longer than the caller's own bound where that is shorter than the fallback cap", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const task = vi.fn();
    afterFirstPaint(task, 300);
    vi.advanceTimersByTime(300);
    expect(task).toHaveBeenCalledOnce();
  });

  it("cancels the pending idle callback by its handle", () => {
    const cancel = vi.fn();
    vi.stubGlobal("requestIdleCallback", vi.fn(() => 7));
    vi.stubGlobal("cancelIdleCallback", cancel);
    afterFirstPaint(vi.fn())();
    expect(cancel).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("does not run once cancelled", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const task = vi.fn();
    afterFirstPaint(task)();
    vi.advanceTimersByTime(5000);
    expect(task).not.toHaveBeenCalled();
  });
});
