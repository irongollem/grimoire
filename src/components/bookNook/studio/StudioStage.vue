<template>
  <div ref="area" class="relative flex size-full min-h-0 items-center justify-center p-4">
    <div
      v-if="size.width > 0"
      class="relative touch-none select-none overflow-hidden rounded-sm bg-black shadow-lg ring-1 ring-border"
      :style="{ width: `${size.width}px`, height: `${size.height}px` }"
      data-testid="stage"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="endGrab"
      @pointercancel="endGrab"
    >
      <canvas
        ref="canvas"
        class="absolute inset-0 size-full"
        :width="pixels.width"
        :height="pixels.height"
        role="img"
        :aria-label="`${scene.title}, as the ${screenInfo.label} shows it`"
      />

      <!-- The selected thing: a dashed gilt outline of where it is drawn, corner handles, and the pin (the
           anchor, an oxblood dot) that moves the anchor without moving the picture. Handles and pin are small to
           see and larger to grab: an invisible margin round each takes the press. -->
      <div v-if="overlay" class="pointer-events-none absolute inset-0" aria-hidden="true">
        <div
          class="absolute border-2 border-dashed border-primary"
          :style="boxStyle(overlay.rect)"
          :class="overlay.kind === 'effect' ? 'pointer-events-auto cursor-move' : ''"
          :data-grab="overlay.kind === 'effect' ? 'effect' : undefined"
        />
        <template v-if="overlay.kind === 'layer'">
          <span
            v-for="corner in CORNERS"
            :key="corner.id"
            class="pointer-events-auto absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-sm border border-primary bg-card after:absolute after:-inset-2 after:content-['']"
            :style="{ left: `${overlay.rect.x + corner.fx * overlay.rect.w}px`, top: `${overlay.rect.y + corner.fy * overlay.rect.h}px` }"
            :data-grab="`corner-${corner.id}`"
          />
        </template>
        <span
          class="pointer-events-auto absolute size-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-card bg-destructive shadow after:absolute after:-inset-2 after:rounded-full after:content-['']"
          :style="{ left: `${overlay.pin.x}px`, top: `${overlay.pin.y}px` }"
          :data-grab="overlay.kind === 'layer' ? 'pin' : 'effect'"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchPostEffect } from "vue";
import { useElementSize } from "@vueuse/core";
import { useHotkeys } from "@/composables/useHotkeys";
import { effectPoint, PICTURE_ID, withHidden, type StudioOp, type Target } from "@/lib/bookNook/edit";
import { windowFor } from "@/lib/bookNook/framing";
import { drawScene, framedImages, type Images } from "@/lib/bookNook/render";
import { layersOf, type Layer, type Point, type Rect, type Scene, type View } from "@/lib/bookNook/scene";
import {
  anchorScreenPoint, fitStage, hitLayer, widthFromCornerDrag, imagePointAt, layerScreenRect, projectorFor, screenDeltaToRoom, screenOf,
  type StudioScreen,
} from "@/lib/bookNook/stageGeometry";

/**
 * The studio's stage (frame 03, Front view): the scene drawn through one screen's window, as that screen will
 * show it, with the selected thing outlined over it. A press selects the topmost layer under the pointer and,
 * on a cut-out, starts moving it; the corners resize it; the pin moves the anchor. The stage owns no scene: it
 * draws what it is given and reports every change as a `StudioOp`. Arrow keys nudge the selection.
 */
const { scene, images, aspects, ready, screen, t, selection, hidden } = defineProps<{
  scene: Scene;
  images: Images;
  /** Each layer's image height over width, by id. */
  aspects: ReadonlyMap<string, number>;
  /** Every layer's image has loaded. */
  ready: boolean;
  screen: StudioScreen;
  /** The playhead, seconds into the loop. */
  t: number;
  selection: Target | null;
  hidden: ReadonlySet<string>;
}>();

const emit = defineEmits<{
  select: [target: Target | null];
  op: [op: StudioOp];
  /** A press on the stage is held; the clock stands still until it lets go. */
  grab: [held: boolean];
}>();

