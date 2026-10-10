import { afterEach, describe, expect, it, vi } from "vitest";
import { reportAsync } from "./reportAsync";

describe("reportAsync", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rethrows a rejection from a timer instead of leaving it unhandled", async () => {
    vi.useFakeTimers();
    const failure = new Error("read failed");
    reportAsync(Promise.reject(failure));
    await Promise.resolve();
    await Promise.resolve();
    expect(() => vi.runAllTimers()).toThrow(failure);
  });

  it("does nothing when the read succeeds", async () => {
    vi.useFakeTimers();
    reportAsync(Promise.resolve(1));
    await Promise.resolve();
    await Promise.resolve();
    expect(() => vi.runAllTimers()).not.toThrow();
  });
});
