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
import { readPen, toSamples, type PenReading } from "../render/penSamples";
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
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (frame) cancelAnimationFrame(frame);
  if (penFrame) cancelAnimationFrame(penFrame);
});

// ---- pointer ----

let reading: PenReading | null = null;
let penFrame = 0;
function notePen(ev: PointerEvent): void {
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

function onPointerDown(ev: PointerEvent): void {
  const el = host.value;
  if (!el) return;
  notePen(ev);

  if (ev.pointerType === "touch") {
    touches.set(ev.pointerId, local(ev));
    if (touches.size === 2) {
      endStroke();
      gesture = null;
      const [[ia, a], [ib, b]] = [...touches.entries()];
      pinch = { start: viewport.value, a, b, ids: [ia, ib] };
      return;
    }
    if (touches.size > 2) return;
  }
  if (gesture) return;
  el.setPointerCapture(ev.pointerId);

  if (hand.isForcedPan(ev)) {
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

  if (beforeStroke && !beforeStroke()) return;
  const samples = toSamples(ev, origin(), viewport.value);
  const first = samples[0];
  const began = session.beginStroke(first, { restore: ev.altKey && tool === "eraser" });
  if (began === null) return;
  const { layerId } = began;
  gesture = { kind: "stroke", pointerId: ev.pointerId, layerId };
  // The stroke may have made a layer; the compositor learns of it before it is asked to draw it.
  compositor.syncLayers(session.state.doc.layers);
  compositor.markDirty(layerId, began.keys);
  emit("stroke-start", layerId);
  const rest = samples.slice(1);
  if (rest.length > 0) addSamples(layerId, rest);
  requestFrame();
}

function addSamples(layerId: string, samples: ReturnType<typeof toSamples>): void {
  const keys = session.addSamples(samples);
  if (keys.length > 0) compositor.markDirty(layerId, keys);
}

function onPointerMove(ev: PointerEvent): void {
  const p = local(ev);
  hover.value = p;
  notePen(ev);

  if (pinch && touches.has(ev.pointerId)) {
    touches.set(ev.pointerId, p);
    const a = touches.get(pinch.ids[0]);
    const b = touches.get(pinch.ids[1]);
    if (a && b) setViewport(pinchViewport(pinch.start, pinch.a, pinch.b, a, b));
    return;
  }
  if (!gesture || gesture.pointerId !== ev.pointerId) return;

  if (gesture.kind === "pan") {
    setViewport(panBy(viewport.value, ev.clientX - gesture.x, ev.clientY - gesture.y));
    gesture.x = ev.clientX;
    gesture.y = ev.clientY;
  } else if (gesture.kind === "pick") {
    pick(ev);
  } else {
    addSamples(gesture.layerId, toSamples(ev, origin(), viewport.value));
    requestFrame();
  }
}

function onPointerEnd(ev: PointerEvent): void {
  if (ev.pointerType === "touch") {
    touches.delete(ev.pointerId);
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
    class="relative size-full touch-none select-none overflow-hidden"
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
