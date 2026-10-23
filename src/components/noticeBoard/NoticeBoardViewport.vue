<template>
  <div
    ref="rootEl"
    class="nb-viewport relative h-full min-h-80 w-full overflow-hidden"
    :class="{ 'is-panning': panning, 'is-hand': spaceHeld }"
    :style="{ touchAction: overflowX || overflowY ? 'none' : 'pan-y' }"
    data-viewport
    @pointerdown.capture="onPointerDownCapture"
    @pointerdown="onPointerDown"
    @mousedown="onMouseDown"
    @pointerenter="hovered = true"
    @pointerleave="hovered = false"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @wheel="onWheel"
    @focusin="onFocusIn"
  >
    <!-- More board beyond an edge: the board fades into the page there. A mask on this fixed layer, not an overlay, so
         nothing is painted over the page around a board that hangs on it. -->
    <div class="absolute inset-0" :style="edgeMask" data-edge-mask :data-fades="fades.join(' ')">
    <!-- Pan is a plain translate (rounded to whole px so the type stays crisp); the board itself is only ever resized. -->
    <div
      v-if="measured"
      class="nb-pan absolute left-0 top-0"
      data-pan
      :style="{
        width: `${BOARD_W * scale}px`,
        transform: `translate(${Math.round(offset.x)}px, ${Math.round(offset.y)}px)`,
      }"
    >
      <NoticeBoardSurface :surface="surface" :scatter="scatter">
        <NoticeBoardPin
          v-for="pin in pins"
          :key="pin.id"
          :face="pin"
          :editable="editable"
          :selected="pin.id === selectedId"
          @select="onSelect"
          @move="(id, x, y) => emit('move', id, x, y)"
        />
      </NoticeBoardSurface>
    </div>
    </div>

    <div class="absolute bottom-3 right-3 z-10 flex flex-col gap-1 rounded-md border border-border bg-card/90 p-1 shadow-md" data-zoom-controls>
      <AppButton variant="subtle" size="icon-sm" :icon="IconZoomIn" aria-label="Zoom in" :disabled="scale >= MAX_SCALE" @click="zoomBy(1.25)" />
      <AppButton variant="subtle" size="icon-sm" :icon="IconZoomOut" aria-label="Zoom out" :disabled="scale <= base.fit" @click="zoomBy(0.8)" />
      <AppButton variant="subtle" size="icon-sm" :icon="IconMaximize" aria-label="Fit the whole board" :disabled="zoom === null" @click="fit" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Puts a board in front of a reader. One rule decides the scale: fit the whole board when that keeps the pins
 * readable, otherwise hold the readable floor and let the reader pan. So a phone held upright walks along the board
 * rather than squinting at a 390px strip, and every device sees the same arrangement. Pinch, ctrl-wheel and the
 * buttons zoom between "the whole board fits" and 2.5x; Fit returns.
 *
 * It fills whatever box it is given; the page decides how tall that is.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconMaximize, IconZoomIn, IconZoomOut } from "@/lib/icons";
import { useCanvasHand } from "@/composables/useCanvasHand";
import { resolveWheel } from "@/lib/canvasControls/wheel";
import {
  BOARD_H,
  BOARD_W,
  boardScale,
  clampScale,
  constrainPan,
  MAX_SCALE,
  type PanOffset,
  zoomAt,
} from "@/lib/noticeBoard/geometry";
import type { NoticeBoardSurface as Surface, NoticePinFace, NoticeScatterPiece } from "@/types/noticeBoard.types";
import NoticeBoardPin from "./NoticeBoardPin.vue";
import NoticeBoardSurface from "./NoticeBoardSurface.vue";

const { surface, scatter = [], pins, editable = false, selectedId = null } = defineProps<{
  surface: Surface;
  scatter?: readonly NoticeScatterPiece[];
  /** In reading order. Callers never pass drafts. */
  pins: NoticePinFace[];
  editable?: boolean;
  selectedId?: string | null;
}>();
const emit = defineEmits<{
  /** A pin was tapped; `origin` is its element, for a reader to grow from. Stubs are not reported unless editable. */
  select: [id: string, origin: HTMLElement];
  /** A pin was dropped somewhere new (editable only): its top-left as fractions of the board. */
  move: [id: string, x: number, y: number];
}>();

