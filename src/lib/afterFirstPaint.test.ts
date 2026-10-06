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

  it("does not run once cancelled", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const task = vi.fn();
    afterFirstPaint(task)();
    vi.advanceTimersByTime(5000);
    expect(task).not.toHaveBeenCalled();
  });
});
