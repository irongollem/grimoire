import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Router } from "vue-router";
import { isChunkLoadError, installStaleChunkRecovery } from "@/lib/staleChunkRecovery";

// Captures the hooks installStaleChunkRecovery registers so tests can fire
// them directly, standing in for a real router.
function fakeRouter() {
  let errorHandler: ((error: unknown, to?: { fullPath: string }) => void) | undefined;
  let afterEachHandler: (() => void) | undefined;
  const router = {
    onError: (fn: typeof errorHandler) => { errorHandler = fn; },
    afterEach: (fn: typeof afterEachHandler) => { afterEachHandler = fn; },
  } as unknown as Router;
  return {
    router,
    failNavigation: (error: unknown, to?: { fullPath: string }) => errorHandler?.(error, to),
    completeNavigation: () => afterEachHandler?.(),
  };
}

// The three engines' dynamic-import failure messages, verbatim.
const CHROME = new TypeError("Failed to fetch dynamically imported module: https://x/assets/a-abc123.js");
const FIREFOX = new TypeError("error loading dynamically imported module: https://x/assets/a-abc123.js");
const SAFARI = new TypeError("Importing a module script failed.");

describe("isChunkLoadError", () => {
  it("matches every engine's dynamic-import failure", () => {
    expect(isChunkLoadError(CHROME)).toBe(true);
    expect(isChunkLoadError(FIREFOX)).toBe(true);
    expect(isChunkLoadError(SAFARI)).toBe(true);
  });

  it("rejects unrelated errors and non-Errors", () => {
    expect(isChunkLoadError(new Error("permission denied for table sounds"))).toBe(false);
    expect(isChunkLoadError("Failed to fetch dynamically imported module")).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("installStaleChunkRecovery", () => {
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
  });

  it("hard-navigates to the failed navigation's target", () => {
    const { router, failNavigation } = fakeRouter();
    const navigate = vi.fn();
    uninstall = installStaleChunkRecovery(router, navigate);

    failNavigation(CHROME, { fullPath: "/soundboard" });

    expect(navigate).toHaveBeenCalledExactlyOnceWith("/soundboard");
  });

  it("ignores errors that are not chunk-load failures", () => {
    const { router, failNavigation } = fakeRouter();
    const navigate = vi.fn();
    uninstall = installStaleChunkRecovery(router, navigate);

    failNavigation(new Error("row-level security violation"), { fullPath: "/soundboard" });

    expect(navigate).not.toHaveBeenCalled();
  });

  it("reloads only once until a navigation succeeds again", () => {
    const { router, failNavigation, completeNavigation } = fakeRouter();
    const navigate = vi.fn();
    uninstall = installStaleChunkRecovery(router, navigate);

    failNavigation(CHROME, { fullPath: "/soundboard" });
    failNavigation(CHROME, { fullPath: "/soundboard" });
    expect(navigate).toHaveBeenCalledTimes(1);

    // A successful navigation proves the build loads — the guard re-arms so
    // the NEXT deploy can recover too.
    completeNavigation();
    failNavigation(CHROME, { fullPath: "/quests" });
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenLastCalledWith("/quests");
  });

  it("recovers from vite:preloadError with a plain reload", () => {
    const { router } = fakeRouter();
    const navigate = vi.fn();
    uninstall = installStaleChunkRecovery(router, navigate);

    const event = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(event);

    expect(navigate).toHaveBeenCalledExactlyOnceWith(undefined);
    // preventDefault stops Vite from re-throwing at the import site.
    expect(event.defaultPrevented).toBe(true);
  });
});
