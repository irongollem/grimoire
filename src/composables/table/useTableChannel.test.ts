import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import type { createRealtimeChannel } from "@/lib/campaignLiveSync/realtimeChannel";
import { MAX_POINTS, type TableSender } from "@/lib/table/messages";
import { MEASURE_THROTTLE_MS, MEASURE_TTL_MS, PING_MS, useTableChannel } from "./useTableChannel";

const ME: TableSender = { id: "u1", name: "Ayla", color: "#ff0000" };
const OTHER: TableSender = { id: "u2", name: "Bram", color: "#00ff00" };

// Channels with no network, one per topic: they record sends and let a test deliver a broadcast on a topic.
function fakeChannel() {
  const sent: unknown[] = [];
  const sentOn = new Map<string, unknown[]>();
  const listeners = new Map<string, (m: { payload: unknown }) => void>();
  const statuses: ((s: string) => void)[] = [];
  const topics: string[] = [];
  const stop = vi.fn();
  const create: typeof createRealtimeChannel = (o) => {
    topics.push(o.topic);
    if (o.onStatus) statuses.push(o.onStatus);
    const ch = {
      on: (_t: string, _f: unknown, cb: (m: { payload: unknown }) => void) => { listeners.set(o.topic, cb); return ch; },
      send: (m: unknown) => {
        sent.push(m);
        sentOn.set(o.topic, [...(sentOn.get(o.topic) ?? []), m]);
      },
    };
    o.bind(ch as never);
    return { reconcile: () => undefined, stop };
  };
  /** Deliver as the app's traffic arrives: a ping on the shared topic, every other mark on the DM's. */
  const deliver = (payload: unknown) => {
    const event = typeof payload === "object" && payload !== null ? (payload as { event?: unknown }).event : null;
    const topic = topics.find((t) => (event === "ping" ? t.startsWith("table:") : t.startsWith("table-dm:")));
    if (topic) listeners.get(topic)?.({ payload });
  };
  return {
    create, sent, stop, deliver,
    deliverOn: (topic: string, payload: unknown) => listeners.get(topic)?.({ payload }),
    sentOn: (topic: string) => sentOn.get(topic) ?? [],
    status: (s: string) => statuses.forEach((f) => f(s)),
    topics: () => topics,
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

  it("joins the table topic and the DM's table topic, not the doorbell", () => {
    const { f } = setup("c1");
    expect(f.topics()).toEqual(["table:c1", "table-dm:c1"]); // #1125 decision 12, #1133 review
  });

  // #1133 review: any member may send on the shared topic, so a player's console could clear the DM's pinned
  // drawings or draw in the DM's name. Only a ping is taken from it.
  it("takes nothing but a ping from the shared topic", () => {
    const { f, t } = setup("c1");
    f.deliver({ event: "draw", id: "d", points: [[0, 0], [1, 1]], color: "#fff", width: 2, by: OTHER, pinned: true, at: 1 });
    expect(t.drawings.value).toHaveLength(1);
    f.deliverOn("table:c1", { event: "draw-clear", all: true });
    f.deliverOn("table:c1", { event: "draw", id: "x", points: [[0, 0], [1, 1]], color: "#fff", width: 2, by: OTHER, pinned: false, at: 1 });
    f.deliverOn("table:c1", { event: "measure", id: "m", points: [[0, 0], [1, 1]], by: OTHER, at: 1 });
    expect(t.drawings.value.map((d) => d.id)).toEqual(["d"]);
    expect(t.measures.value).toEqual([]);
    f.deliverOn("table:c1", { event: "ping", x: 1, y: 1, by: OTHER, at: 1 });
    expect(t.pings.value).toHaveLength(1);
  });

  it("sends a ping on the shared topic and a drawing on the DM's", () => {
    const { f, t } = setup("c1");
    t.sendPing(1, 2);
    t.draw({ id: "d", points: [[0, 0], [1, 1]], color: "#fff", width: 2, pinned: false });
    expect(f.sentOn("table:c1")).toHaveLength(1);
    expect(f.sentOn("table-dm:c1")).toHaveLength(1);
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
    expect(f.stop).toHaveBeenCalledTimes(2); // both topics
    expect(t.pings.value).toEqual([]);
    expect(t.connected.value).toBe(false);
  });

  it("opens no channel without a campaign", () => {
    const { f } = setup(null);
    expect(f.topics()).toEqual([]);
  });
});
