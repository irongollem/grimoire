import { describe, it, expect, vi, afterEach } from "vitest";

import { createRealtimeHeal, type RealtimeHeal } from "@/lib/realtimeHeal";

/**
 * A controllable clock, so throttle and hidden-duration behaviour can be tested
 * without waiting out real timeouts.
 */
function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => { t += ms; },
  };
}

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

const attached: RealtimeHeal[] = [];
function track(heal: RealtimeHeal): RealtimeHeal {
  attached.push(heal);
  return heal;
}

afterEach(() => {
  while (attached.length) attached.pop()!.detach();
  setVisibility("visible");
});

describe("createRealtimeHeal — subscribe status", () => {
  it("does not reconcile on the initial join", () => {
    const onReconcile = vi.fn();
    const heal = track(createRealtimeHeal(onReconcile));

    heal.onStatus("SUBSCRIBED");

    // The caller's own initial fetch covers the first join.
    expect(onReconcile).not.toHaveBeenCalled();
  });

  it("reconciles on a rejoin", () => {
    const c = clock();
    const onReconcile = vi.fn();
    const heal = track(createRealtimeHeal(onReconcile, { now: c.now }));

    heal.onStatus("SUBSCRIBED");
    c.advance(10_000);
    heal.onStatus("SUBSCRIBED");

    expect(onReconcile).toHaveBeenCalledTimes(1);
  });

  it("reconciles after an error followed by a rejoin", () => {
    const c = clock();
    const onReconcile = vi.fn();
    const heal = track(createRealtimeHeal(onReconcile, { now: c.now }));

    heal.onStatus("SUBSCRIBED");
    heal.onStatus("CHANNEL_ERROR");
    c.advance(10_000);
    heal.onStatus("SUBSCRIBED");

    expect(onReconcile).toHaveBeenCalledTimes(1);
  });

  it("ignores statuses that are neither a drop nor a join", () => {
    const onReconcile = vi.fn();
    const heal = track(createRealtimeHeal(onReconcile));

    heal.onStatus("JOINING");

    expect(onReconcile).not.toHaveBeenCalled();
  });
});

describe("createRealtimeHeal — throttling", () => {
  it("collapses overlapping wake signals into one reconcile", () => {
    const c = clock();
    const onReconcile = vi.fn();
    const heal = track(createRealtimeHeal(onReconcile, { now: c.now }));

    // A real wake fires online + visibilitychange + re-SUBSCRIBED together.
    heal.reconcile();
    heal.reconcile();
    heal.reconcile();

    expect(onReconcile).toHaveBeenCalledTimes(1);
  });

  it("allows a further reconcile once the throttle window passes", () => {
    const c = clock();
    const onReconcile = vi.fn();
    const heal = track(createRealtimeHeal(onReconcile, { now: c.now, throttleMs: 2000 }));

    heal.reconcile();
    c.advance(2000);
    heal.reconcile();

    expect(onReconcile).toHaveBeenCalledTimes(2);
  });
});

describe("createRealtimeHeal — network and visibility", () => {
  it("reconciles unconditionally when the network returns", () => {
    const onReconcile = vi.fn();
    track(createRealtimeHeal(onReconcile));

    window.dispatchEvent(new Event("online"));

    expect(onReconcile).toHaveBeenCalledTimes(1);
  });

  it("does not reconcile on routine alt-tabbing", () => {
    const c = clock();
    const onReconcile = vi.fn();
    track(createRealtimeHeal(onReconcile, { now: c.now }));

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    c.advance(5_000);
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    // No drop reported and away only briefly — nothing was missed.
    expect(onReconcile).not.toHaveBeenCalled();
  });

  it("reconciles on return when the channel dropped while away", () => {
    const c = clock();
    const onReconcile = vi.fn();
    const heal = track(createRealtimeHeal(onReconcile, { now: c.now }));

    heal.onStatus("SUBSCRIBED");
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    heal.onStatus("TIMED_OUT");
    c.advance(5_000);
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(onReconcile).toHaveBeenCalledTimes(1);
  });

  it("reconciles on return after a long enough background stint", () => {
    const c = clock();
    const onReconcile = vi.fn();
    track(createRealtimeHeal(onReconcile, { now: c.now, hiddenReconcileMs: 5 * 60 * 1000 }));

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    // Long enough that the browser could have frozen the socket silently.
    c.advance(6 * 60 * 1000);
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(onReconcile).toHaveBeenCalledTimes(1);
  });

  it("clears the drop flag after reconciling, so the next alt-tab is quiet", () => {
    const c = clock();
    const onReconcile = vi.fn();
    const heal = track(createRealtimeHeal(onReconcile, { now: c.now }));

    heal.onStatus("SUBSCRIBED");
    heal.onStatus("CHANNEL_ERROR");
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    c.advance(1_000);
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(onReconcile).toHaveBeenCalledTimes(1);

    // Second short alt-tab, no new drop: must stay quiet.
    c.advance(10_000);
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    c.advance(1_000);
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(onReconcile).toHaveBeenCalledTimes(1);
  });
});

describe("createRealtimeHeal — detach", () => {
  it("stops responding to wake signals once detached", () => {
    const onReconcile = vi.fn();
    const heal = createRealtimeHeal(onReconcile);

    heal.detach();
    window.dispatchEvent(new Event("online"));

    expect(onReconcile).not.toHaveBeenCalled();
  });

  it("makes late status callbacks and manual reconciles inert", () => {
    const c = clock();
    const onReconcile = vi.fn();
    const heal = createRealtimeHeal(onReconcile, { now: c.now });

    heal.onStatus("SUBSCRIBED");
    heal.detach();
    c.advance(10_000);
    heal.onStatus("CLOSED");
    heal.onStatus("SUBSCRIBED");
    heal.reconcile();

    expect(onReconcile).not.toHaveBeenCalled();
  });

  it("is safe to detach twice", () => {
    const heal = createRealtimeHeal(vi.fn());

    heal.detach();
    expect(() => heal.detach()).not.toThrow();
  });
});
