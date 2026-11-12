<script setup lang="ts">
/*
 * The painting canvas (#1181): shows the compositor under a zoom and pan, and takes the pen. It drives the
 * session (strokes) and the compositor (what to redraw) and owns nothing else; the panels around it arm the
 * tool and brush.
 *
 * One render per animation frame however many pointer events arrive. The canvas is sized to the stage times
 * devicePixelRatio, so a stroke is as sharp as the screen can show it.
 */
import { onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useCanvasHand } from "@/composables/useCanvasHand";
import { resolveWheel } from "@/lib/canvasControls/wheel";
import type { Rgb } from "../engine/types";
import type { PaintSessionApi, PaintTool } from "../session/types";
import type { Compositor } from "../render/compositor";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import type { PenSample } from "../engine/types";
import { readPen, toSamples, type PenReading } from "../render/penSamples";
import { createTouchGestures, type PointerRecord } from "../render/touchGestures";
import {
  fitViewport,
  panBy,
  pinchViewport,
  screenToDoc,
  zoomAbout,
  zoomToTarget,
  type Point,
  type Viewport,
} from "../render/viewport";

const { session, compositor, cursor, tool, beforeStroke = undefined } = defineProps<{
  session: PaintSessionApi;
  compositor: Compositor;
  /** The armed tip's outline, in document pixels; null shows none. */
  cursor: { size: number; angle: number; roundness: number } | null;
  tool: PaintTool;
  /** Asked before a stroke begins; false means this stroke is not painted (the plan's canvas limit). */
  beforeStroke?: () => boolean;
}>();

const emit = defineEmits<{
  picked: [rgb: Rgb];
  "stroke-start": [layerId: string];
  "stroke-end": [layerId: string];
  viewport: [viewport: Viewport];
  /** What the pen last reported; at most once per frame however many events arrive. */
  pen: [reading: PenReading];
  /** A two-finger tap. */
  undo: [];
  /** A three-finger tap. */
  redo: [];
}>();

const host = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const viewport = shallowRef<Viewport>({ scale: 1, offsetX: 0, offsetY: 0 });
const hover = ref<{ x: number; y: number } | null>(null);
const panning = ref(false);
const view = { width: 0, height: 0 };

const hand = useCanvasHand({ onZoom: (to) => setViewport(zoomToTarget(viewport.value, to, docSize(), view)) });

function docSize(): { width: number; height: number } {
  return session.state.doc;
}

function setViewport(next: Viewport): void {
  viewport.value = next;
  emit("viewport", next);
  requestFrame();
}

// ---- drawing ----

let frame = 0;
function requestFrame(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    renderNow();
  });
}

function renderNow(): void {
  const c = canvas.value;
  if (!c || view.width === 0) return;
  const dpr = window.devicePixelRatio;
  const w = Math.round(view.width * dpr);
  const h = Math.round(view.height * dpr);
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  compositor.render(c, viewport.value, dpr);
}

let resizeObserver: ResizeObserver | null = null;
let fitted = false;

onMounted(() => {
  const el = host.value;
  if (!el) return;
  resizeObserver = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect;
    if (!box) return;
    view.width = box.width;
    view.height = box.height;
    if (!fitted && box.width > 0 && box.height > 0) {
      fitted = true;
      setViewport(fitViewport(docSize(), view));
    } else {
      requestFrame();
    }
  });
  resizeObserver.observe(el);
  // iPadOS Safari zooms the whole page on a pinch unless it is told no.
  el.addEventListener("gesturestart", stopPageGesture, { passive: false });
  el.addEventListener("gesturechange", stopPageGesture, { passive: false });
});

function stopPageGesture(ev: Event): void {
  ev.preventDefault();
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  host.value?.removeEventListener("gesturestart", stopPageGesture);
  host.value?.removeEventListener("gesturechange", stopPageGesture);
  if (frame) cancelAnimationFrame(frame);
  if (penFrame) cancelAnimationFrame(penFrame);
});

// ---- pointer ----

// Once a pen has been seen on this device a finger navigates instead of painting. Remembered, so the first
// finger of the next visit is not a stray mark.
const PEN_SEEN_KEY = "grimoire:paint:pen-seen";
const gestures = createTouchGestures({ penSeen: safeLocalStorage().getItem(PEN_SEEN_KEY) === "1" });

function record(ev: PointerEvent): PointerRecord {
  const p = local(ev);
  return { id: ev.pointerId, type: ev.pointerType, x: p.x, y: p.y, time: ev.timeStamp };
}

let reading: PenReading | null = null;
let penFrame = 0;
function notePen(ev: PointerEvent): void {
  if (ev.pointerType === "pen" && gestures.seePen()) {
    try {
      safeLocalStorage().setItem(PEN_SEEN_KEY, "1");
    } catch {
      // Remembering is a courtesy; this visit already knows.
    }
  }
  reading = readPen(reading, ev);
  if (penFrame) return;
  penFrame = requestAnimationFrame(() => {
    penFrame = 0;
    if (reading) emit("pen", reading);
  });
}

