<template>
  <div
    ref="rootEl"
    class="nb-pin"
    data-pin
    :data-id="face.id"
    :data-status="face.status"
    :data-phase="phase"
    :class="{ 'is-selected': selected, 'is-dragging': dragging, 'is-editable': editable }"
    :style="rootStyle"
  >
    <template v-if="phase !== 'stub'">
      <div ref="castEl" class="nb-cast" aria-hidden="true" />
    </template>
    <NoticePinStub
      v-if="phase !== 'up'"
      :face="face"
      :open="stubOpen"
      :interactive="phase === 'stub'"
      @toggle="onStubToggle"
    />
    <div v-if="phase !== 'stub'" ref="liftEl" class="nb-lift" aria-hidden="true">
      <div class="nb-tilt" :style="tiltStyle">
        <NoticePinFace :face="face" />
      </div>
    </div>

    <span class="nb-tack" :data-tack="tack" aria-hidden="true">
      <img v-if="!tackFailed" :src="tackUrl(tack)" alt="" draggable="false" @error="tackFailed = true" />
    </span>

    <!-- The real control, over the visual scatter, so reading order is the order given. -->
    <button
      v-if="phase === 'up'"
      type="button"
      class="nb-hit"
      :aria-label="pinLabel(face)"
      :aria-pressed="editable ? selected : undefined"
      @click="onClick"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * One pin on the board: its paper hung from a tack, a stub once taken, and the physical shadows that make it read as
 * pinned rather than stuck on. There is one light, top left, so the contact shadow (a filter) sits on an unrotated
 * wrapper while the tilt lives on its child, and the cast shadow is a separate silhouette that carries the tilt but
 * not the light's direction. A taken notice tears off on every screen that was watching.
 *
 * x/y is the pin's top-left corner as a fraction of the board before it is tilted; the tilt turns it about its tack.
 */
import { computed, nextTick, ref, watch } from "vue";
import { canAnimate, whenSettled } from "@/lib/motion";
import { edgeFor, tackUrl } from "@/lib/noticeBoard/art";
import { pinLabel } from "@/lib/noticeBoard/faces";
import { keepOnBoard, pinSize, seededRotation, seededTack } from "@/lib/noticeBoard/geometry";
import type { NoticePinFace as Face } from "@/types/noticeBoard.types";
import NoticePinFace from "./NoticePinFace.vue";
import NoticePinStub from "./NoticePinStub.vue";

const { face, editable = false, selected = false } = defineProps<{
  face: Face;
  editable?: boolean;
  selected?: boolean;
}>();
const emit = defineEmits<{
  select: [id: string, origin: HTMLElement];
  move: [id: string, x: number, y: number];
}>();

const rootEl = ref<HTMLElement | null>(null);
const liftEl = ref<HTMLElement | null>(null);
const castEl = ref<HTMLElement | null>(null);

const size = computed(() => pinSize(face.style, face.size));
const tilt = computed(() => seededRotation(face.id));
const tack = computed(() => seededTack(face.id, face.style));
const tackFailed = ref(false);

// ── Position and drag ────────────────────────────────────────────────────────

const live = ref<{ x: number; y: number } | null>(null);
const dragging = ref(false);
const pos = computed(() => live.value ?? { x: face.x, y: face.y });

const rootStyle = computed(() => ({
  left: `${pos.value.x * 100}%`,
  top: `${pos.value.y * 100}%`,
  width: `calc(var(--u) * ${size.value.w})`,
  height: `calc(var(--u) * ${size.value.h})`,
  "--tilt": `${tilt.value}deg`,
  "--nb-edge": edgeFor(face.style),
}));
const tiltStyle = computed(() => ({ transform: `rotate(${tilt.value}deg)` }));

const DRAG_THRESHOLD = 4;
let press: { id: number; x: number; y: number; fx: number; fy: number; w: number; h: number } | null = null;
let suppressClick = false;

