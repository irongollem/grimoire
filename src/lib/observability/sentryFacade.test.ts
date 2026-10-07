// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "vue";
import type { Router } from "vue-router";

const DSN = "https://abc123@o1.ingest.de.sentry.io/1";

const capture = vi.fn();
const setUser = vi.fn();
const startErrorTracking = vi.fn(() => ({ capture, setUser }));

type Facade = typeof import("./sentry");

/** A fresh module graph per test: the facade keeps its queue in module state. */
async function load(options: { clientFails?: boolean } = {}): Promise<Facade> {
  vi.resetModules();
  vi.stubEnv("VITE_SENTRY_DSN", DSN);
  if (options.clientFails) vi.doMock("./sentryClient", () => { throw new Error("chunk 404"); });
  else vi.doMock("./sentryClient", () => ({ startErrorTracking }));
  return import("./sentry");
}

function fakeRouter(): { router: Router; fail: (e: unknown) => void } {
  let handler: (e: unknown) => void = () => {};
  const router = { onError: (fn: (e: unknown) => void) => { handler = fn; } } as unknown as Router;
  return { router, fail: (e) => handler(e) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("sentry facade", () => {
  // Every test builds a fresh facade on the shared jsdom window, so listeners a
  // test never handed over would otherwise bleed into the next one.
  const added: [string, EventListener][] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const [type, fn] of added.splice(0)) window.removeEventListener(type, fn);
  });

  beforeEach(() => {
    const original = window.addEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
      added.push([type, fn as EventListener]);
      original(type, fn, opts);
    });
    capture.mockClear();
    setUser.mockClear();
    startErrorTracking.mockClear();
    vi.unstubAllEnvs();
  });

  it("is inert without a DSN", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SENTRY_DSN", "");
    const mod = await import("./sentry");
    const app = createApp({});
    mod.initErrorTracking(app, fakeRouter().router);
    expect(app.config.errorHandler).toBeUndefined();
    mod.reportHandledError(new Error("x"), "t");
    await flush();
    expect(startErrorTracking).not.toHaveBeenCalled();
  });

  it("does not load the client until paint or an error", async () => {
    const mod = await load();
    mod.initErrorTracking(createApp({}), fakeRouter().router);
    await flush();
    expect(startErrorTracking).not.toHaveBeenCalled();
  });

  it("loads after paint and applies the buffered user", async () => {
    const mod = await load();
    const app = createApp({});
    mod.initErrorTracking(app, fakeRouter().router);
    mod.setErrorTrackingUser("u1");
    mod.loadErrorTrackingAfterPaint();
    await vi.waitFor(() => expect(startErrorTracking).toHaveBeenCalledWith(app, DSN));
    expect(setUser).toHaveBeenCalledWith("u1");
    mod.setErrorTrackingUser(null);
    expect(setUser).toHaveBeenLastCalledWith(null);
  });

  it("loads on the first error and replays queued ones in order with their tags", async () => {
    const mod = await load();
    const { router, fail } = fakeRouter();
    mod.initErrorTracking(createApp({}), router);
    const a = new Error("a");
    const b = new Error("b");
    mod.reportHandledError(a, "where", { k: 1 });
    fail(b);
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    expect(capture.mock.calls[0]).toEqual([a, { tags: { handled_at: "where" }, extra: { k: 1 } }]);
    expect(capture.mock.calls[1]![0]).toBe(b);
    expect(startErrorTracking).toHaveBeenCalledOnce();
  });

  it("ignores stale-chunk router errors", async () => {
    const mod = await load();
    const { router, fail } = fakeRouter();
    mod.initErrorTracking(createApp({}), router);
    fail(new TypeError("Failed to fetch dynamically imported module: /assets/x.js"));
    await flush();
    expect(startErrorTracking).not.toHaveBeenCalled();
  });

  it("buffers window errors and rejections, and stops listening once the client owns them", async () => {
    const mod = await load();
    mod.initErrorTracking(createApp({}), fakeRouter().router);
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const boom = new Error("boom");
    window.dispatchEvent(new ErrorEvent("error", { error: boom, message: "boom" }));
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(1));
    expect(capture.mock.calls[0]![0]).toBe(boom);

    // The real SDK now owns these events; a second listener here would report twice.
    expect(removeSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("unhandledrejection", expect.any(Function));
  });

  it("does not wake the SDK for a ResizeObserver notice", async () => {
    const mod = await load();
    mod.initErrorTracking(createApp({}), fakeRouter().router);
    window.dispatchEvent(new ErrorEvent("error", { message: "ResizeObserver loop completed" }));
    await flush();
    expect(startErrorTracking).not.toHaveBeenCalled();
    mod.loadErrorTrackingAfterPaint();
    await vi.waitFor(() => expect(startErrorTracking).toHaveBeenCalled());
  });

  it("chains Vue's errorHandler while buffering and restores it on hand-over", async () => {
    const mod = await load();
    const app = createApp({});
    const original = vi.fn();
    app.config.errorHandler = original;
    mod.initErrorTracking(app, fakeRouter().router);
    const err = new Error("render");
    app.config.errorHandler!(err, null, "setup");
    expect(original).toHaveBeenCalledWith(err, null, "setup");
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(1));
    expect(app.config.errorHandler).toBe(original);
  });

  it("bounds the queue", async () => {
    const mod = await load();
    mod.initErrorTracking(createApp({}), fakeRouter().router);
    for (let i = 0; i < 80; i++) mod.reportHandledError(new Error(`e${i}`), "t");
    await vi.waitFor(() => expect(capture).toHaveBeenCalled());
    expect(capture).toHaveBeenCalledTimes(50);
  });

  it("swallows a failed client import and drops the queue", async () => {
    const mod = await load({ clientFails: true });
    const app = createApp({});
    mod.initErrorTracking(app, fakeRouter().router);
    mod.reportHandledError(new Error("lost"), "t");
    await flush();
    await flush();
    expect(capture).not.toHaveBeenCalled();
    // Later reports are dropped quietly rather than throwing.
    expect(() => mod.reportHandledError(new Error("later"), "t")).not.toThrow();
    expect(() => mod.setErrorTrackingUser("u")).not.toThrow();
  });
});