/** Where each corner handle sits on the outline. A corner drag resizes about the pin, wherever the corner is. */
const CORNERS = [
  { id: "nw", fx: 0, fy: 0 },
  { id: "ne", fx: 1, fy: 0 },
  { id: "sw", fx: 0, fy: 1 },
  { id: "se", fx: 1, fy: 1 },
] as const;

const area = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const available = useElementSize(area);

const screenInfo = computed(() => screenOf(screen));
const size = computed(() => fitStage({ width: available.width.value - 32, height: available.height.value - 32 }, screenInfo.value.aspect));
const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 1.5);
const pixels = computed(() => ({ width: Math.round(size.value.width * pixelRatio()), height: Math.round(size.value.height * pixelRatio()) }));

const view = computed<View>(() => ({ window: windowFor(scene, screenInfo.value.window), breathe: 1 }));
// The frame belongs to the TV and the phone; the Atlas picture sits in a page and has none.
const framed = computed(() => (screen === "atlas" ? null : screenInfo.value.window));
const drawnImages = computed(() => framedImages(images, framed.value));
const layers = computed(() => layersOf(scene));
const projector = computed(() => projectorFor(scene, size.value, view.value, t));

watchPostEffect(() => {
  const el = canvas.value;
  if (!el || !ready || pixels.value.width === 0) return;
  const ctx = el.getContext("2d");
  if (!ctx) return;
  const drawn = withHidden(scene, hidden);
  drawScene(ctx, framed.value ? drawn : { ...drawn, frame: undefined }, drawnImages.value, t, view.value);
});

// ── The selected thing ────────────────────────────────────────────────────────────────────────────────────────
const selectedLayer = computed<Layer | null>(() => {
  const s = selection;
  return s?.kind === "layer" ? (layers.value.find((l) => l.id === s.id) ?? null) : null;
});
const movableLayer = computed(() => (selectedLayer.value && selectedLayer.value.id !== PICTURE_ID ? selectedLayer.value : null));

type Overlay = { kind: "layer" | "effect"; rect: Rect; pin: Point };
const overlay = computed<Overlay | null>(() => {
  const layer = movableLayer.value;
  const aspect = layer ? aspects.get(layer.id) : undefined;
  if (layer && aspect !== undefined) return { kind: "layer", rect: layerScreenRect(projector.value, layer, aspect), pin: anchorScreenPoint(projector.value, layer) };
  const s = selection;
  if (s?.kind !== "effect") return null;
  const effect = scene.stack[s.index];
  if (!effect || effect.kind === "layer") return null;
  const p = projector.value;
  const point = effectPoint(effect);
  if ("area" in effect) {
    const a = p.toScreen({ x: effect.area.x, y: effect.area.y }, effect.depth);
    const k = p.lengthScale(effect.depth);
    return { kind: "effect", rect: { x: a.x, y: a.y, w: effect.area.w * k, h: effect.area.h * k }, pin: p.toScreen(point, effect.depth) };
  }
  const pin = p.toScreen(point, effect.depth);
  return { kind: "effect", rect: { x: pin.x, y: pin.y, w: 0, h: 0 }, pin };
});

const boxStyle = (r: Rect) => ({ left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });

// ── Grabbing ──────────────────────────────────────────────────────────────────────────────────────────────────
type Grab =
  | { kind: "move"; target: Target; from: Point; origin: Point; depth: number }
  | { kind: "corner"; id: string; from: Point; pin: Point; width: number }
  | { kind: "pin"; id: string; aspect: number };
let grab: Grab | null = null;

