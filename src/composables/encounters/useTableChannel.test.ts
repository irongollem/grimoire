import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import type { createRealtimeChannel } from "@/lib/campaignLiveSync/realtimeChannel";
import { MAX_POINTS, type TableSender } from "@/lib/tableChannel/messages";
import { MEASURE_THROTTLE_MS, MEASURE_TTL_MS, PING_MS, useTableChannel } from "./useTableChannel";

const ME: TableSender = { id: "u1", name: "Ayla", color: "#ff0000" };
const OTHER: TableSender = { id: "u2", name: "Bram", color: "#00ff00" };

// A channel with no network: records sends and lets a test deliver a broadcast.
function fakeChannel() {
  const sent: unknown[] = [];
  let listener: ((m: { payload: unknown }) => void) | null = null;
  const stop = vi.fn();
  let options: Parameters<typeof createRealtimeChannel>[0] | null = null;
  const create: typeof createRealtimeChannel = (o) => {
    options = o;
    const ch = {
      on: (_t: string, _f: unknown, cb: (m: { payload: unknown }) => void) => { listener = cb; return ch; },
      send: (m: unknown) => { sent.push(m); },
    };
    o.bind(ch as never);
    return { reconcile: () => undefined, stop };
  };
  return {
    create, sent, stop,
    deliver: (payload: unknown) => listener?.({ payload }),
    status: (s: string) => options?.onStatus?.(s),
    topic: () => options?.topic,
  };
}

function setup(id: string | null = "c1") {
  const f = fakeChannel();
  const scope = effectScope();
  const t = scope.run(() => useTableChannel(id, { identity: ME, createChannel: f.create }));
  if (!t) throw new Error("scope");
  f.status("SUBSCRIBED");
  return { f, t, scope };
}