const rootEl = ref<HTMLElement | null>(null);
const vw = ref(0);
const vh = ref(0);
const measured = computed(() => vw.value > 0 && vh.value > 0);

/** null is "whatever the rule says"; a number is where the reader zoomed to. */
const zoom = ref<number | null>(null);
const pan = ref<PanOffset>({ x: 0, y: 0 });

const base = computed(() => boardScale(vw.value, vh.value));
const scale = computed(() => (zoom.value === null ? base.value.scale : clampScale(zoom.value, base.value.fit)));
const offset = computed(() => constrainPan(vw.value, vh.value, scale.value, pan.value));
const overflowX = computed(() => BOARD_W * scale.value > vw.value + 0.5);
const overflowY = computed(() => BOARD_H * scale.value > vh.value + 0.5);

const fades = computed(() => {
  const out: string[] = [];
  const { x, y } = offset.value;
  if (overflowX.value && x < -1) out.push("left");
  if (overflowX.value && x > vw.value - BOARD_W * scale.value + 1) out.push("right");
  if (overflowY.value && y < -1) out.push("top");
  if (overflowY.value && y > vh.value - BOARD_H * scale.value + 1) out.push("bottom");
  return out;
});

const FADE = "2.5rem";
const edgeMask = computed(() => {
  const has = (edge: string) => fades.value.includes(edge);
  if (fades.value.length === 0) return {};
  const ramp = (dir: string, from: string, to: string) =>
    `linear-gradient(${dir}, ${has(from) ? "transparent" : "#000"} 0, #000 ${FADE}, #000 calc(100% - ${FADE}), ${has(to) ? "transparent" : "#000"} 100%)`;
  const image = `${ramp("to right", "left", "right")}, ${ramp("to bottom", "top", "bottom")}`;
  return { maskImage: image, WebkitMaskImage: image, maskComposite: "intersect", WebkitMaskComposite: "source-in" };
});

function measure() {
  const el = rootEl.value;
  if (!el) return;
  vw.value = el.clientWidth;
  vh.value = el.clientHeight;
}

let observer: ResizeObserver | null = null;
onMounted(() => {
  measure();
  if (typeof ResizeObserver !== "undefined" && rootEl.value) {
    observer = new ResizeObserver(measure);
    observer.observe(rootEl.value);
  }
});
onBeforeUnmount(() => observer?.disconnect());

// ── Zoom ─────────────────────────────────────────────────────────────────────

function setScale(next: number, focus: PanOffset) {
  const to = clampScale(next, base.value.fit);
  pan.value = zoomAt(vw.value, vh.value, { scale: scale.value, pan: offset.value }, to, focus);
  zoom.value = to;
}

function zoomBy(factor: number) {
  setScale(scale.value * factor, { x: vw.value / 2, y: vh.value / 2 });
}

function fit() {
  zoom.value = null;
  pan.value = { x: 0, y: 0 };
}

