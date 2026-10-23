<script setup lang="ts">
/**
 * Turning the page (#1085). This is the one place that knows how a turn looks: show `target`, and when it changes,
 * animate from where the book was to there. The interface is small on purpose (a `target` in, a `page` slot per
 * face, `done` out), so the reader never knows how the paper moves.
 *
 * The turn is a curl. The leaf's face is clipped by a fold line that sweeps across it from the outer edge to the
 * spine, tilted so the outer bottom corner lifts first. What lies beyond the fold is folded over: the next verso is
 * laid mirrored across the line, with a crease gradient along it, and a soft shadow falls on the page uncovered
 * beneath. The shapes come from `curlFrame` (src/lib/openBook/curl.ts); a requestAnimationFrame loop feeds it an
 * eased progress and writes only clip-path and transform, so nothing is laid out per frame. A phone curls its single
 * page off to the left edge the same way. A turn back plays the same curl in reverse.
 *
 * The corner can also be dragged. Pressing a dog-ear and moving lays the curl under the pointer: the folded paper's
 * outer edge follows it, so progress is how far the pointer has crossed the leaf. Letting go past halfway clicks the
 * dog-ear itself, so the reader's own turn runs unchanged, and the curl glides on from where the hand left it;
 * letting go short of halfway springs it back. `next` and `prev` are the pages a drag would reach.
 *
 * Under prefers-reduced-motion, or where the Web Animations API is missing, the new spread cross-fades in instead
 * and there is no drag: a click still turns.
 */
import { nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import type { ReadingMode } from "@/lib/openBook/pagination";
import { curlFrame, easeTurn, matrixCss, polygonCss, type CurlFrame } from "@/lib/openBook/curl";
import { canAnimate, prefersReducedMotion, whenSettled } from "@/lib/motion";
import type { PageTarget } from "./readerContext";

const { target, mode, instant = false, next = null, prev = null } = defineProps<{
  target: PageTarget;
  mode: ReadingMode;
  /** The page a forward drag of the corner would turn to; none when the book ends. */
  next?: PageTarget | null;
  /** The page a backward drag would turn to. */
  prev?: PageTarget | null;
  /** Show the new target at once, with no turn: the reader correcting an address, not the visitor turning. */
  instant?: boolean;
}>();
const emit = defineEmits<{ done: [] }>();

defineSlots<{
  /** One page face. `live` is false for the faces of a leaf in flight. */
  page(props: { target: PageTarget; side: "verso" | "recto"; live: boolean }): unknown;
  /** Chrome that belongs to the open spread, not to a leaf (the dog-ears, the ribbons, the tabs). */
  default?(): unknown;
}>();

/** The duration of a curl. Slower than a panel hop because the fold has to be seen to travel. */
const TURN_MS = 900;
const FADE_MS = 260;
/** How far a press must travel before it is a drag and not a click. */
const DRAG_SLOP = 8;
/** How far the crease and cast shadow reach, as a fraction of the page width. */
const CREASE_REACH = 0.16;
const CAST_REACH = 0.22;

const shown = ref<PageTarget>(target);
interface Leaf {
  dir: "next" | "prev";
  from: PageTarget;
  to: PageTarget;
}
const leaf = ref<Leaf | null>(null);

const root = useTemplateRef<HTMLElement>("root");
const leafEl = useTemplateRef<HTMLElement>("leafEl");
const castClip = useTemplateRef<HTMLElement>("castClip");
const cast = useTemplateRef<HTMLElement>("cast");
const frontClip = useTemplateRef<HTMLElement>("frontClip");
const frontCrease = useTemplateRef<HTMLElement>("frontCrease");
const backClip = useTemplateRef<HTMLElement>("backClip");
const backPage = useTemplateRef<HTMLElement>("backPage");
const backCrease = useTemplateRef<HTMLElement>("backCrease");

/** A corner being dragged. `committed` once the release was past halfway and the reader has been told to turn. */
interface Drag {
  dir: "next" | "prev";
  to: PageTarget;
  btn: HTMLElement;
  pointerId: number;
  startX: number;
  box: Box | null;
  left: number;
  p: number;
  committed: boolean;
  /** The glide ended before the reader's target caught up; the next target change finishes it. */
  waiting: boolean;
}
let drag: Drag | null = null;
const dragging = ref(false);
let swallowClick = false;
let programmaticClick = false;
let giveUp = 0;
let frame = 0;
/** A stale frame or a cancelled fade must not finish the book; only the newest turn may. */
let turnId = 0;

function sameTarget(a: PageTarget, b: PageTarget): boolean {
  return a.key === b.key && a.unit === b.unit;
}

function stopFrames() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
}

