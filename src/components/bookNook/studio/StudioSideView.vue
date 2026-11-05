<template>
  <div ref="area" class="relative flex size-full min-h-0 items-center justify-center p-4" aria-label="Side view">
    <div
      v-if="size.width > 0"
      class="@container relative touch-none select-none overflow-hidden rounded-sm bg-black text-white/75 shadow-lg ring-1 ring-border"
      :style="{ width: `${size.width}px`, height: `${size.height}px` }"
      data-testid="side-stage"
      @pointerdown.self="emit('select', null)"
    >
      <!-- You: the eye every depth is measured from. -->
      <div class="pointer-events-none absolute left-[2%] flex flex-col items-center gap-1" :style="{ bottom: `${FLOOR_BOTTOM + 14}%` }">
        <IconReveal class="size-6 text-white" aria-hidden="true" />
        <span class="text-label uppercase tracking-wider">You</span>
      </div>

      <!-- The two bounds the engine refuses to pass: past them the drift pulls the picture apart. -->
      <div
        v-for="bound in BOUNDS"
        :key="bound.key"
        class="pointer-events-none absolute inset-y-0 border-l border-dashed transition-colors"
        :class="refusing === bound.key ? 'border-destructive' : 'border-white/20'"
        :style="{ left: `${bound.x}%` }"
        aria-hidden="true"
      >
        <span
          class="absolute top-2 whitespace-nowrap px-1 text-label tracking-wider"
          :class="[bound.key === 'near' ? 'left-0' : 'right-0', refusing === bound.key ? 'text-destructive' : 'text-white/45']"
        >{{ bound.label }}</span>
      </div>
      <p v-if="refusing" class="pointer-events-none absolute inset-x-0 top-8 text-center text-caption text-destructive" role="status">
        {{ refusing === "near" ? `Nearer than ${DEPTH.max}` : `Further than ${DEPTH.min}` }} is refused: past that, the drift pulls the picture apart.
      </p>

      <!-- The floor, and the bands under it. -->
      <div class="pointer-events-none absolute inset-x-0 bottom-0 border-t border-white/30 bg-white/5" :style="{ height: `${FLOOR_BOTTOM}%` }" aria-hidden="true" />
      <div
        v-for="band in BANDS"
        :key="band.word"
        class="pointer-events-none absolute flex -translate-x-1/2 flex-col gap-1 px-1"
        :style="{ left: `${band.x}%`, bottom: '1%', width: '22%' }"
        data-testid="depth-band"
      >
        <p class="truncate text-label uppercase tracking-wider text-white">{{ band.word }} <span class="text-white/60">· {{ band.depth }}</span></p>
        <p class="hidden truncate text-caption text-white/55 @md:block">{{ band.caption }}</p>
        <span class="block h-1 rounded-full bg-white/10" aria-hidden="true">
          <span class="block h-full rounded-full bg-primary" :style="{ width: `${(band.depth / DEPTH.max) * 100}%` }" />
        </span>
      </div>

      <!-- Cut-outs standing on the floor, each at the place its depth gives it, drawn as a flat seen at an angle. -->
      <button
        v-for="card in cards"
        :key="card.key"
        type="button"
        :class="[
          'absolute outline-offset-2 outline-primary focus-visible:outline-2',
          card.picture ? 'cursor-pointer' : 'cursor-ew-resize',
          card.selected ? 'z-10' : '',
        ]"
        :style="card.style"
        :aria-label="card.label"
        :aria-pressed="card.selected"
        :data-testid="`side-card-${card.id}`"
        @pointerdown="onDown($event, card)"
        @pointermove="onMove($event)"
        @pointerup="onUp($event)"
        @pointercancel="onUp($event)"
        @keydown="onKey($event, card)"
      >
        <span
          class="block size-full overflow-hidden rounded-sm bg-white/5"
          :class="card.selected ? 'ring-2 ring-primary' : 'ring-1 ring-white/30'"
        >
          <img :src="card.src" alt="" draggable="false" class="size-full object-contain" />
        </span>
        <span
          v-if="card.selected"
          class="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-black/70 px-1 text-label tabular-nums text-white"
        >{{ card.name }} · {{ card.depthText }}</span>
      </button>

      <!-- Touches, as small labelled chips at their depth. -->
      <AppButton
        v-for="chip in chips"
        :key="chip.key"
        variant="tool"
        size="xs"
        :active="chip.selected"
        class="absolute -translate-x-1/2 cursor-ew-resize"
        :style="chip.style"
        :aria-label="chip.label"
        :aria-pressed="chip.selected"
        :data-testid="`side-chip-${chip.key}`"
        @pointerdown="onDown($event, chip)"
        @pointermove="onMove($event)"
        @pointerup="onUp($event)"
        @pointercancel="onUp($event)"
        @keydown="onKey($event, chip)"
      >{{ chip.name }}</AppButton>

      <div v-if="still" class="absolute inset-x-3 top-14 flex justify-center">
        <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md border border-border bg-card px-3 py-2 text-card-foreground shadow-lg" role="status">
          <p class="text-body">Breathing is set to Still, so depth changes nothing you can see yet.</p>
          <AppButton variant="outline" size="sm" label="Breathe gently" @click="emit('breathe')" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useElementSize } from "@vueuse/core";