describe("useTableChannel", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("joins the table topic, not the doorbell", () => {
    const { f } = setup("c1");
    expect(f.topic()).toBe("table:c1"); // #1125 decision 12
  });

  it("drops a malformed payload from another client instead of showing it", () => {
    const { f, t } = setup();
    f.deliver({ event: "ping", x: Number.NaN, y: 1, by: OTHER, at: 1 });
    f.deliver({ event: "ping", x: 1, y: 1, at: 1 });
    f.deliver("junk");
    expect(t.pings.value).toEqual([]);
  });

  it("drops a stroke with more points than the cap", () => {
    const { f, t } = setup();
    const points = Array.from({ length: MAX_POINTS + 1 }, (_, i) => [i, i]);
    f.deliver({ event: "draw", id: "d", points, color: "#fff", width: 2, by: OTHER, pinned: false, at: 1 });
    expect(t.drawings.value).toEqual([]);
  });

  it("shows a ping from another client and removes it after it fades", () => {
    const { f, t } = setup();
    f.deliver({ event: "ping", x: 3, y: 4, by: OTHER, at: 1 });
    expect(t.pings.value).toHaveLength(1);
    vi.advanceTimersByTime(PING_MS - 1);
    expect(t.pings.value).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(t.pings.value).toEqual([]);
  });

  it("shows own ping once and sends it once", () => {
    const { f, t } = setup();
    t.sendPing(1, 2);
    expect(t.pings.value).toHaveLength(1);
    expect(f.sent).toHaveLength(1);
  });

  it("clears a measure on its clear event", () => {
    const { f, t } = setup();
    f.deliver({ event: "measure", id: "m", points: [[0, 0], [1, 1]], by: OTHER, at: 1 });
    expect(t.measures.value).toHaveLength(1);
    f.deliver({ event: "measure-clear", id: "m" });
    expect(t.measures.value).toEqual([]);
  });

  it("removes a measure whose sender dropped, measured from its last update", () => {
    const { f, t } = setup();
    const m = { event: "measure", id: "m", points: [[0, 0], [1, 1]], by: OTHER, at: 1 };
    f.deliver(m);
    vi.advanceTimersByTime(MEASURE_TTL_MS - 1);
    f.deliver(m); // a fresh update restarts the clock
    vi.advanceTimersByTime(MEASURE_TTL_MS - 1);
    expect(t.measures.value).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(t.measures.value).toEqual([]);
  });

  it("throttles measure updates to one send per window and sends the newest last", () => {
    const { f, t } = setup();
    t.startMeasure("m", [[0, 0], [1, 1]]);
    t.updateMeasure("m", [[0, 0], [2, 2]]);
    t.updateMeasure("m", [[0, 0], [3, 3]]);
    expect(f.sent).toHaveLength(1);
    vi.advanceTimersByTime(MEASURE_THROTTLE_MS);
    expect(f.sent).toHaveLength(2);
    const last = f.sent[1] as { payload: { points: number[][] } };
    expect(last.payload.points[1]).toEqual([3, 3]);
  });

  it("endMeasure cancels a pending update so a cleared line is not resurrected", () => {
    const { f, t } = setup();
    t.startMeasure("m", [[0, 0], [1, 1]]);
    t.updateMeasure("m", [[0, 0], [2, 2]]);
    t.endMeasure("m");
    vi.advanceTimersByTime(MEASURE_THROTTLE_MS * 2);
    expect(t.measures.value).toEqual([]);
    expect(f.sent.map((s) => (s as { payload: { event: string } }).payload.event)).toEqual(["measure", "measure-clear"]);
  });

  it("clearUnpinned keeps pinned strokes and drops the rest, without sending", () => {
    const { f, t } = setup();
    const base = { points: [[0, 0], [1, 1]] as [number, number][], color: "#fff", width: 2 };
    t.draw({ id: "a", pinned: true, ...base });
    t.draw({ id: "b", pinned: false, ...base });
    const sentBefore = f.sent.length;
    t.clearUnpinned();
    expect(t.drawings.value.map((d) => d.id)).toEqual(["a"]);
    expect(f.sent).toHaveLength(sentBefore);
  });

  it("clearAll empties drawings and clearDrawing removes one", () => {
    const { f, t } = setup();
    f.deliver({ event: "draw", id: "a", points: [[0, 0]], color: "#fff", width: 2, by: OTHER, pinned: false, at: 1 });
    f.deliver({ event: "draw", id: "b", points: [[0, 0]], color: "#fff", width: 2, by: OTHER, pinned: false, at: 1 });
    f.deliver({ event: "draw-clear", id: "a" });
    expect(t.drawings.value.map((d) => d.id)).toEqual(["b"]);
    f.deliver({ event: "draw-clear", all: true });
    expect(t.drawings.value).toEqual([]);
  });

  it("does not send before the channel has joined, but still shows the mark", () => {
    const f = fakeChannel();
    const scope = effectScope();
    const t = scope.run(() => useTableChannel("c1", { identity: ME, createChannel: f.create }));
    t?.sendPing(1, 1);
    expect(t?.pings.value).toHaveLength(1);
    expect(f.sent).toEqual([]);
  });

  it("sends nothing and shows nothing without an identity", () => {
    const f = fakeChannel();
    const scope = effectScope();
    const t = scope.run(() => useTableChannel("c1", { identity: null, createChannel: f.create }));
    f.status("SUBSCRIBED");
    t?.sendPing(1, 1);
    expect(t?.pings.value).toEqual([]);
    expect(f.sent).toEqual([]);
  });

  it("leaves the channel and cancels timers when its scope is disposed", () => {
    const { f, t, scope } = setup();
    t.sendPing(1, 1);
    scope.stop();
    expect(f.stop).toHaveBeenCalledTimes(1);
    expect(t.pings.value).toEqual([]);
    expect(t.connected.value).toBe(false);
  });

  it("opens no channel without a campaign", () => {
    const { f } = setup(null);
    expect(f.topic()).toBeUndefined();
  });
});
