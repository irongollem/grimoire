import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isTextEntryActive, createReloadCoordinator } from "./swAutoUpdate";

// jsdom's document, with controllable visibility.
function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

// Flushes the microtasks the coordinator's async attempt() chain queues.
// Timer-based (not a bare Promise chain) so it works under fake timers.
const flush = () => vi.advanceTimersByTimeAsync(0);

describe("isTextEntryActive", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is true for a focused text input and textarea", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    expect(isTextEntryActive(document)).toBe(true);

    const area = document.createElement("textarea");
    document.body.appendChild(area);
    area.focus();
    expect(isTextEntryActive(document)).toBe(true);
  });

  it("is false for focus that cannot lose typed text", () => {
    expect(isTextEntryActive(document)).toBe(false); // body focus

    const button = document.createElement("input");
    button.type = "checkbox";
    document.body.appendChild(button);
    button.focus();
    expect(isTextEntryActive(document)).toBe(false);
  });
});

describe("createReloadCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("reloads immediately when nothing is interrupted", async () => {
    const reload = vi.fn();
    const onDeferred = vi.fn();
    const c = createReloadCoordinator({ isBusy: () => false, onDeferred, reload });

    await c.requestReload();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(onDeferred).not.toHaveBeenCalled();
  });

  it("defers while busy, surfaces the manual fallback, and retries on a timer", async () => {
    let busy = true;
    const reload = vi.fn();
    const onDeferred = vi.fn();
    const c = createReloadCoordinator({ isBusy: () => busy, onDeferred, reload });

    await c.requestReload();
    expect(reload).not.toHaveBeenCalled();
    expect(onDeferred).toHaveBeenCalledTimes(1);

    // Still busy on the first retry tick.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reload).not.toHaveBeenCalled();

    // Audio stopped — the next tick catches up.
    busy = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("defers while typing, then reloads on backgrounding (focus left behind is not typing)", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const reload = vi.fn();
    const c = createReloadCoordinator({ isBusy: () => false, onDeferred: vi.fn(), reload });

    await c.requestReload();
    expect(reload).not.toHaveBeenCalled();

    setVisibility("hidden");
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("never reloads a backgrounded page while audio keeps it busy", async () => {
    const reload = vi.fn();
    const c = createReloadCoordinator({ isBusy: () => true, onDeferred: vi.fn(), reload });

    await c.requestReload();
    setVisibility("hidden");
    await flush();

    expect(reload).not.toHaveBeenCalled();
  });
});
