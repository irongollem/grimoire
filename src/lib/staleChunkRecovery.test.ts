import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Router } from "vue-router";
import { isChunkLoadError, isStaleChunkError, installStaleChunkRecovery } from "@/lib/staleChunkRecovery";

// Captures the hooks installStaleChunkRecovery registers so tests can fire
// them directly, standing in for a real router.
function fakeRouter() {
  let errorHandler: ((error: unknown, to?: { fullPath: string }) => void) | undefined;
  let afterEachHandler: (() => void) | undefined;
  let beforeEachHandler: ((to: { fullPath: string }) => void) | undefined;
  const router = {
    onError: (fn: typeof errorHandler) => { errorHandler = fn; },
    afterEach: (fn: typeof afterEachHandler) => { afterEachHandler = fn; },
    beforeEach: (fn: typeof beforeEachHandler) => { beforeEachHandler = fn; },
  } as unknown as Router;
  return {
    router,
    startNavigation: (fullPath: string) => beforeEachHandler?.({ fullPath }),
    failNavigation: (error: unknown, to?: { fullPath: string }) => errorHandler?.(error, to),
    completeNavigation: () => afterEachHandler?.(),
  };
}

/** What Vite's `__vitePreload` does to a failed import once we preventDefault. */
function firePreloadError(): Event {
  const event = new Event("vite:preloadError", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

// The three engines' dynamic-import failure messages, verbatim.
const CHROME = new TypeError("Failed to fetch dynamically imported module: https://x/assets/a-abc123.js");
const FIREFOX = new TypeError("error loading dynamically imported module: https://x/assets/a-abc123.js");
const SAFARI = new TypeError("Importing a module script failed.");

// What vue-router throws once __vitePreload has swallowed the error above and
// the route's import() resolved to undefined. Verbatim from DUNGEON-GRIMOIRE-3.
const SWALLOWED = new Error('Couldn\'t resolve component "default" at "/admin"');

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

    const event = firePreloadError();

    // No navigation in flight — a lazy dialog import, say — so there is no
    // target to land on and a reload of the current page is the whole fix.
    expect(navigate).toHaveBeenCalledExactlyOnceWith(undefined);
    // preventDefault stops Vite from re-throwing at the import site.
    expect(event.defaultPrevented).toBe(true);
  });

  it("lands the preload recovery on the route the user asked for", () => {
    const { router, startNavigation } = fakeRouter();
    const navigate = vi.fn();
    uninstall = installStaleChunkRecovery(router, navigate);

    startNavigation("/admin");
    firePreloadError();

    expect(navigate).toHaveBeenCalledExactlyOnceWith("/admin");
  });

  it("forgets the target once a navigation completes", () => {
    const { router, startNavigation, completeNavigation } = fakeRouter();
    const navigate = vi.fn();
    uninstall = installStaleChunkRecovery(router, navigate);

    startNavigation("/admin");
    completeNavigation();
    firePreloadError();

    expect(navigate).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it("recovers from the error vue-router throws after Vite swallowed the failure", () => {
    const { router, failNavigation } = fakeRouter();
    const navigate = vi.fn();
    uninstall = installStaleChunkRecovery(router, navigate);

    firePreloadError();
    // The preload listener already reloaded; re-arm to prove the router path
    // recognises the swallowed form on its own.
    sessionStorage.clear();
    navigate.mockClear();

    failNavigation(SWALLOWED, { fullPath: "/admin" });

    expect(navigate).toHaveBeenCalledExactlyOnceWith("/admin");
  });
});

describe("isStaleChunkError", () => {
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
  });

  it("matches the engines' messages without any preload failure", () => {
    uninstall = installStaleChunkRecovery(fakeRouter().router, vi.fn());
    expect(isStaleChunkError(CHROME)).toBe(true);
  });

  it("only claims vue-router's message once Vite has reported a preload failure", () => {
    uninstall = installStaleChunkRecovery(fakeRouter().router, vi.fn());

    // A loader that genuinely resolves to nothing is a route misconfiguration
    // and must keep reporting.
    expect(isStaleChunkError(SWALLOWED)).toBe(false);

    firePreloadError();
    expect(isStaleChunkError(SWALLOWED)).toBe(true);
  });

  it("rejects unrelated errors even after a preload failure", () => {
    uninstall = installStaleChunkRecovery(fakeRouter().router, vi.fn());
    firePreloadError();

    expect(isStaleChunkError(new Error("permission denied for table sounds"))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});