type Gesture =
  | { kind: "stroke"; pointerId: number; layerId: string }
  | { kind: "pan"; pointerId: number; x: number; y: number }
  /** A finger that may yet become the second finger of a pinch: its samples wait here, unpainted. */
  | { kind: "pending"; pointerId: number; samples: PenSample[]; restore: boolean }
  | { kind: "pick"; pointerId: number };

let gesture: Gesture | null = null;
const touches = new Map<number, Point>();
let pinch: { start: Viewport; a: Point; b: Point; ids: [number, number] } | null = null;

function origin(): { left: number; top: number } {
  const r = host.value?.getBoundingClientRect();
  return r ? { left: r.left, top: r.top } : { left: 0, top: 0 };
}

function local(ev: { clientX: number; clientY: number }): Point {
  const o = origin();
  return { x: ev.clientX - o.left, y: ev.clientY - o.top };
}

function pick(ev: PointerEvent): void {
  const p = local(ev);
  const doc = screenToDoc(viewport.value, p.x, p.y);
  const rgb = compositor.readPixel(doc.x, doc.y);
  if (rgb) emit("picked", rgb);
}

function endStroke(): void {
  if (gesture?.kind !== "stroke") return;
  const { layerId } = gesture;
  gesture = null;
  const keys = session.endStroke();
  if (keys.length > 0) compositor.markDirty(layerId, keys);
  emit("stroke-end", layerId);
  requestFrame();
}

function startStroke(pointerId: number, samples: PenSample[], restore: boolean): void {
  const first = samples[0];
  if (!first) return;
  const began = session.beginStroke(first, { restore });
  if (began === null) return;
  const { layerId } = began;
  gesture = { kind: "stroke", pointerId, layerId };
  // The stroke may have made a layer; the compositor learns of it before it is asked to draw it.
  compositor.syncLayers(session.state.doc.layers);
  compositor.markDirty(layerId, began.keys);
  emit("stroke-start", layerId);
  const rest = samples.slice(1);
  if (rest.length > 0) addSamples(layerId, rest);
  requestFrame();
}

/** Begins the held-back finger stroke from what was buffered. */
function commitPending(): void {
  if (gesture?.kind !== "pending") return;
  const { pointerId, samples, restore } = gesture;
  gesture = null;
  if (beforeStroke && !beforeStroke()) return;
  startStroke(pointerId, samples, restore);
}

function onPointerDown(ev: PointerEvent): void {
  const el = host.value;
  if (!el) return;
  notePen(ev);

  const act = ev.pointerType === "touch" || ev.pointerType === "pen" ? gestures.down(record(ev)) : null;
  if (ev.pointerType === "touch" && act) {
    if (act.kind === "ignore") return;
    touches.set(ev.pointerId, local(ev));
    if (act.kind === "pinch-start") {
      if (gesture?.kind === "pending" && act.keepStroke) commitPending();
      endStroke();
      gesture = null;
      panning.value = false;
      const [ia, ib] = act.ids;
      const a = touches.get(ia);
      const b = touches.get(ib);
      if (a && b) pinch = { start: viewport.value, a, b, ids: [ia, ib] };
      return;
    }
    if (act.kind === "pinch-end") {
      pinch = null;
      return;
    }
  }
  if (ev.pointerType === "pen" && act?.kind === "paint" && act.cancelTouches) {
    // A palm was already on the glass when the pen came down.
    touches.clear();
    pinch = null;
    endStroke();
    gesture = null;
    panning.value = false;
  }
  if (gesture) return;
  el.setPointerCapture(ev.pointerId);

  if (hand.isForcedPan(ev) || act?.kind === "pan") {
    ev.preventDefault();
    gesture = { kind: "pan", pointerId: ev.pointerId, x: ev.clientX, y: ev.clientY };
    panning.value = true;
    return;
  }
  if (tool === "picker" || (ev.altKey && tool === "brush")) {
    gesture = { kind: "pick", pointerId: ev.pointerId };
    pick(ev);
    return;
  }

  const restore = ev.altKey && tool === "eraser";
  if (act?.kind === "paint-pending") {
    gesture = { kind: "pending", pointerId: ev.pointerId, samples: toSamples(ev, origin(), viewport.value), restore };
    return;
  }
  if (beforeStroke && !beforeStroke()) return;
  startStroke(ev.pointerId, toSamples(ev, origin(), viewport.value), restore);
}

function addSamples(layerId: string, samples: ReturnType<typeof toSamples>): void {
  const keys = session.addSamples(samples);
  if (keys.length > 0) compositor.markDirty(layerId, keys);
}