function settle() {
  stopFrames();
  clearTimeout(giveUp);
  drag = null;
  dragging.value = false;
  leaf.value = null;
  shown.value = target;
  emit("done");
}

interface Box {
  w: number;
  h: number;
  /** Length of the shading strips, long enough to cover the page at any tilt. */
  span: number;
}

/** Place a shading strip on the fold: `side` -1 lies on the flat side of the line, 1 on the folded side. */
function strip(el: HTMLElement | null, f: CurlFrame, width: number, span: number, side: -1 | 1, alpha: number) {
  if (!el) return;
  const off = side === -1 ? -width : 0;
  el.style.transform = `translate(${f.origin.x.toFixed(2)}px, ${f.origin.y.toFixed(2)}px) rotate(${f.angle.toFixed(4)}rad) translate(${off.toFixed(2)}px, ${(-span / 2).toFixed(2)}px)`;
  el.style.opacity = String(alpha);
}

function paint(progress: number, box: Box) {
  const f = curlFrame(progress, box.w, box.h, { reach: mode === "spread" ? 1 : 0 });
  const cw = box.w * CREASE_REACH;
  if (frontClip.value) frontClip.value.style.clipPath = polygonCss(f.front);
  if (backClip.value) backClip.value.style.clipPath = polygonCss(f.back);
  if (castClip.value) castClip.value.style.clipPath = polygonCss(f.folded);
  if (backPage.value) backPage.value.style.transform = matrixCss(f.backMatrix);
  strip(frontCrease.value, f, cw, box.span, -1, f.depth);
  strip(backCrease.value, f, cw, box.span, -1, f.depth);
  strip(cast.value, f, box.w * CAST_REACH, box.span, 1, f.depth);
}

function size(el: HTMLElement | null, w: number, h: number) {
  if (!el) return;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
}

/** The one layout read of a turn: measure the leaf and size the layers that need pixels. */
function prepare(el: HTMLElement): Box {
  const rect = el.getBoundingClientRect();
  const box: Box = { w: rect.width, h: rect.height, span: Math.max(rect.width, rect.height) * 3 };
  size(backPage.value, box.w, box.h);
  for (const s of [frontCrease.value, backCrease.value]) size(s, box.w * CREASE_REACH, box.span);
  size(cast.value, box.w * CAST_REACH, box.span);
  return box;
}

async function turn(from: PageTarget, to: PageTarget) {
  const dir = to.order > from.order ? "next" : "prev";
  if (!root.value || !canAnimate(root.value)) {
    shown.value = to;
    emit("done");
    return;
  }
  const id = turnId;
  leaf.value = { dir, from, to };
  await nextTick();
  if (id !== turnId) return;
  const el = leafEl.value;
  if (!el) {
    settle();
    return;
  }
  const box = prepare(el);
  let t0 = 0;
  const step = (now: number) => {
    if (id !== turnId) return;
    if (!t0) t0 = now;
    const u = Math.min(1, (now - t0) / TURN_MS);
    const eased = easeTurn(u);
    paint(dir === "next" ? eased : 1 - eased, box);
    if (u >= 1) settle();
    else frame = requestAnimationFrame(step);
  };
  paint(dir === "next" ? 0 : 1, box);
  frame = requestAnimationFrame(step);
}

