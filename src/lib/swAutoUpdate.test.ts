// @vitest-environment happy-dom
import { afterEach, describe, it, expect, vi } from "vitest";
import { createMemoryHistory, createRouter, isNavigationFailure, NavigationFailureType } from "vue-router";
import { createReloadCoordinator, installNavigationReload, untilNewestWorkerControls } from "@/lib/swAutoUpdate";

describe("createReloadCoordinator", () => {
  it("never reloads by itself and surfaces the manual fallback", () => {
    const onDeferred = vi.fn();
    const c = createReloadCoordinator({ isBusy: () => false, onDeferred });

    c.requestReload();

    expect(onDeferred).toHaveBeenCalledTimes(1);
  });

  // The page used to reload as soon as it was backgrounded. On iOS that ran the
  // boot into the app's suspension: a token refresh that never answered left the
  // app stuck on its splash, or signed out on the next start. A backgrounded page
  // now simply keeps the build waiting for the next navigation.
  it("keeps a build waiting while the page is backgrounded", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    const c = createReloadCoordinator({ isBusy: () => false, onDeferred: vi.fn() });

    c.requestReload();
    document.dispatchEvent(new Event("visibilitychange"));

    expect(await c.takeNavigationReload()).toBe(true);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  describe("takeNavigationReload", () => {
    it("is true when a reload is pending and idle, and stands the coordinator down", async () => {
      const c = createReloadCoordinator({ isBusy: () => false, onDeferred: vi.fn() });

      c.requestReload();
      expect(await c.takeNavigationReload()).toBe(true);
      expect(await c.takeNavigationReload()).toBe(false);
    });

    it("is false when nothing is pending", async () => {
      const c = createReloadCoordinator({ isBusy: () => false, onDeferred: vi.fn() });

      expect(await c.takeNavigationReload()).toBe(false);
    });

    it("is false while busy and leaves the reload pending", async () => {
      let busy = true;
      const c = createReloadCoordinator({ isBusy: () => busy, onDeferred: vi.fn() });

      c.requestReload();
      expect(await c.takeNavigationReload()).toBe(false);

      busy = false;
      expect(await c.takeNavigationReload()).toBe(true);
    });

    it("hands the reload to one navigation only when two ask at once", async () => {
      let answer!: (busy: boolean) => void;
      const isBusy = () => new Promise<boolean>((resolve) => (answer = resolve));
      const c = createReloadCoordinator({ isBusy, onDeferred: vi.fn() });
      c.requestReload();

      const first = c.takeNavigationReload();
      const release = answer;
      const second = c.takeNavigationReload();
      release(false);
      answer(false);

      expect([await first, await second].filter(Boolean)).toHaveLength(1);
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

describe("untilNewestWorkerControls", () => {
  /** A stand-in navigator.serviceWorker whose update() may find a new worker. */
  function fakeServiceWorker(found: "installing" | "none") {
    const target = new EventTarget();
    const registration = {
      installing: null as object | null,
      waiting: null,
      update: vi.fn(async () => {
        if (found === "installing") registration.installing = {};
      }),
    };
    const sw = Object.assign(target, { getRegistration: async () => registration });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: sw });
    return { registration, takeControl: () => target.dispatchEvent(new Event("controllerchange")) };
  }

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("resolves at once when no newer deploy is on its way", async () => {
    const { registration } = fakeServiceWorker("none");
    await untilNewestWorkerControls(60_000);
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  // The splash hang: a reload sent while the new worker was still installing
  // was answered by the old worker's shell and booted the old build again.
  it("holds the reload until the new worker takes control", async () => {
    const { takeControl } = fakeServiceWorker("installing");
    let settled = false;
    const done = untilNewestWorkerControls(60_000).then(() => (settled = true));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    takeControl();
    await done;
    expect(settled).toBe(true);
  });

  it("gives up waiting after the timeout rather than holding the page", async () => {
    vi.useFakeTimers();
    fakeServiceWorker("installing");
    const done = untilNewestWorkerControls(5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(done).resolves.toBeUndefined();
  });
});
