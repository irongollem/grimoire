// The live table: pings, measure lines and drawings shared over `table:<campaign id>` (#1125 decision 12).
//
// Own sends are echoed locally rather than by Realtime's `broadcast.self`: `createRealtimeChannel` owns channel
// creation and does not pass that config, and a local append also shows the sender their own mark at once, even
// while the channel is still joining. Realtime does not echo to the sender by default, so a mark appears once.
import { onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from "vue";
import {
  createRealtimeChannel,
  type RealtimeChannelHandle,
} from "@/lib/campaignLiveSync/realtimeChannel";
import {
  TABLE_BROADCAST_EVENT,
  parseTableMessage,
  tableTopic,
  type Point,
  type TableMessage,
  type TableSender,
} from "@/lib/tableChannel/messages";

export const PING_MS = 2500;
/** A measure line nobody has updated for this long is gone, so a dropped client cannot leave one forever. */
export const MEASURE_TTL_MS = 10_000;
/** Measure updates go out at most this often (~10 a second). */
export const MEASURE_THROTTLE_MS = 100;
const MAX_DRAWINGS = 200;

export interface TablePing { id: number; x: number; y: number; by: TableSender }
export interface TableMeasure { id: string; points: Point[]; by: TableSender }
export interface TableDrawing {
  id: string;
  points: Point[];
  color: string;
  width: number;
  by: TableSender;
  pinned: boolean;
}
export type DrawStroke = Pick<TableDrawing, "id" | "points" | "color" | "width" | "pinned">;

interface SendableChannel {
  send: (message: { type: "broadcast"; event: string; payload: unknown }) => unknown;
}

export interface UseTableChannelOptions {
  /** Who the marks are from. Without one, sends do nothing. */
  identity: MaybeRefOrGetter<TableSender | null>;
  /** Test seam; the app uses the shared channel lifecycle. */
  createChannel?: typeof createRealtimeChannel;
}

export function useTableChannel(
  campaignId: MaybeRefOrGetter<string | null>,
  options: UseTableChannelOptions,
) {
  const create = options.createChannel ?? createRealtimeChannel;
  const pings = shallowRef<TablePing[]>([]);
  const measures = shallowRef<TableMeasure[]>([]);
  const drawings = shallowRef<TableDrawing[]>([]);
  const connected = ref(false);

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const measureTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const lastMeasureSend = new Map<string, number>();
  const trailing = new Map<string, ReturnType<typeof setTimeout>>();
  let pingSeq = 0;
  let handle: RealtimeChannelHandle | null = null;
  let channel: SendableChannel | null = null;

  const addPing = (x: number, y: number, by: TableSender) => {
    const id = ++pingSeq;
    pings.value = [...pings.value, { id, x, y, by }];
    const t = setTimeout(() => {
      timers.delete(t);
      pings.value = pings.value.filter((p) => p.id !== id);
    }, PING_MS);
    timers.add(t);
  };

  const removeMeasure = (id: string) => {
    const t = measureTimers.get(id);
    if (t) clearTimeout(t);
    measureTimers.delete(id);
    measures.value = measures.value.filter((m) => m.id !== id);
  };

  const upsertMeasure = (m: TableMeasure) => {
    const old = measureTimers.get(m.id);
    if (old) clearTimeout(old);
    measureTimers.set(m.id, setTimeout(() => removeMeasure(m.id), MEASURE_TTL_MS));
    measures.value = [...measures.value.filter((x) => x.id !== m.id), m];
  };

  const upsertDrawing = (d: TableDrawing) => {
    const rest = drawings.value.filter((x) => x.id !== d.id);
    drawings.value = [...rest, d].slice(-MAX_DRAWINGS);
  };

  const apply = (msg: TableMessage) => {
    switch (msg.event) {
      case "ping": addPing(msg.x, msg.y, msg.by); break;
      case "measure": upsertMeasure({ id: msg.id, points: msg.points, by: msg.by }); break;
      case "measure-clear": removeMeasure(msg.id); break;
      case "draw":
        upsertDrawing({
          id: msg.id, points: msg.points, color: msg.color, width: msg.width, by: msg.by, pinned: msg.pinned,
        });
        break;
      case "draw-clear":
        drawings.value = "all" in msg ? [] : drawings.value.filter((d) => d.id !== msg.id);
        break;
    }
  };

  const transmit = (msg: TableMessage) => {
    apply(msg);
    if (!connected.value || !channel) return;
    void channel.send({ type: "broadcast", event: TABLE_BROADCAST_EVENT, payload: msg });
  };

  const sender = () => toValue(options.identity);

  const reset = () => {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    for (const t of measureTimers.values()) clearTimeout(t);
    measureTimers.clear();
    pings.value = [];
    measures.value = [];
    drawings.value = [];
  };

  const stop = () => {
    handle?.stop();
    handle = null;
    channel = null;
    connected.value = false;
    reset();
    lastMeasureSend.clear();
    for (const t of trailing.values()) clearTimeout(t);
    trailing.clear();
  };

  watch(
    () => toValue(campaignId),
    (id) => {
      stop();
      if (!id) return;
      handle = create({
        topic: tableTopic(id),
        isPrivate: true,
        onStatus: (status) => { connected.value = status === "SUBSCRIBED"; },
        bind: (ch) => {
          channel = ch;
          return ch.on("broadcast", { event: TABLE_BROADCAST_EVENT }, ({ payload }) => {
            const msg = parseTableMessage(payload);
            if (msg) apply(msg);
          });
        },
      });
    },
    { immediate: true },
  );
  onScopeDispose(stop);

  // Measure updates: send at once if the last send was long enough ago, else keep only the newest for the end
  // of the window. The local echo is immediate either way so the sender's own line never lags.
  const sendMeasure = (id: string, points: Point[], by: TableSender) => {
    lastMeasureSend.set(id, Date.now());
    transmit({ event: "measure", id, points, by, at: Date.now() });
  };

  return {
    pings, measures, drawings, connected,

    sendPing(x: number, y: number): void {
      const by = sender();
      if (by) transmit({ event: "ping", x, y, by, at: Date.now() });
    },

    startMeasure(id: string, points: Point[]): void {
      const by = sender();
      if (by) sendMeasure(id, points, by);
    },

    updateMeasure(id: string, points: Point[]): void {
      const by = sender();
      if (!by) return;
      const wait = MEASURE_THROTTLE_MS - (Date.now() - (lastMeasureSend.get(id) ?? 0));
      const pending = trailing.get(id);
      if (wait <= 0) {
        if (pending) clearTimeout(pending);
        trailing.delete(id);
        sendMeasure(id, points, by);
        return;
      }
      apply({ event: "measure", id, points, by, at: Date.now() });
      if (pending) clearTimeout(pending);
      trailing.set(id, setTimeout(() => {
        trailing.delete(id);
        sendMeasure(id, points, by);
      }, wait));
    },

    endMeasure(id: string): void {
      const pending = trailing.get(id);
      if (pending) clearTimeout(pending);
      trailing.delete(id);
      lastMeasureSend.delete(id);
      transmit({ event: "measure-clear", id });
    },

    draw(stroke: DrawStroke): void {
      const by = sender();
      if (by) transmit({ event: "draw", ...stroke, by, at: Date.now() });
    },

    clearDrawing(id: string): void {
      transmit({ event: "draw-clear", id });
    },

    clearAll(): void {
      transmit({ event: "draw-clear", all: true });
    },

    /** Local only: every client sees the same turn change, so each drops its own unpinned strokes. */
    clearUnpinned(): void {
      drawings.value = drawings.value.filter((d) => d.pinned);
    },
  };
}
