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
  let slowToo: ReturnType<typeof deferred>;
  let block = false;

  beforeEach(async () => {
    vi.useFakeTimers();
    slow = deferred();
    slowToo = deferred();
    block = false;
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: Stub },
        { path: "/slow", component: () => slow.promise },
        { path: "/slow-too", component: () => slowToo.promise },
        { path: "/fast", component: () => Promise.resolve(Stub) },
        {
          path: "/list",
          component: Stub,
          children: [{ path: ":id", component: Stub }, { path: "slow-child", component: () => slow.promise }],
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

  it("keeps the page it is on while a child of the same page loads", async () => {
    await router.push("/list");
    const nav = router.push("/list/slow-child");
    await vi.advanceTimersByTimeAsync(NAVIGATION_PENDING_DELAY_MS * 2);
    expect(navigationPending.value).toBe(false);
    slow.resolve();
    await nav;
  });

  it("does not arm for the first page of the session", async () => {
    uninstall();
    const first = createRouter({ history: createMemoryHistory(), routes: [{ path: "/slow", component: () => slow.promise }] });
    const off = installNavigationPending(first);
    const nav = first.push("/slow");
    await vi.advanceTimersByTimeAsync(NAVIGATION_PENDING_DELAY_MS * 2);
    expect(navigationPending.value).toBe(false);
    slow.resolve();
    await nav;
    off();
    uninstall = installNavigationPending(router);
  });

  it("measures the wait from the navigation that is current, not one it replaced", async () => {
    const first = router.push("/slow");
    await vi.advanceTimersByTimeAsync(NAVIGATION_PENDING_DELAY_MS / 2);
    const second = router.push("/slow-too");
    await vi.advanceTimersByTimeAsync(NAVIGATION_PENDING_DELAY_MS / 2);
    expect(navigationPending.value).toBe(false);
    slowToo.resolve();
    slow.resolve();
    await Promise.allSettled([first, second]);
  });

  it("stops watching once uninstalled", async () => {
    uninstall();
    const nav = router.push("/slow");
    await vi.advanceTimersByTimeAsync(NAVIGATION_PENDING_DELAY_MS * 2);
    expect(navigationPending.value).toBe(false);
    slow.resolve();
    await nav;
    uninstall = installNavigationPending(router);
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
