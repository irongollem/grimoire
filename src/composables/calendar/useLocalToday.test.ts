import { afterEach, describe, it, expect, vi } from "vitest";
import { effectScope } from "vue";
import { localDateString, useLocalToday } from "./useLocalToday";

describe("localDateString", () => {
  it("formats the LOCAL calendar date, zero-padded", () => {
    // Construct via local-time parts so the expectation holds in any TZ.
    expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(localDateString(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("useLocalToday", () => {
  afterEach(() => vi.useRealTimers());

  it("moves to the next day when a long-lived screen passes local midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 5, 23, 59, 30));
    const scope = effectScope();
    const today = scope.run(() => useLocalToday())!;
    expect(today.value).toBe("2026-08-05");
    vi.advanceTimersByTime(60_000);
    expect(today.value).toBe("2026-08-06");
    scope.stop();
  });
});