/** Run the curl from one progress to another, then call `end`. */
function glide(p0: number, p1: number, box: Box, end: () => void) {
  const id = turnId;
  const ms = Math.max(160, TURN_MS * Math.abs(p1 - p0) * 0.8);
  let t0 = 0;
  const step = (now: number) => {
    if (id !== turnId) return;
    if (!t0) t0 = now;
    const u = Math.min(1, (now - t0) / ms);
    paint(p0 + (p1 - p0) * (1 - (1 - u) ** 2), box);
    if (u >= 1) end();
    else frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
}

/** Where the fold stands when the folded paper's outer edge (or, on a phone, the fold) is under the pointer. */
function dragProgress(d: Drag, x: number): number {
  const w = d.box?.w ?? 0;
  if (w <= 0) return d.dir === "next" ? 0 : 1;
  // A lone page folds off the screen's edge, so there the fold itself, not the paper's tip, is under the finger.
  const across = mode === "single" ? (x - d.left) / w : (x - d.left + w) / (2 * w);
  return Math.min(1, Math.max(0, 1 - across));
}

function detach() {
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragEnd);
  window.removeEventListener("pointercancel", onDragEnd);
}

async function beginDrag(d: Drag, x: number) {
  const id = turnId;
  leaf.value = { dir: d.dir, from: shown.value, to: d.to };
  dragging.value = true;
  await nextTick();
  const el = leafEl.value;
  if (id !== turnId || drag !== d || !el) return;
  const rect = el.getBoundingClientRect();
  d.left = rect.left;
  d.box = prepare(el);
  d.p = dragProgress(d, x);
  paint(d.p, d.box);
}

function onDragDown(event: PointerEvent) {
  if (drag || leaf.value || event.button > 0 || !(event.target instanceof Element)) return;
  const btn = event.target.closest<HTMLElement>(".ob-lift");
  const el = root.value;
  if (!btn || !el || !el.contains(btn) || !canAnimate(el) || prefersReducedMotion()) return;
  const dir = btn.dataset.dir === "prev" ? "prev" : "next";
  const to = dir === "next" ? next : prev;
  if (!to) return;
  // A finger that starts on the corner is a drag of the page, not a swipe of the book.
  if (event.pointerType === "touch") event.stopPropagation();
  drag = { dir, to, btn, pointerId: event.pointerId, startX: event.clientX, box: null, left: 0, p: dir === "next" ? 0 : 1, committed: false, waiting: false };
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  window.addEventListener("pointercancel", onDragEnd);
}

function onDragMove(event: PointerEvent) {
  const d = drag;
  if (!d || event.pointerId !== d.pointerId) return;
  if (!dragging.value) {
    if (Math.abs(event.clientX - d.startX) < DRAG_SLOP) return;
    void beginDrag(d, event.clientX);
    return;
  }
  if (!d.box) return;
  d.p = dragProgress(d, event.clientX);
  paint(d.p, d.box);
}

function onDragEnd(event: PointerEvent) {
  const d = drag;
  if (!d || event.pointerId !== d.pointerId) return;
  detach();
  if (!dragging.value) {
    // Never moved: a plain click, which the dog-ear handles itself.
    drag = null;
    return;
  }
  // The click that follows a drag's release would turn a second time.
  swallowClick = true;
  setTimeout(() => {
    swallowClick = false;
  }, 40);
  const box = d.box;
  const complete = event.type === "pointerup" && (d.dir === "next" ? d.p > 0.5 : d.p < 0.5);
  if (!box) {
    turnId += 1;
    settleDragOff();
    return;
  }
  if (!complete) {
    glide(d.p, d.dir === "next" ? 0 : 1, box, () => {
      settleDragOff();
    });
    return;
  }
  d.committed = true;
  programmaticClick = true;
  d.btn.click();
  programmaticClick = false;
  glide(d.p, d.dir === "next" ? 1 : 0, box, () => {
    if (sameTarget(target, d.to)) {
      settle();
      return;
    }
    // Hold the folded page until the reader's target arrives, but not for ever if the turn was refused.
    d.waiting = true;
    giveUp = window.setTimeout(settleDragOff, 800);
  });
}

