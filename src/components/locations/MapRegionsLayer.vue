<template>
  <canvas
    v-if="calibration"
    ref="canvasEl"
    class="absolute inset-0 h-full w-full"
    :class="mode === 'browse' && activeRegionId ? 'cursor-crosshair' : 'cursor-pointer'"
    @pointerdown="onPointerDown"
  />
</template>

<script setup lang="ts">
/**
 * The region overlay — a sibling of `MapPinsLayer` inside `MapFrame`'s slot,
 * so it inherits zoom/pan the same way pins and the image do. Moved out of
 * `SiteMapView.vue` (#807), which drew this same canvas in its own unzoomed
 * wrapper; the geometry (grid lines, cell rects, drag-to-paint) is carried
 * over unchanged from that component, only the coordinate source and mount
 * point differ — see `cellFromEvent` below.
 *
 * Deliberately no TanStack import for reads: `regions`/`calibration` arrive
 * as props from the composite (`LocationMap.vue`), which is what lets this
 * component stay a pure renderer + interaction layer, like `MapPinsLayer`.
 * It does own the one write that belongs to a canvas gesture rather than a
 * list button — committing a drag stroke's cells — the same split
 * `SiteMapRegionList.vue` already draws for bind/unbind/label/delete.
 */
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useUpdateLocationMapRegion } from "@/composables/locations/useLocationMapRegions";
import { useToast } from "@/composables/useToast";
import { cellAtImageFraction, cellRectInImageFractions, gridExtent } from "@/lib/gridCalibration";
import { isCellOnImageGrid, toggleCell } from "@/lib/locations/siteMap";
import { cellKey, type CellKey } from "@/types/dungeonMap.types";
import type { GridCalibration } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

const activeRegionId = defineModel<string | null>("activeRegionId", { default: null });

const {
  regions,
  calibration,
  imageNaturalWidth,
  imageNaturalHeight,
  mode,
  partyRoomId = null,
  reachableRoomIds = null,
  toImageFraction,
} = defineProps<{
  regions: LocationMapRegion[];
  calibration: GridCalibration | null;
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  /** Browse: tracing/select/navigate (the sheet, the Atlas pane). Run:
   *  click-to-move-party (`SiteRunSurface`). */
  mode: "browse" | "run";
  /** The room the party currently occupies. Only meaningful in run mode. */
  partyRoomId?: string | null;
  /** Rooms reachable from `partyRoomId` per the site's door graph. `null`
   *  means "nothing to be unreachable from yet" — every bound region renders
   *  and behaves as reachable. Only meaningful in run mode. */
  reachableRoomIds?: ReadonlySet<string> | null;
  /** The frame's client-coordinates → image-fraction conversion — the same
   *  one `MapPinsLayer` uses, so a click lands on the same cell the grid was
   *  drawn onto. See `MapFrame.vue`. */
  toImageFraction: (clientX: number, clientY: number) => { x: number; y: number } | null;
}>();

const emit = defineEmits<{ "move-party": [roomId: string] }>();

const router = useRouter();
const { error: toastError, fromError } = useToast();
const updateRegion = useUpdateLocationMapRegion();

const canvasEl = ref<HTMLCanvasElement | null>(null);

let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  resizeObserver = new ResizeObserver(() => renderOverlay());
});
onUnmounted(() => resizeObserver?.disconnect());
// The canvas is sized in CSS to exactly cover the rendered image box, so
// observing the canvas itself is sufficient to catch every resize that would
// move it out of alignment.
watch(canvasEl, (el, oldEl) => {
  if (oldEl) resizeObserver?.unobserve(oldEl);
  if (el) resizeObserver?.observe(el);
});

/** An in-flight drag stroke (#805 slice 2, carried over from `SiteMapView`).
 *  Kept outside Vue's reactivity — mutated by a pointer handler and read back
 *  by an explicit `renderOverlay()` call in that same handler, every time. */
interface Stroke {
  regionId: string;
  mode: "paint" | "erase";
  cells: CellKey[];
}
let stroke: Stroke | null = null;

/** The cells a finished stroke committed, drawn in place of the server's copy
 *  until the refetch carries them back — see `SiteMapView`'s original
 *  docstring for why (`useUpdateLocationMapRegion` invalidates rather than
 *  writing through, so the cache is stale by exactly one fetch). */