import AppButton from "@/components/common/controls/AppButton.vue";
import { breathingOf, depthBand, effectLabel, layerName, PICTURE_ID, targetKey, type StudioOp, type Target } from "@/lib/bookNook/edit";
import { standingGroup } from "@/lib/bookNook/depthGroups";
import { clampDepth, DEPTH } from "@/lib/bookNook/presets";
import { layersOf, type Layer, type Scene } from "@/lib/bookNook/scene";
import { fitStage, screenOf, type StudioScreen } from "@/lib/bookNook/stageGeometry";
import { IconReveal } from "@/lib/icons";

/**
 * The side view (frame 04): a toy theatre seen from the side. Depth is one place on a line per thing, near the
 * eye on the left, far on the right; dragging a card along the floor sets it, and what stands on it comes
 * along. The picture is the Picture mark and does not move. The view owns no scene: it reports every change as
 * a `StudioOp`, one depth op per thing that moved. The cards are plain buttons because each is a stage object
 * drawn at an angle, not a control with chrome.
 */
const { scene, selection, aspects, screen } = defineProps<{
  scene: Scene;
  selection: Target | null;
  /** Each layer's image height over its width, by id. */
  aspects: ReadonlyMap<string, number>;
  /** The screen the front stage is showing, so both stages are the same size. */
  screen: StudioScreen;
}>();
const emit = defineEmits<{
  select: [target: Target | null];
  op: [op: StudioOp];
  /** "Breathe gently" in the notice that depth shows nothing while the room is still. */
  breathe: [];
}>();

// Percent of the stage. The floor is the line the cards stand on; x runs from the nearest depth (left) to the furthest.
const FLOOR_BOTTOM = 24;
const X_NEAR = 16;
const X_FAR = 90;
/** The picture card's width, as a share of the stage; a cut-out is drawn at its share of the room's width. */
const PICTURE_SHARE = 30;
const MAX_HEIGHT = 62;
const FAN = 3.5;
const STEP = 0.05;
const BIG_STEP = 0.2;
const PERSPECTIVE = "perspective(40rem) rotateY(-48deg)";

const xOf = (depth: number) => X_NEAR + ((DEPTH.max - clampDepth(depth)) / (DEPTH.max - DEPTH.min)) * (X_FAR - X_NEAR);
const round2 = (n: number) => Math.round(n * 100) / 100;

const BOUNDS = [
  { key: "near", x: X_NEAR, label: `${DEPTH.max} nearest` },
  { key: "far", x: X_FAR, label: `${DEPTH.min} furthest` },
] as const;
const BANDS = [
  { word: "Near", depth: DEPTH.near, x: xOf(DEPTH.near), caption: "Closest to you: moves most" },
  { word: "Picture", depth: DEPTH.picture, x: xOf(DEPTH.picture), caption: "The room and all that stands in it" },
  { word: "Far", depth: DEPTH.far, x: xOf(DEPTH.far), caption: "Furthest away: moves least" },
];

const area = ref<HTMLElement | null>(null);
const available = useElementSize(area);
const info = computed(() => screenOf(screen));
const size = computed(() => fitStage({ width: available.width.value - 32, height: available.height.value - 32 }, info.value.aspect));
const still = computed(() => breathingOf(scene.camera) === "still");

// ── What is drawn ─────────────────────────────────────────────────────────────────────────────────────────────
interface Mover {
  key: string;
  target: Target;
  depth: number;
  picture: boolean;
}
interface Card extends Mover {
  id: string;
  src: string;
  name: string;
  label: string;
  depthText: string;
  selected: boolean;
  style: Record<string, string>;
}
interface Chip extends Mover {
  name: string;
  label: string;
  selected: boolean;
  style: Record<string, string>;
}

const selectedKey = computed(() => (selection ? targetKey(selection) : null));
const wordFor = (depth: number) => depthBand(depth);