function local(event: PointerEvent): Point {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

function begin(event: PointerEvent, next: Grab) {
  grab = next;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  emit("grab", true);
}

function onPointerDown(event: PointerEvent) {
  const point = local(event);
  const handle = (event.target as HTMLElement).closest<HTMLElement>("[data-grab]")?.dataset.grab;
  const layer = movableLayer.value;
  const aspect = layer ? aspects.get(layer.id) : undefined;
  if (layer && aspect !== undefined && handle === "pin") return begin(event, { kind: "pin", id: layer.id, aspect });
  if (layer && aspect !== undefined && handle?.startsWith("corner-")) {
    const corner = CORNERS.find((c) => `corner-${c.id}` === handle);
    if (corner) return begin(event, { kind: "corner", id: layer.id, from: point, pin: anchorScreenPoint(projector.value, layer), width: layer.width });
  }
  const s = selection;
  if (handle === "effect" && s?.kind === "effect") {
    const effect = scene.stack[s.index];
    if (effect && effect.kind !== "layer") return begin(event, { kind: "move", target: s, from: point, origin: effectPoint(effect), depth: effect.depth });
  }
  const hit = hitLayer(projector.value, layers.value, aspects, point);
  emit("select", hit ? { kind: "layer", id: hit.id } : null);
  if (hit && hit.id !== PICTURE_ID) {
    begin(event, { kind: "move", target: { kind: "layer", id: hit.id }, from: point, origin: hit.at, depth: hit.depth });
  }
}

function onPointerMove(event: PointerEvent) {
  if (!grab) return;
  const point = local(event);
  const g = grab;
  if (g.kind === "move") {
    const d = screenDeltaToRoom(projector.value, g.depth, point.x - g.from.x, point.y - g.from.y);
    emit("op", { op: "move", target: g.target, to: { x: g.origin.x + d.x, y: g.origin.y + d.y } });
  } else if (g.kind === "corner") {
    // About the pin, not the opposite corner: a kettle on a table keeps its feet on the table as it is resized.
    emit("op", { op: "resize", id: g.id, width: widthFromCornerDrag(g.width, g.pin, g.from, point) });
  } else {
    const layer = layers.value.find((l) => l.id === g.id);
    if (!layer) return;
    const p = imagePointAt(projector.value, layer, g.aspect, point);
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    emit("op", { op: "anchor", id: g.id, anchor: { x: clamp(p.x), y: clamp(p.y) }, aspect: g.aspect });
  }
}

function endGrab(event: PointerEvent) {
  if (!grab) return;
  grab = null;
  const el = event.currentTarget as HTMLElement;
  if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
  emit("grab", false);
}

// ── Arrow keys ────────────────────────────────────────────────────────────────────────────────────────────────
function nudge(event: KeyboardEvent, dx: number, dy: number) {
  const s = selection;
  if (!s) return;
  event.preventDefault();
  const step = event.shiftKey ? 10 : 1;
  const depth = s.kind === "layer" ? (movableLayer.value?.depth ?? 1) : ((scene.stack[s.index] as { depth: number } | undefined)?.depth ?? 1);
  const d = screenDeltaToRoom(projector.value, depth, dx * step, dy * step);
  const from =
    s.kind === "layer" ? movableLayer.value?.at : (() => { const e = scene.stack[s.index]; return e && e.kind !== "layer" ? effectPoint(e) : undefined; })();
  if (!from) return;
  emit("op", { op: "move", target: s, to: { x: from.x + d.x, y: from.y + d.y } });
}
const canNudge = computed(() => !!movableLayer.value || selection?.kind === "effect");
useHotkeys(
  () => [
    { combo: "arrowleft", description: "Nudge the selection left", handler: (e) => nudge(e, -1, 0) },
    { combo: "arrowright", description: "Nudge the selection right", handler: (e) => nudge(e, 1, 0) },
    { combo: "arrowup", description: "Nudge the selection up", handler: (e) => nudge(e, 0, -1) },
    { combo: "arrowdown", description: "Nudge the selection down", handler: (e) => nudge(e, 0, 1) },
    { combo: "shift+arrowleft", description: "Nudge the selection left, ten steps", handler: (e) => nudge(e, -1, 0) },
    { combo: "shift+arrowright", description: "Nudge the selection right, ten steps", handler: (e) => nudge(e, 1, 0) },
    { combo: "shift+arrowup", description: "Nudge the selection up, ten steps", handler: (e) => nudge(e, 0, -1) },
    { combo: "shift+arrowdown", description: "Nudge the selection down, ten steps", handler: (e) => nudge(e, 0, 1) },
  ],
  { enabled: canNudge },
);
</script>
