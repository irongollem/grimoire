import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSnapshotScheduler } from "./motionSnapshot";

describe("the motion snapshot scheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a finished edit is in the snapshot at once, so a moved swaying prop never vanishes for a quarter second", () => {
    const rebuild = vi.fn();
    createSnapshotScheduler(rebuild, 250).changed(false);
    expect(rebuild).toHaveBeenCalledTimes(1); // no timer advanced
  });

  it("a drag rebuilds on an interval, not on every pointer move and not only after it goes quiet", () => {
    const rebuild = vi.fn();
    const s = createSnapshotScheduler(rebuild, 250);
    for (let i = 0; i < 20; i++) {
      s.changed(true);
      vi.advanceTimersByTime(40);
    }
    // 800ms of continuous moves: a debounce would have built nothing, per-move would have built 20.
    expect(rebuild.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(rebuild.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("releasing a drag builds what the throttle had not yet, immediately", () => {
    const rebuild = vi.fn();
    const s = createSnapshotScheduler(rebuild, 250);
    s.changed(true);
    s.settled();
    expect(rebuild).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(rebuild).toHaveBeenCalledTimes(1); // the stale timer does not build it again
  });

  it("settling with nothing changed builds nothing", () => {
    const rebuild = vi.fn();
    createSnapshotScheduler(rebuild, 250).settled();
    expect(rebuild).not.toHaveBeenCalled();
  });

  it("a cancelled scheduler (motion paused) never builds from a leftover timer", () => {
    const rebuild = vi.fn();
    const s = createSnapshotScheduler(rebuild, 250);
    s.changed(true);
    s.cancel();
    vi.advanceTimersByTime(1000);
    expect(rebuild).not.toHaveBeenCalled();
  });
});