const cards = computed<Card[]>(() => {
  const { width, height } = size.value;
  if (height === 0) return [];
  const taken = new Map<number, number>();
  const cardSize = (layer: Layer) => {
    const aspect = aspects.get(layer.id) ?? 1;
    const w = Math.max(6, (layer.width / scene.size.width) * PICTURE_SHARE);
    const natural = w * aspect * (width / height);
    const shrink = natural > MAX_HEIGHT ? MAX_HEIGHT / natural : 1;
    return { w, natural, shrink };
  };
  const plate = layersOf(scene).find((layer) => layer.id === PICTURE_ID);
  const plateWidth = plate ? cardSize(plate).w * cardSize(plate).shrink : 0;
  return layersOf(scene).map((layer) => {
    const picture = layer.id === PICTURE_ID;
    const target: Target = { kind: "layer", id: layer.id };
    const { w, natural, shrink } = cardSize(layer);
    // Things at one depth fan out toward you, so none hides another. Those that share the picture's depth stand
    // just in front of its near edge rather than inside it, where a small cut-out (a kettle) would vanish.
    const slot = picture ? 0 : (taken.get(layer.depth) ?? 0) + 1;
    if (!picture) taken.set(layer.depth, slot);
    const besidePicture = !picture && plate !== undefined && layer.depth === plate.depth;
    const offset = besidePicture ? plateWidth / 2 + (w * shrink) / 2 + (slot - 1) * (w * shrink + 1.5) : slot * FAN;
    const name = layerName(layer.id, layer.name);
    const key = targetKey(target);
    return {
      key,
      id: layer.id,
      target,
      depth: layer.depth,
      picture,
      src: layer.src,
      name,
      depthText: picture ? "Picture" : round2(layer.depth).toFixed(2),
      label: picture ? `${name}, the Picture mark at depth 1` : `${name}, ${wordFor(layer.depth)}, depth ${round2(layer.depth)}. Left is nearer, right is further.`,
      selected: key === selectedKey.value,
      style: {
        left: `${xOf(layer.depth) - offset}%`,
        bottom: `${FLOOR_BOTTOM}%`,
        width: `${w * shrink}%`,
        height: `${natural * shrink}%`,
        transform: `translateX(-50%) ${PERSPECTIVE}`,
        transformOrigin: "50% 100%",
        zIndex: String(slot + 1),
      },
    };
  });
});

const chips = computed<Chip[]>(() => {
  const rows = new Map<number, number>();
  const out: Chip[] = [];
  scene.stack.forEach((item, index) => {
    if (item.kind === "layer") return;
    const target: Target = { kind: "effect", index };
    const row = rows.get(item.depth) ?? 0;
    rows.set(item.depth, row + 1);
    const key = targetKey(target);
    const name = effectLabel(item);
    out.push({
      key,
      target,
      depth: item.depth,
      picture: false,
      name,
      label: `${name}, ${wordFor(item.depth)}, depth ${round2(item.depth)}. Left is nearer, right is further.`,
      selected: key === selectedKey.value,
      style: { left: `${xOf(item.depth)}%`, top: `${14 + row * 8}%` },
    });
  });
  return out;
});

// ── Dragging ──────────────────────────────────────────────────────────────────────────────────────────────────
const refusing = ref<"near" | "far" | null>(null);
let refuseTimer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(refuseTimer));
function refuse(side: "near" | "far", timed: boolean) {
  refusing.value = side;
  clearTimeout(refuseTimer);
  if (!timed) return;
  refuseTimer = setTimeout(() => (refusing.value = null), 1800);
}

interface Drag {
  pointer: number;
  startX: number;
  /** What moves, and the depth each started at. */
  members: { target: Target; depth: number }[];
  applied: number;
}
let drag: Drag | null = null;

/** What moves with `mover`: a layer takes along what stands on it; a touch goes alone. */
function membersOf(mover: Mover): Drag["members"] {
  if (mover.target.kind === "effect") return [{ target: mover.target, depth: mover.depth }];
  const layers = layersOf(scene);
  return standingGroup(scene, mover.target.id, aspects).flatMap((id) => {
    const layer = layers.find((l) => l.id === id);
    return layer ? [{ target: { kind: "layer", id } as Target, depth: layer.depth }] : [];
  });
}

/** Moves every member by `delta`, held within the engine's bounds as one group so none is left behind. */
function shift(members: Drag["members"], delta: number, timed: boolean): number {
  const lo = Math.max(...members.map((m) => DEPTH.min - m.depth));
  const hi = Math.min(...members.map((m) => DEPTH.max - m.depth));
  const clamped = Math.min(hi, Math.max(lo, delta));
  if (delta > hi + 1e-9) refuse("near", timed);
  else if (delta < lo - 1e-9) refuse("far", timed);
  else refusing.value = null;
  for (const m of members) emit("op", { op: "depth", target: m.target, depth: round2(m.depth + clamped) });
  return clamped;
}

function onDown(event: PointerEvent, mover: Mover) {
  emit("select", mover.target);
  if (mover.picture || event.button !== 0) return;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  drag = { pointer: event.pointerId, startX: event.clientX, members: membersOf(mover), applied: 0 };
}

function onMove(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointer || size.value.width === 0) return;
  // Moving right by the stage's whole drawn range is the whole depth range the other way.
  const perPixel = (DEPTH.max - DEPTH.min) / (((X_FAR - X_NEAR) / 100) * size.value.width);
  const delta = round2(-(event.clientX - drag.startX) * perPixel);
  if (delta === drag.applied) return;
  drag.applied = shift(drag.members, delta, false);
}

function onUp(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointer) return;
  drag = null;
  refusing.value = null;
}

function onKey(event: KeyboardEvent, mover: Mover) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  if (mover.picture) return;
  const step = event.shiftKey ? BIG_STEP : STEP;
  // Left is nearer the eye, so it takes depth up.
  shift(membersOf(mover), event.key === "ArrowLeft" ? step : -step, true);
}
</script>