function localPoint(event: { clientX: number; clientY: number }): PanOffset {
  const rect = rootEl.value?.getBoundingClientRect();
  if (!rect) return { x: event.clientX, y: event.clientY };
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

// A board sits inside a page, so the plain wheel pans only while the board overflows and otherwise lets the page scroll.
function onWheel(event: WheelEvent) {
  const intent = resolveWheel(event);
  if (intent.kind === "zoom") {
    // Ctrl, Cmd or Alt+wheel, and a trackpad pinch (which arrives as ctrl+wheel), zoom about the cursor.
    event.preventDefault();
    setScale(scale.value * intent.factor, localPoint(event));
    return;
  }
  if (!overflowX.value && !overflowY.value) return;
  event.preventDefault();
  pan.value = { x: offset.value.x - intent.dx, y: offset.value.y - intent.dy };
}

// ── Keys: Space is a hand, and the zoom shortcuts ────────────────────────────

// The keys are window-wide, so they act only while the reader is on this board (pointer over it or focus inside it);
// otherwise Space would stop scrolling the page and Ctrl+- would stop zooming the browser for anything else on it.
const hovered = ref(false);
function onBoard(): boolean {
  return hovered.value || (rootEl.value?.contains(document.activeElement) ?? false);
}

function zoomTo(to: "in" | "out" | "fit" | "actual") {
  if (to === "in") zoomBy(1.25);
  else if (to === "out") zoomBy(0.8);
  else if (to === "fit") fit();
  // The board is drawn at BOARD_W px at a scale of 1, which is its natural size, so that is 100%; setScale holds it
  // inside "whole board fits" to 2.5x.
  else setScale(1, { x: vw.value / 2, y: vh.value / 2 });
}

const hand = useCanvasHand({ onZoom: zoomTo, active: onBoard });
const { spaceHeld } = hand;

// ── Drag to pan, two fingers to zoom ─────────────────────────────────────────

const PAN_THRESHOLD = 6;
const pointers = new Map<number, PanOffset>();
const panning = ref(false);
let drag: { from: PanOffset; pan: PanOffset } | null = null;
let pinch: { dist: number; scale: number } | null = null;
/** A pan that ends over a pin must not read as a tap on it. */
let moved = false;

function distance(): number {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(): PanOffset {
  const [a, b] = [...pointers.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * A pin being arranged stops its own pointerdown from reaching the pan below, so a pan that must win over it (middle
 * button, or Space held) starts here in the capture phase and the pin never sees the press. Checked here rather than
 * passed down to every pin, which keeps the pin ignorant of the hand tool.
 */
function onPointerDownCapture(event: PointerEvent) {
  if (!hand.isForcedPan(event)) return;
  if (!(event.target instanceof Element) || !event.target.closest("[data-pin]")) return;
  onPointerDown(event);
  event.stopPropagation();
}

// The browser's middle-press autoscroll would take the drag over.
function onMouseDown(event: MouseEvent) {
  if (event.button === 1) event.preventDefault();
}

function onPointerDown(event: PointerEvent) {
  if (event.target instanceof Element && event.target.closest("[data-zoom-controls]")) return;
  pointers.set(event.pointerId, localPoint(event));
  if (pointers.size === 1) {
    moved = false;
    drag = { from: localPoint(event), pan: offset.value };
  } else if (pointers.size === 2) {
    drag = null;
    pinch = { dist: distance(), scale: scale.value };
  }
}

function onPointerMove(event: PointerEvent) {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, localPoint(event));
  if (pinch && pointers.size >= 2 && pinch.dist > 0) {
    moved = true;
    setScale(pinch.scale * (distance() / pinch.dist), midpoint());
    return;
  }
  if (!drag) return;
  const here = localPoint(event);
  const dx = here.x - drag.from.x;
  const dy = here.y - drag.from.y;
  if (!panning.value) {
    if (Math.hypot(dx, dy) < PAN_THRESHOLD) return;
    panning.value = true;
    moved = true;
    // Captured only once it is a drag, or the click a tap should produce would be retargeted away from its pin.
    rootEl.value?.setPointerCapture?.(event.pointerId);
  }
  pan.value = { x: drag.pan.x + dx, y: drag.pan.y + dy };
}

function onPointerEnd(event: PointerEvent) {
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) {
    drag = null;
    panning.value = false;
  }
}

function onSelect(id: string, origin: HTMLElement) {
  if (moved) {
    moved = false;
    return;
  }
  emit("select", id, origin);
}

/**
 * Tabbing to a pin that is off screen would make the browser scroll this hidden-overflow box, which our translate
 * knows nothing about. Undo the scroll and pan the pin into view instead.
 */
function onFocusIn(event: FocusEvent) {
  const root = rootEl.value;
  const pin = event.target instanceof Element ? event.target.closest("[data-pin]") : null;
  if (!root || !pin) return;
  root.scrollLeft = 0;
  root.scrollTop = 0;
  const v = root.getBoundingClientRect();
  const p = pin.getBoundingClientRect();
  const nudge = (lo: number, hi: number, vLo: number, vHi: number) => (lo < vLo ? vLo - lo : hi > vHi ? vHi - hi : 0);
  pan.value = {
    x: offset.value.x + nudge(p.left, p.right, v.left, v.right),
    y: offset.value.y + nudge(p.top, p.bottom, v.top, v.bottom),
  };
}
</script>

<style scoped>
.nb-viewport {
  /* No room drawn around a board that fits: it hangs on the page itself, and casts its own shadow onto it. */
  background: transparent;
  cursor: grab;
}
.nb-viewport.is-hand,
.nb-viewport.is-hand :deep(.nb-hit) {
  cursor: grab;
}
.nb-viewport.is-panning,
.nb-viewport.is-panning :deep(.nb-hit) {
  cursor: grabbing;
}
</style>