/** Put a dragged leaf back down without a turn having happened. */
function settleDragOff() {
  stopFrames();
  clearTimeout(giveUp);
  drag = null;
  dragging.value = false;
  leaf.value = null;
}

function onClickCapture(event: MouseEvent) {
  if (!swallowClick || programmaticClick) return;
  if (event.target instanceof Element && event.target.closest(".ob-lift")) {
    event.stopPropagation();
    event.preventDefault();
  }
}

/** The cross-fade for a reader who asked for less motion. */
function fade() {
  const el = root.value;
  if (el && canAnimate(el)) {
    const a = el.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: FADE_MS, easing: "ease" });
    whenSettled(a, () => emit("done"));
  } else {
    emit("done");
  }
}

watch(
  () => target,
  (to) => {
    // The reader recomputes its target whenever a page count changes, so an unchanged target arrives often.
    if (leaf.value && sameTarget(to, leaf.value.to)) {
      // The reader answered a committed drag: the curl is already on its way, and lands here if it has landed.
      if (drag?.waiting) settle();
      return;
    }
    turnId += 1;
    if (sameTarget(to, shown.value) && !leaf.value) {
      shown.value = to;
      return;
    }
    if (leaf.value) {
      // A turn arrived mid-turn: finish the old one at once and start from where it was heading.
      stopFrames();
      if (!drag || drag.committed) shown.value = leaf.value.to;
      leaf.value = null;
    }
    detach();
    clearTimeout(giveUp);
    drag = null;
    dragging.value = false;
    const from = shown.value;
    if (instant) {
      shown.value = to;
      emit("done");
      return;
    }
    if (prefersReducedMotion()) {
      shown.value = to;
      fade();
      return;
    }
    void turn(from, to);
  },
);

onBeforeUnmount(() => {
  turnId += 1;
  stopFrames();
  detach();
  clearTimeout(giveUp);
});
</script>

<template>
  <div
    ref="root"
    class="ob-pages"
    :data-mode="mode"
    :data-drag="dragging ? '' : undefined"
    @pointerdown.capture="onDragDown"
    @click.capture="onClickCapture"
  >
    <!-- Idle: the open spread. During a turn the base shows the two pages the leaf is not carrying. -->
    <template v-if="mode === 'spread'">
      <slot
        name="page"
        :target="leaf ? (leaf.dir === 'next' ? leaf.from : leaf.to) : shown"
        side="verso"
        :live="!leaf"
      />
      <slot
        name="page"
        :target="leaf ? (leaf.dir === 'next' ? leaf.to : leaf.from) : shown"
        side="recto"
        :live="!leaf"
      />
    </template>
    <slot
      v-else
      name="page"
      :target="leaf ? (leaf.dir === 'next' ? leaf.to : leaf.from) : shown"
      side="recto"
      :live="!leaf"
    />

    <div v-if="leaf" ref="leafEl" class="ob-leaf" :data-mode="mode" aria-hidden="true">
      <!-- The shadow the lifting paper throws on the page it uncovers. -->
      <div ref="castClip" class="ob-leaf-layer" data-layer="cast"><span ref="cast" class="ob-curl-strip" data-strip="cast" /></div>
      <!-- The face, cut by the fold. -->
      <div ref="frontClip" class="ob-leaf-layer" data-layer="front">
        <slot name="page" :target="leaf.dir === 'next' ? leaf.from : leaf.to" side="recto" :live="false" />
        <span ref="frontCrease" class="ob-curl-strip" data-strip="front" />
      </div>
      <!-- What is folded over: the back of the leaf, mirrored across the fold. -->
      <div ref="backClip" class="ob-leaf-layer" data-layer="back">
        <div ref="backPage" class="ob-leaf-backpage">
          <template v-if="mode === 'spread'">
            <slot name="page" :target="leaf.dir === 'next' ? leaf.to : leaf.from" side="verso" :live="false" />
          </template>
          <section v-else class="ob-page ob-paper" data-side="verso" />
        </div>
        <span ref="backCrease" class="ob-curl-strip" data-strip="back" />
      </div>
    </div>
    <slot />
  </div>
</template>