function onPointerDown(event: PointerEvent) {
  if (!editable || event.button !== 0) return;
  const board = rootEl.value?.closest<HTMLElement>("[data-board]");
  if (!board) return;
  const rect = board.getBoundingClientRect();
  if (rect.width === 0) return;
  // The viewport pans on a drag; a pin being arranged must not also pan the board under it.
  event.stopPropagation();
  press = { id: event.pointerId, x: event.clientX, y: event.clientY, fx: face.x, fy: face.y, w: rect.width, h: rect.height };
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

function dropAt(event: PointerEvent): { x: number; y: number } | null {
  if (!press || event.pointerId !== press.id) return null;
  return keepOnBoard(press.fx + (event.clientX - press.x) / press.w, press.fy + (event.clientY - press.y) / press.h, face.style, face.size);
}

function onPointerMove(event: PointerEvent) {
  if (!press || event.pointerId !== press.id) return;
  if (!dragging.value && Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_THRESHOLD) return;
  dragging.value = true;
  live.value = dropAt(event);
}

function onPointerUp(event: PointerEvent) {
  const at = dragging.value ? dropAt(event) : null;
  press = null;
  if (!at) return;
  // The click that follows a drag is not a selection.
  suppressClick = true;
  dragging.value = false;
  emit("move", face.id, at.x, at.y);
  // The caller writes the new position back through `face`; until it does the pin stays where it was dropped.
  watch(
    () => [face.x, face.y],
    () => {
      live.value = null;
    },
    { once: true },
  );
}

function onPointerCancel() {
  press = null;
  dragging.value = false;
  live.value = null;
}

function onClick() {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (rootEl.value) emit("select", face.id, rootEl.value);
}

// ── Taken: tear-off, then the stub ───────────────────────────────────────────

type Phase = "up" | "tearing" | "stub";
const phase = ref<Phase>(face.status === "taken" ? "stub" : "up");
const stubOpen = ref(false);

function onStubToggle() {
  stubOpen.value = !stubOpen.value;
  if (editable && rootEl.value) emit("select", face.id, rootEl.value);
}

const TEAR_MS = 900;

watch(
  () => face.status,
  async (status, was) => {
    stubOpen.value = false;
    if (status !== "taken") {
      phase.value = "up";
      return;
    }
    if (was !== "up") {
      phase.value = "stub";
      return;
    }
    const lift = liftEl.value;
    const cast = castEl.value;
    if (!lift || !cast || !canAnimate(lift)) {
      // Reduced motion drops the movement; the shadows were never part of it.
      phase.value = "stub";
      return;
    }
    phase.value = "tearing";
    await nextTick();
    const u = (rootEl.value?.offsetWidth ?? 0) / size.value.w;
    const px = (n: number) => `${n * u}px`;
    const origin = `50% ${px(20)}`;
    lift.style.transformOrigin = origin;
    const timing = { duration: TEAR_MS, easing: "cubic-bezier(0.5, 0, 0.9, 0.6)", fill: "forwards" as const };
    const t = tilt.value;
    // Lifted off the board, the cast shadow grows and softens with the height; then a small twist and away.
    const paper = lift.animate(
      [
        { transform: "none", opacity: 1 },
        { offset: 0.3, transform: `translate(0, ${px(-8)}) scale(1.05) rotate(-3deg)`, opacity: 1 },
        { transform: `translate(${px(70)}, ${px(-130)}) scale(1.12) rotate(14deg)`, opacity: 0 },
      ],
      timing,
    );
    const shadow = cast.animate(
      [
        { transform: `translate(${px(5)}, ${px(7)}) rotate(${t}deg) scale(1.035)`, opacity: 1 },
        { offset: 0.3, transform: `translate(${px(11)}, ${px(3)}) rotate(${t - 3}deg) scale(1.09)`, opacity: 1 },
        { transform: `translate(${px(85)}, ${px(-110)}) rotate(${t + 14}deg) scale(1.16)`, opacity: 0 },
      ],
      timing,
    );
    whenSettled([paper, shadow], () => {
      phase.value = "stub";
    });
  },
);
</script>

<style scoped>
.nb-pin {
  position: absolute;
  /* The pin turns about its tack, which hangs 20 units below its top edge. */
  --tack-y: calc(var(--u) * 20);
}
.nb-pin.is-editable .nb-hit {
  cursor: grab;
  touch-action: none;
}
.nb-pin.is-dragging {
  z-index: 5;
}
.nb-pin.is-dragging .nb-hit {
  cursor: grabbing;
}
.nb-hit {
  position: absolute;
  inset: 0;
  z-index: 3;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.nb-hit:focus-visible {
  outline: calc(var(--u) * 3) solid #f4d06f;
  outline-offset: calc(var(--u) * 4);
}
.nb-pin.is-selected .nb-hit {
  outline: calc(var(--u) * 3) dashed #f4d06f;
  outline-offset: calc(var(--u) * 4);
}

.nb-lift,
.nb-cast {
  position: absolute;
  inset: 0;
  transform-origin: 50% var(--tack-y);
  pointer-events: none;
}
.nb-lift {
  filter: drop-shadow(calc(var(--u) * 1) calc(var(--u) * 1.5) calc(var(--u) * 0.6) rgb(0 0 0 / 0.35));
  transition: transform 160ms ease-out;
}
.nb-tilt {
  width: 100%;
  height: 100%;
  transform-origin: 50% var(--tack-y);
}
/* Same box, same torn edge, no content: the paper's shadow. It is scaled and offset from the tack, so it falls further
   from the board the farther it is from the pin, and its offset is not rotated with the paper. */
.nb-cast {
  box-sizing: border-box;
  transform: translate(calc(var(--u) * 5), calc(var(--u) * 7)) rotate(var(--tilt)) scale(1.035);
  border: calc(var(--u) * 2) solid transparent;
  border-image: var(--nb-edge) 12 fill / calc(var(--u) * 12) / calc(var(--u) * 7) round;
  filter: brightness(0) blur(calc(var(--u) * 3));
  opacity: 0.28;
  transition:
    transform 160ms ease-out,
    filter 160ms ease-out,
    opacity 160ms ease-out;
}
/* Leaning in lifts the paper: the shadow stands further off the board and goes softer. */
.nb-pin:hover:not(.is-dragging) .nb-cast,
.nb-pin:focus-within .nb-cast,
.nb-pin.is-selected .nb-cast,
.nb-pin.is-dragging .nb-cast {
  transform: translate(calc(var(--u) * 9), calc(var(--u) * 12)) rotate(var(--tilt)) scale(1.06);
  filter: brightness(0) blur(calc(var(--u) * 4.5));
  opacity: 0.24;
}
.nb-pin:hover:not(.is-dragging) .nb-lift,
.nb-pin:focus-within .nb-lift,
.nb-pin.is-selected .nb-lift,
.nb-pin.is-dragging .nb-lift {
  transform: translate(calc(var(--u) * -1), calc(var(--u) * -2)) scale(1.012);
}
@media (prefers-reduced-motion: reduce) {
  .nb-lift,
  .nb-cast {
    transition: none;
  }
  .nb-pin:hover:not(.is-dragging) .nb-lift,
  .nb-pin:focus-within .nb-lift,
  .nb-pin.is-selected .nb-lift,
  .nb-pin.is-dragging .nb-lift {
    transform: none;
  }
}

.nb-tack {
  position: absolute;
  left: 50%;
  top: var(--tack-y);
  z-index: 2;
  width: calc(var(--u) * 34);
  height: calc(var(--u) * 34);
  transform: translate(-50%, -50%);
  border-radius: 50%;
  pointer-events: none;
  /* The highest thing on the board: tight contact, a long cast. Missing art leaves a coloured dot. */
  background: var(--tack-dot, #b8862b);
  filter: drop-shadow(calc(var(--u) * 1.5) calc(var(--u) * 2) calc(var(--u) * 0.5) rgb(0 0 0 / 0.55))
    drop-shadow(calc(var(--u) * 6) calc(var(--u) * 8) calc(var(--u) * 1.25) rgb(0 0 0 / 0.4));
}
.nb-tack[data-tack="tack-iron"] {
  --tack-dot: #3b3b40;
}
.nb-tack[data-tack="tack-red"] {
  --tack-dot: #b3261e;
}
.nb-tack[data-tack="tack-blue"] {
  --tack-dot: #2b5fa8;
}
.nb-tack[data-tack="tack-green"] {
  --tack-dot: #3d7a3a;
}
.nb-tack[data-tack="nail"] {
  --tack-dot: #4a4a50;
  width: calc(var(--u) * 28);
  height: calc(var(--u) * 28);
}
.nb-tack img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.nb-tack:has(img) {
  background: none;
}
</style>