const pendingStroke = ref<{ regionId: string; cells: CellKey[] } | null>(null);

function sameCells(a: readonly CellKey[], b: readonly CellKey[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((k) => set.has(k));
}

watch(
  () => regions,
  (next) => {
    const pending = pendingStroke.value;
    if (!pending) return;
    const region = next.find((r) => r.id === pending.regionId);
    if (!region || sameCells(region.cells, pending.cells)) pendingStroke.value = null;
  },
);

/** Browse mode's palette: active-for-tracing blue, bound green, unbound
 *  amber. Run mode repurposes the same three slots for what a DM asks
 *  mid-session: party (blue), reachable (green), locked (stone grey rather
 *  than amber, so it doesn't read as "look here"), untraced nearly invisible. */
function regionFillColor(region: LocationMapRegion): string {
  if (mode === "run") {
    if (region.space_location_id === partyRoomId) return "rgba(96, 165, 250, 0.55)";
    if (!region.space_location_id) return "rgba(255, 255, 255, 0.04)";
    const reachable = !reachableRoomIds || reachableRoomIds.has(region.space_location_id);
    return reachable ? "rgba(74, 222, 128, 0.28)" : "rgba(120, 113, 108, 0.35)";
  }
  const isActive = region.id === activeRegionId.value;
  const bound = !!region.space_location_id;
  return isActive ? "rgba(96, 165, 250, 0.45)" : bound ? "rgba(74, 222, 128, 0.28)" : "rgba(251, 191, 36, 0.28)";
}

function renderOverlay(): void {
  const canvas = canvasEl.value;
  const cal = calibration;
  if (!canvas || !cal) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const w = imageNaturalWidth;
  const h = imageNaturalHeight;
  const { cols, rows } = gridExtent(cal, w, h);
  if (cols <= 0 || rows <= 0) return;

  const originCellX = cal.origin_cell_x ?? 0;
  const originCellY = cal.origin_cell_y ?? 0;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let ix = 0; ix <= cols; ix++) {
    const rect = cellRectInImageFractions(cellKey(ix + originCellX, originCellY), cal, w, h);
    const px = rect.x * canvas.width;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, canvas.height);
  }
  for (let iy = 0; iy <= rows; iy++) {
    const rect = cellRectInImageFractions(cellKey(originCellX, iy + originCellY), cal, w, h);
    const py = rect.y * canvas.height;
    ctx.moveTo(0, py);
    ctx.lineTo(canvas.width, py);
  }
  ctx.stroke();

  for (const region of regions) {
    const pending = pendingStroke.value;
    const cells =
      stroke && stroke.regionId === region.id
        ? stroke.cells
        : pending && pending.regionId === region.id
          ? pending.cells
          : region.cells;
    const isHighlighted = mode === "run" ? region.space_location_id === partyRoomId : region.id === activeRegionId.value;
    ctx.fillStyle = regionFillColor(region);
    for (const key of cells) {
      const rect = cellRectInImageFractions(key, cal, w, h);
      ctx.fillRect(rect.x * canvas.width, rect.y * canvas.height, rect.w * canvas.width, rect.h * canvas.height);
    }
    if (isHighlighted) {
      ctx.strokeStyle = "rgba(96, 165, 250, 0.9)";
      ctx.lineWidth = 2;
      for (const key of cells) {
        const rect = cellRectInImageFractions(key, cal, w, h);
        const x = rect.x * canvas.width;
        const y = rect.y * canvas.height;
        const cw = rect.w * canvas.width;
        const ch = rect.h * canvas.height;
        ctx.strokeRect(x + 1, y + 1, cw - 2, ch - 2);
      }
    }
  }
}

watch(
  [() => regions, () => calibration, activeRegionId, () => imageNaturalWidth, () => imageNaturalHeight, () => mode, () => partyRoomId, () => reachableRoomIds],
  () => renderOverlay(),
  { flush: "post", immediate: true },
);

// ── Interaction ───────────────────────────────────────────────────────────────

/** The map cell under a pointer event, in image-fraction space via the
 *  frame's own `toImageFraction` — the exact inverse of how the overlay
 *  draws a cell's rect back onto that same box. Null before an image has
 *  loaded, or when there is nothing calibrated to resolve against. */
