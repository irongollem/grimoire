import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import {
  NAVIGATION_PENDING_DELAY_MS,
  installNavigationPending,
  navigationPending,
} from "./navigationPending";

const Stub = { render: () => null };

/** A lazy component that resolves only when the test says so. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<typeof Stub>((res, rej) => {
    resolve = () => res(Stub);
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("installNavigationPending", () => {
  let router: Router;
  let uninstall: () => void;
  let slow: ReturnType<typeof deferred>;
  let block = false;

  beforeEach(async () => {
    vi.useFakeTimers();
    slow = deferred();
    block = false;
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: Stub },
        { path: "/slow", component: () => slow.promise },
        { path: "/fast", component: () => Promise.resolve(Stub) },
        {
          path: "/list",
          component: Stub,
          children: [{ path: ":id", component: Stub }],
        },
        { path: "/other-layout", component: () => slow.promise, meta: { layout: "player" } },
      ],
    });
    router.beforeEach(() => !block);
    uninstall = installNavigationPending(router);
    await router.push("/");
  });

  afterEach(() => {
    uninstall();
    vi.useRealTimers();
  });

  it("shows only after the delay, for a slow lazy component", async () => {
    const nav = router.push("/slow");
    await vi.advanceTimersByTimeAsync(NAVIGATION_PENDING_DELAY_MS - 1);
    expect(navigationPending.value).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(navigationPending.value).toBe(true);
    slow.resolve();
    await nav;
    expect(navigationPending.value).toBe(false);
  });

  it("never shows for a fast navigation", async () => {
    await router.push("/fast");
    await vi.advanceTimersByTimeAsync(NAVIGATION_PENDING_DELAY_MS * 2);
    expect(navigationPending.value).toBe(false);
  });

  it("does not arm for a child route or a query-only change", async () => {
    await router.push("/list");
    const child = router.push("/list/abc");
    await vi.advanceTimersByTimeAsync(NAVIGATION_PENDING_DELAY_MS * 2);
    expect(navigationPending.value).toBe(false);
    await child;
    await router.push("/list/abc?x=1");
    await vi.advanceTimersByTimeAsync(NAVIGATION_PENDING_DELAY_MS * 2);
    expect(navigationPending.value).toBe(false);
  });

  it("does not arm across a layout change", async () => {
    const nav = router.push("/other-layout");
    await vi.advanceTimersByTimeAsync(NAVIGATION_PENDING_DELAY_MS * 2);
    expect(navigationPending.value).toBe(false);
    slow.resolve();
    await nav;
  });

  it("clears when the navigation is aborted by a later guard", async () => {
    const nav = router.push("/slow");
    await vi.advanceTimersByTimeAsync(NAVIGATION_PENDING_DELAY_MS);
    expect(navigationPending.value).toBe(true);
    // A newer navigation supersedes the pending one and cancels it.
    const next = router.push("/fast");
    await next;
    expect(navigationPending.value).toBe(false);
    slow.resolve();
    await nav;
    expect(navigationPending.value).toBe(false);
  });

  it("clears when a guard refuses the navigation", async () => {
    block = true;
    await router.push("/slow");
    await vi.advanceTimersByTimeAsync(NAVIGATION_PENDING_DELAY_MS * 2);
    expect(navigationPending.value).toBe(false);
  });

  it("clears when the component import rejects", async () => {
    const onError = vi.fn();
    router.onError(onError);
    const nav = router.push("/slow");
    await vi.advanceTimersByTimeAsync(NAVIGATION_PENDING_DELAY_MS);
    expect(navigationPending.value).toBe(true);
    slow.reject(new Error("Failed to fetch dynamically imported module"));
    await nav.catch(() => undefined);
    expect(onError).toHaveBeenCalled();
    expect(navigationPending.value).toBe(false);
  });
});
