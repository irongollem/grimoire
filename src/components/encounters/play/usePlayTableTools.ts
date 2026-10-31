import { computed, onScopeDispose, ref, toValue, type MaybeRefOrGetter, type Ref } from "vue";
import type { useTableChannel } from "@/composables/encounters/useTableChannel";
import { snapToSquareMiddle, type MeasurePoint } from "@/lib/battlemap/measure";
import { MAX_POINTS, type Point } from "@/lib/tableChannel/messages";
import { isClick } from "./playPointer";
import type { PlayTool } from "./playTypes";

/** What the three shared tools send; the Play map and the explore map both hand in their `useTableChannel`. */
export type TableMarkSender = Pick<
  ReturnType<typeof useTableChannel>,
  "sendPing" | "startMeasure" | "updateMeasure" | "endMeasure" | "draw"
>;

/** Strokes go out at most this often; Realtime Broadcast is rate limited per client. */
export const DRAW_THROTTLE_MS = 100;
/** A point is only added once the pointer has moved this far (in cells), so a slow hand does not fill the stroke. */
const DRAW_MIN_STEP = 0.15;
const DRAW_WIDTH = 3;
/** A sticky measure line is re-sent this often so it does not expire (the channel drops lines nobody updates). */
const MEASURE_KEEPALIVE_MS = 5000;

export const TABLE_TOOLS: readonly PlayTool[] = ["measure", "ping", "draw"];

interface Measure {
  id: string;
  points: MeasurePoint[];
  /** Clicked rather than dragged: it stays on the map and bends at every click until it is let go. */
  sticky: boolean;
  downAt: { x: number; y: number };
  lastSent: string;
}

interface Stroke {
  id: string;
  points: Point[];
  pinned: boolean;
  dirty: boolean;
}

const same = (a: MeasurePoint, b: MeasurePoint) => a[0] === b[0] && a[1] === b[1];

/**
 * Measure, Ping and Draw (#1125 frame 11): the three tools whose marks go out over the table channel so everyone sees
 * them. A press starts them, a move extends them, a release finishes them. Measure measures from the middle of a
 * square: drag a line, or click once to keep it and click again to bend it round a pillar; click the same square
 * twice, or press Esc, to let it go. A Draw stroke is the drawer's colour, and fades at the end of the turn unless pinned.
 */
export function usePlayTableTools(input: {
  channel: TableMarkSender;
  tool: Ref<PlayTool>;
  color: MaybeRefOrGetter<string>;
  pinned: Ref<boolean>;
}) {
  const { channel, tool } = input;
  let measure: Measure | null = null;
  let stroke: Stroke | null = null;
  let lastStrokeSend = 0;
  let strokeTimer: ReturnType<typeof setTimeout> | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;
  /** What the pointer is doing right now, so a hover over a sticky measure is told from a hover with nothing going on. */
  const live = ref(false);

  const owns = computed(() => TABLE_TOOLS.includes(tool.value));

  function sendMeasure(m: Measure, cursor: MeasurePoint) {
    const points = [...m.points, cursor];
    const key = points.join("|");
    if (key === m.lastSent) return;
    m.lastSent = key;
    channel.updateMeasure(m.id, points);
  }

  function endMeasure() {
    if (!measure) return;
    channel.endMeasure(measure.id);
    measure = null;
    clearInterval(keepalive);
    refreshLive();
  }

  function sendStroke() {
    if (!stroke) return;
    clearTimeout(strokeTimer);
    strokeTimer = undefined;
    lastStrokeSend = Date.now();
    stroke.dirty = false;
    channel.draw({ id: stroke.id, points: stroke.points, color: toValue(input.color), width: DRAW_WIDTH, pinned: stroke.pinned });
  }

  function endStroke() {
    if (!stroke) return;
    if (stroke.dirty) sendStroke();
    stroke = null;
    refreshLive();
  }

  function refreshLive() {
    live.value = measure !== null || stroke !== null;
  }

  function down(at: { x: number; y: number }, client: { x: number; y: number }) {
    if (tool.value === "ping") {
      channel.sendPing(at.x, at.y);
      return;
    }
    if (tool.value === "measure") {
      if (measure?.sticky) {
        measure.downAt = client;
        return;
      }
      endMeasure();
      const p = snapToSquareMiddle(at.x, at.y);
      measure = { id: crypto.randomUUID(), points: [p], sticky: false, downAt: client, lastSent: "" };
      channel.startMeasure(measure.id, [p]);
      refreshLive();
      return;
    }
    if (tool.value === "draw") {
      endStroke();
      stroke = { id: crypto.randomUUID(), points: [[at.x, at.y]], pinned: input.pinned.value, dirty: false };
      sendStroke();
      refreshLive();
    }
  }

  function move(at: { x: number; y: number }) {
    if (measure) {
      sendMeasure(measure, snapToSquareMiddle(at.x, at.y));
      return;
    }
    if (!stroke) return;
    const last = stroke.points[stroke.points.length - 1];
    if (stroke.points.length >= MAX_POINTS || Math.hypot(at.x - last[0], at.y - last[1]) < DRAW_MIN_STEP) return;
    stroke.points = [...stroke.points, [at.x, at.y]];
    stroke.dirty = true;
    const wait = DRAW_THROTTLE_MS - (Date.now() - lastStrokeSend);
    if (wait <= 0) sendStroke();
    else strokeTimer ??= setTimeout(sendStroke, wait);
  }

  function up(at: { x: number; y: number }, client: { x: number; y: number }) {
    if (stroke) {
      move(at);
      endStroke();
      return;
    }
    const m = measure;
    if (!m) return;
    const click = isClick(m.downAt, client);
    if (!m.sticky) {
      // A click with no drag keeps the line; a drag is a line held, and letting go ends it.
      if (!click) {
        endMeasure();
        return;
      }
      m.sticky = true;
      keepalive = setInterval(() => {
        if (measure) channel.updateMeasure(measure.id, measure.points);
      }, MEASURE_KEEPALIVE_MS);
      return;
    }
    if (!click) return;
    const bend = snapToSquareMiddle(at.x, at.y);
    if (same(bend, m.points[m.points.length - 1])) {
      endMeasure();
      return;
    }
    m.points = [...m.points, bend];
    m.lastSent = "";
    sendMeasure(m, bend);
  }

  /** Esc, a new tool, or the pointer leaving mid-drag. A sticky line survives the pointer leaving; the rest do not. */
  function cancel() {
    endMeasure();
    endStroke();
  }

  function release() {
    if (measure && !measure.sticky) endMeasure();
    endStroke();
  }

  onScopeDispose(() => {
    clearInterval(keepalive);
    clearTimeout(strokeTimer);
  });

  return { owns, live, down, move, up, cancel, release };
}
