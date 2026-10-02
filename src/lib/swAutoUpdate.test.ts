import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMemoryHistory, createRouter, isNavigationFailure, NavigationFailureType } from "vue-router";
import { createReloadCoordinator, installNavigationReload } from "@/lib/swAutoUpdate";

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

describe("createReloadCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("never reloads a visible page and surfaces the manual fallback", async () => {
    const reload = vi.fn();
    const onDeferred = vi.fn();
    const c = createReloadCoordinator({ isBusy: () => false, onDeferred, reload });

    await c.requestReload();

    expect(reload).not.toHaveBeenCalled();
    expect(onDeferred).toHaveBeenCalledTimes(1);
  });

  it("reloads a hidden page at once", async () => {
    setVisibility("hidden");
    const reload = vi.fn();
    const onDeferred = vi.fn();
    const c = createReloadCoordinator({ isBusy: () => false, onDeferred, reload });

    await c.requestReload();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(onDeferred).not.toHaveBeenCalled();
  });

  it("reloads when a visible page is later backgrounded", async () => {
    const reload = vi.fn();
    const c = createReloadCoordinator({ isBusy: () => false, onDeferred: vi.fn(), reload });

    await c.requestReload();
    expect(reload).not.toHaveBeenCalled();

    setVisibility("hidden");
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload a visible page when the retry timer fires", async () => {
    const reload = vi.fn();
    const c = createReloadCoordinator({ isBusy: () => false, onDeferred: vi.fn(), reload });

    await c.requestReload();
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(reload).not.toHaveBeenCalled();
  });

  it("never reloads a backgrounded page while audio keeps it busy", async () => {
    const reload = vi.fn();
    const c = createReloadCoordinator({ isBusy: () => true, onDeferred: vi.fn(), reload });

    await c.requestReload();
    setVisibility("hidden");
    await flush();

    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload when the page becomes visible while isBusy is being answered", async () => {
    setVisibility("hidden");
    const reload = vi.fn();
    let answer!: (busy: boolean) => void;
    const isBusy = () => new Promise<boolean>((resolve) => (answer = resolve));
    const c = createReloadCoordinator({ isBusy, onDeferred: vi.fn(), reload });

    const requested = c.requestReload();
    await flush();
    setVisibility("visible"); // the user came back before isBusy answered
    answer(false);
    await requested;

    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads a hidden page once it stops being busy, on the retry timer", async () => {
    setVisibility("hidden");
    let busy = true;
    const reload = vi.fn();
    const onDeferred = vi.fn();
    const c = createReloadCoordinator({ isBusy: () => busy, onDeferred, reload });

    await c.requestReload();
    expect(reload).not.toHaveBeenCalled();
    expect(onDeferred).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(reload).not.toHaveBeenCalled();

    busy = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  describe("takeNavigationReload", () => {
    it("is true when a reload is pending and idle, and stands the coordinator down", async () => {
      const reload = vi.fn();
      const c = createReloadCoordinator({ isBusy: () => false, onDeferred: vi.fn(), reload });

      await c.requestReload();
      expect(await c.takeNavigationReload()).toBe(true);
      // It never reloads itself: the caller turns the navigation into a load.
      expect(reload).not.toHaveBeenCalled();

      // Neither the timer nor backgrounding reloads afterwards.
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      setVisibility("hidden");
      await flush();
      expect(reload).not.toHaveBeenCalled();
    });

    it("is false when nothing is pending", async () => {
      const c = createReloadCoordinator({ isBusy: () => false, onDeferred: vi.fn(), reload: vi.fn() });

      expect(await c.takeNavigationReload()).toBe(false);
    });

    it("is false while busy and leaves the reload pending", async () => {
      let busy = true;
      const reload = vi.fn();
      const c = createReloadCoordinator({ isBusy: () => busy, onDeferred: vi.fn(), reload });

      await c.requestReload();
      expect(await c.takeNavigationReload()).toBe(false);

      // Still pending: once idle it can be taken, and backgrounding still reloads.
      busy = false;
      expect(await c.takeNavigationReload()).toBe(true);
    });

    it("keeps the background reload armed after a busy refusal", async () => {
      const reload = vi.fn();
      const c = createReloadCoordinator({ isBusy: () => true, onDeferred: vi.fn(), reload });

      await c.requestReload();
      expect(await c.takeNavigationReload()).toBe(false);
      expect(await c.takeNavigationReload()).toBe(false);
      expect(reload).not.toHaveBeenCalled();
    });
  });
});

describe("installNavigationReload", () => {
  const Stub = { render: () => null };
  const makeRouter = () =>
    createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/dashboard", component: Stub },
        { path: "/play", component: Stub },
      ],
    });

  it("leaves navigation alone while no build is waiting", async () => {
    const router = makeRouter();
    const assign = vi.fn();
    const leaving = installNavigationReload(router, () => Promise.resolve(false), assign);

    await router.push("/dashboard");

    expect(router.currentRoute.value.path).toBe("/dashboard");
    expect(assign).not.toHaveBeenCalled();
    expect(leaving()).toBe(false);
  });

  it("turns the navigation into a full load of its destination", async () => {
    const router = makeRouter();
    const assign = vi.fn();
    let waiting = false;
    const leaving = installNavigationReload(router, () => Promise.resolve(waiting), assign);
    await router.push("/dashboard");

    waiting = true;
    const failure = await router.push("/play");

    expect(assign).toHaveBeenCalledWith("/play");
    expect(isNavigationFailure(failure, NavigationFailureType.aborted)).toBe(true);
    expect(router.currentRoute.value.path).toBe("/dashboard");
    expect(leaving()).toBe(true);
  });

  // DUNGEON-GRIMOIRE-G. The build arrives while the first navigation is inside
  // a later guard, and that guard's redirect is what this one then takes.
  it("reports it is leaving when it aborts the first navigation, which rejects isReady()", async () => {
    const router = makeRouter();
    const assign = vi.fn();
    let waiting = false;
    const leaving = installNavigationReload(router, () => Promise.resolve(waiting), assign);
    router.beforeEach((to) => {
      if (to.path !== "/dashboard") return true;
      waiting = true;
      return "/play";
    });

    void router.push("/dashboard");

    await expect(router.isReady()).rejects.toSatisfy((failure) =>
      isNavigationFailure(failure, NavigationFailureType.aborted),
    );
    expect(assign).toHaveBeenCalledWith("/play");
    expect(leaving()).toBe(true);
  });
});