function onPointerMove(ev: PointerEvent): void {
  const p = local(ev);
  hover.value = p;
  notePen(ev);

  if (ev.pointerType === "touch") {
    const act = gestures.move(record(ev));
    if (act.kind === "ignore") return;
    if (touches.has(ev.pointerId)) touches.set(ev.pointerId, p);
    if (act.kind === "pinch") {
      const a = pinch && touches.get(pinch.ids[0]);
      const b = pinch && touches.get(pinch.ids[1]);
      if (pinch && a && b) setViewport(pinchViewport(pinch.start, pinch.a, pinch.b, a, b));
      return;
    }
    if (gesture?.kind === "pending" && gesture.pointerId === ev.pointerId) {
      gesture.samples.push(...toSamples(ev, origin(), viewport.value));
      if (act.kind === "commit") commitPending();
      return;
    }
  }
  if (!gesture || gesture.pointerId !== ev.pointerId) return;

  if (gesture.kind === "pan") {
    setViewport(panBy(viewport.value, ev.clientX - gesture.x, ev.clientY - gesture.y));
    gesture.x = ev.clientX;
    gesture.y = ev.clientY;
  } else if (gesture.kind === "pick") {
    pick(ev);
  } else if (gesture.kind === "stroke") {
    addSamples(gesture.layerId, toSamples(ev, origin(), viewport.value));
    requestFrame();
  }
}

function onPointerEnd(ev: PointerEvent): void {
  const cancelled = ev.type === "pointercancel";
  if (ev.pointerType === "pen") {
    gestures[cancelled ? "cancel" : "up"](record(ev));
  } else if (ev.pointerType === "touch") {
    const act = gestures[cancelled ? "cancel" : "up"](record(ev));
    touches.delete(ev.pointerId);
    if (act.kind === "ignore") return;
    if (act.kind === "tap-undo") emit("undo");
    if (act.kind === "tap-redo") emit("redo");
    if (act.kind === "end" && act.commitFirst) commitPending();
    if (gesture?.kind === "pending" && gesture.pointerId === ev.pointerId) gesture = null;
    if (pinch?.ids.includes(ev.pointerId)) {
      pinch = null;
      return;
    }
  }
  if (!gesture || gesture.pointerId !== ev.pointerId) return;
  if (gesture.kind === "stroke") endStroke();
  else gesture = null;
  panning.value = false;
}

function onPointerLeave(): void {
  // A captured pointer keeps sending moves; leaving only matters for a hover.
  if (!gesture) hover.value = null;
}

function onWheel(ev: WheelEvent): void {
  const intent = resolveWheel(ev);
  const p = local(ev);
  if (intent.kind === "zoom") setViewport(zoomAbout(viewport.value, intent.factor, p.x, p.y));
  else setViewport(panBy(viewport.value, -intent.dx, -intent.dy));
}

defineExpose({
  /** Redraws on the next frame; call after anything the stage cannot see (an undo, a layer change). */
  redraw: requestFrame,
  fit: () => setViewport(fitViewport(docSize(), view)),
  viewport,
});

const cursorClass = (): string => {
  if (panning.value || hand.spaceHeld.value) return panning.value ? "cursor-grabbing" : "cursor-grab";
  return tool === "picker" ? "cursor-crosshair" : "cursor-none";
};
</script>

<template>
  <div
    ref="host"
    class="paint-stage relative size-full touch-none select-none overflow-hidden"
    :class="cursorClass()"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @pointerleave="onPointerLeave"
    @wheel.prevent="onWheel"
    @contextmenu.prevent
  >
    <canvas ref="canvas" class="absolute inset-0 block size-full" />
    <svg
      v-if="cursor && hover && tool !== 'picker' && !hand.spaceHeld.value && !panning"
      class="pointer-events-none absolute left-0 top-0 overflow-visible"
      width="1"
      height="1"
      aria-hidden="true"
      :style="{ transform: `translate(${hover.x}px, ${hover.y}px)` }"
    >
      <g :transform="`rotate(${cursor.angle})`">
        <ellipse
          :rx="(cursor.size * viewport.scale) / 2"
          :ry="(cursor.size * viewport.scale * cursor.roundness) / 2"
          fill="none"
          stroke="rgb(0 0 0 / 0.7)"
          stroke-width="3"
        />
        <ellipse
          :rx="(cursor.size * viewport.scale) / 2"
          :ry="(cursor.size * viewport.scale * cursor.roundness) / 2"
          fill="none"
          stroke="rgb(255 255 255 / 0.95)"
          stroke-width="1"
        />
      </g>
    </svg>
  </div>
</template>

<style scoped>
/* iPadOS: no callout or text selection from a long press on the canvas. */
.paint-stage {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
}
</style>