function cellFromEvent(e: PointerEvent): CellKey | null {
  const cal = calibration;
  if (!cal || imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return null;
  const frac = toImageFraction(e.clientX, e.clientY);
  if (!frac) return null;
  return cellAtImageFraction(frac.x, frac.y, cal, imageNaturalWidth, imageNaturalHeight);
}

/**
 * Pointer tracking lives on `window`, not on the canvas's own template
 * bindings — the same idiom `MapPinsLayer`'s drag-to-reposition uses to
 * survive `MapFrame`'s `setPointerCapture`. The frame captures the pointer
 * to itself on every pointerdown it doesn't recognise as `placing`, which
 * retargets subsequent pointermove/pointerup away from any descendant's own
 * listeners — but not away from `window`, which every retargeted event still
 * bubbles through. This needs nothing new from the frame: unlike pin
 * placement, painting a region never needs to suppress the frame's own
 * pan/pinch handling, it just needs to keep tracking regardless of it.
 */
let pointerDownAt: { x: number; y: number } | null = null;
let movedBeyondTapThreshold = false;

function onPointerDown(e: PointerEvent): void {
  pointerDownAt = { x: e.clientX, y: e.clientY };
  movedBeyondTapThreshold = false;

  if (mode === "browse" && activeRegionId.value) {
    const region = regions.find((r) => r.id === activeRegionId.value);
    const cal = calibration;
    const key = region && cal ? cellFromEvent(e) : null;
    if (region && cal && key && isCellOnImageGrid(key, cal, imageNaturalWidth, imageNaturalHeight)) {
      stroke = {
        regionId: region.id,
        mode: region.cells.includes(key) ? "erase" : "paint",
        cells: toggleCell(region.cells, key),
      };
      renderOverlay();
    }
  }

  window.addEventListener("pointermove", onWindowPointerMove);
  window.addEventListener("pointerup", onWindowPointerUp, { once: true });
}

function onWindowPointerMove(e: PointerEvent): void {
  if (!pointerDownAt) return;
  if (Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y) > 6) {
    movedBeyondTapThreshold = true;
  }
  if (!stroke) return;
  const cal = calibration;
  if (!cal) return;
  const key = cellFromEvent(e);
  if (!key || !isCellOnImageGrid(key, cal, imageNaturalWidth, imageNaturalHeight)) return;
  const alreadyInStrokeDirection = stroke.mode === "paint" ? stroke.cells.includes(key) : !stroke.cells.includes(key);
  if (alreadyInStrokeDirection) return;
  stroke.cells = toggleCell(stroke.cells, key);
  renderOverlay();
}

/** Commits the whole stroke as one mutation, or — when no stroke started —
 *  resolves a plain, unmoved tap into a click on whatever region is under it. */
function onWindowPointerUp(e: PointerEvent): void {
  window.removeEventListener("pointermove", onWindowPointerMove);
  pointerDownAt = null;

  if (stroke) {
    const { regionId, cells } = stroke;
    stroke = null;
    pendingStroke.value = { regionId, cells };
    updateRegion.mutate(
      { id: regionId, update: { cells } },
      {
        onError: (err) => {
          if (pendingStroke.value?.regionId === regionId) pendingStroke.value = null;
          toastError(fromError(err));
          renderOverlay();
        },
      },
    );
    renderOverlay();
    return;
  }

  if (movedBeyondTapThreshold) return;
  handleClick(e);
}

/**
 * Everything that isn't painting: selecting an unbound shape to trace,
 * navigating to a bound room's sheet, or — in run mode — moving the party.
 */
function handleClick(e: PointerEvent): void {
  if (mode === "browse" && activeRegionId.value) return;
  const key = cellFromEvent(e);
  if (!key) return;
  const found = regions.find((r) => r.cells.includes(key));
  if (!found) return;

  if (!found.space_location_id) {
    if (mode === "browse") activeRegionId.value = found.id;
    return;
  }

  if (mode === "run") {
    if (!reachableRoomIds || reachableRoomIds.has(found.space_location_id)) {
      emit("move-party", found.space_location_id);
    } else {
      router.push(`/locations/${found.space_location_id}`);
    }
    return;
  }

  router.push(`/locations/${found.space_location_id}`);
}

onUnmounted(() => {
  window.removeEventListener("pointermove", onWindowPointerMove);
  window.removeEventListener("pointerup", onWindowPointerUp);
});
</script>
