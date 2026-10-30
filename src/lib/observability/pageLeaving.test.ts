// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { UNLOAD_GRACE_MS, isLeavingPage, watchPageLeaving } from "./pageLeaving";

beforeAll(() => watchPageLeaving());

afterEach(() => {
  window.dispatchEvent(new Event("pageshow"));
  vi.useRealTimers();
});

describe("isLeavingPage", () => {
  // DUNGEON-GRIMOIRE-W / -X: Chrome rejected the background index's requests
  // after a reload began but before pagehide, and the rejection was reported.
  it("is leaving from beforeunload, before pagehide has fired", () => {
    window.dispatchEvent(new Event("beforeunload"));
    expect(isLeavingPage()).toBe(true);
  });

  it("stops counting a beforeunload as leaving once the page has stayed past the grace period", () => {
    vi.useFakeTimers();
    window.dispatchEvent(new Event("beforeunload"));
    vi.advanceTimersByTime(UNLOAD_GRACE_MS - 1);
    expect(isLeavingPage()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isLeavingPage()).toBe(false);
  });

  it("stays leaving after pagehide even when the beforeunload grace period runs out", () => {
    vi.useFakeTimers();
    window.dispatchEvent(new Event("beforeunload"));
    window.dispatchEvent(new Event("pagehide"));
    vi.advanceTimersByTime(UNLOAD_GRACE_MS);
    expect(isLeavingPage()).toBe(true);
  });

  it("is live again when the page comes back from the back-forward cache", () => {
    window.dispatchEvent(new Event("beforeunload"));
    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("pageshow"));
    expect(isLeavingPage()).toBe(false);
  });
});
