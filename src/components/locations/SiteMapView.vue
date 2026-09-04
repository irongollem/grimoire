<template>
  <div class="flex flex-col gap-4">
    <!-- No image uploader here on purpose. `locations.map_url` already IS the
         image of this place — a Cartographer bake, an uploaded scan, a photo —
         and the location editor owns it. A second uploader here meant a second
         image field, and a site could then have a map while this panel
         insisted it had none. Regions overlay whatever map_url holds. -->
    <div class="flex flex-col gap-1.5">
      <span class="text-label-lg font-semibold text-muted-foreground">Map</span>

      <div
        v-if="mode === 'browse' && activeRegion"
        class="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5"
      >
        <span class="text-caption text-foreground">
          Tracing <strong>{{ activeRegionLabel }}</strong> — drag over cells below to add or remove them.
        </span>
        <AppButton variant="ghost" size="inline-xs" label="Done" @click="activeRegionId = null" />
      </div>

      <p v-if="!baseImageUrl" class="text-caption text-muted-foreground italic">
        {{
          mode === "run"
            ? "No map traced yet — use the room list below."
            : "No map on this place yet — add one in the editor before tracing rooms."
        }}
      </p>

      <template v-else>
        <div class="max-h-128 overflow-auto rounded-lg border border-border bg-muted/20">
          <div class="relative inline-block max-w-full">
            <img ref="imageEl" :src="baseImageUrl" alt="" :class="MAP_IMAGE_SIZING" @load="onImageLoad" />
            <canvas
              v-if="calibration"
              ref="overlayCanvasEl"
              class="absolute inset-0 h-full w-full cursor-pointer"
              @pointerdown="onPointerDown"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp"
              @pointercancel="onPointerUp"
              @click="onOverlayClick"
            />
          </div>
        </div>

        <div
          v-if="!calibration"
          class="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
        >
          <span class="text-caption text-muted-foreground">
            A grid has to be matched to this map before rooms can be traced on it.
          </span>
          <AppButton variant="primary" size="sm" label="Calibrate grid" @click="calibrationOpen = true" />
        </div>
      </template>
    </div>

    <!-- Region CRUD (room shapes + untitled shapes) is its own component —
         see `SiteMapRegionList.vue` for why. Editing-only, so run mode hides
         it: `SiteRunSurface` renders its own click-to-move room list
         instead. -->
    <SiteMapRegionList
      v-if="mode !== 'run'"
      :location-id="locationId"
      :rooms="rooms"
      :regions="regions"
      :active-region-id="activeRegionId"
      :can-trace="!!calibration"
      @update:active-region-id="activeRegionId = $event"
    />

    <!-- Mounted unconditionally, same idiom as `LocationEditor.vue` — gated
         purely by `:open`, not by a v-if that would tear it down mid-flow. -->
    <GridCalibrationDialog
      :open="calibrationOpen"
      :map-url="baseImageUrl"
      :existing="calibration"
      @cancel="calibrationOpen = false"
      @save="onCalibrationSave"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import GridCalibrationDialog from "@/components/locations/GridCalibrationDialog.vue";
import SiteMapRegionList from "@/components/locations/SiteMapRegionList.vue";
import { useLocation, useLocations, useUpdateLocationGridCalibration } from "@/composables/locations/useLocations";
import { useLocationMapRegions, useUpdateLocationMapRegion } from "@/composables/locations/useLocationMapRegions";
import { useToast } from "@/composables/useToast";
import { cellAtImageFraction, cellRectInImageFractions, gridExtent } from "@/lib/gridCalibration";
import { MAP_IMAGE_SIZING } from "@/lib/locations/mapZoom";
import { isCellOnImageGrid, toggleCell } from "@/lib/locations/siteMap";
import { cellKey, type CellKey } from "@/types/dungeonMap.types";
import type { GridCalibration, Location } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

const {
  locationId,
  mode = "browse",
  partyRoomId = null,
  reachableRoomIds = null,
} = defineProps<{
  locationId: string;
  /**
   * Ordinary Atlas browsing (default) selects an unbound region for tracing
   * and navigates to a bound one's room on click. Run mode (#791, epic #780)
   * instead moves the party there — see `onOverlayClick` and
   * `SiteRunSurface.vue`, the one caller that passes `"run"`.
   */
  mode?: "browse" | "run";
  /** The room the party currently occupies, for the marker overlay. Only
   *  meaningful in run mode; ignored in browse mode. */
  partyRoomId?: string | null;
  /**
   * Rooms the party can currently walk to from `partyRoomId`, per the site's
   * door graph (`lib/locations/siteRun.ts`). Only meaningful in run mode.
   * `null` means "nothing to be unreachable from yet" — the party isn't in a
   * room of this site at all — so every bound region renders and behaves as
   * reachable.
   */
  reachableRoomIds?: ReadonlySet<string> | null;
}>();

const emit = defineEmits<{ "move-party": [roomId: string] }>();

const router = useRouter();
const { error: toastError, fromError } = useToast();

// ── Site, rooms, regions ────────────────────────────────────────────────────

const site = useLocation(computed(() => locationId));
const { data: children } = useLocations(computed(() => locationId));
const rooms = computed<Location[]>(() => (children.value ?? []).filter((l) => l.location_type === "room"));

const regionsQuery = useLocationMapRegions(computed(() => locationId));
const regions = computed<LocationMapRegion[]>(() => regionsQuery.data.value ?? []);

// `boundRegionByRoom`/`unboundRegions`/`unclaimedRooms` and every region
// mutation (create/bind/unbind/label/delete) live in `SiteMapRegionList.vue`
// now — this view only needs to know which region is active, for the
// tracing banner below and the canvas highlight/stroke target.
const activeRegionId = ref<string | null>(null);
const activeRegion = computed(() => regions.value.find((r) => r.id === activeRegionId.value) ?? null);
const activeRegionLabel = computed(() => {
  const region = activeRegion.value;
  if (!region) return "";
  if (region.room_location_id) return rooms.value.find((r) => r.id === region.room_location_id)?.name ?? "this room";
  return region.label || "this shape";
});

// Still owned here, not `SiteMapRegionList`: committing a drag stroke
// (`onPointerUp` below) is a cell-list update on the active region, the same
// mutation shape as a label edit, just triggered by the canvas instead of a
// list row.
const updateRegion = useUpdateLocationMapRegion();

// ── The image the regions sit on ────────────────────────────────────────────

/**
 * The image the regions sit on: the location's own `map_url`.
 *
 * There is deliberately no second field. `map_url` is the image of this place
 * whatever it is — a Cartographer bake, a scanned module page, a photo of a
 * hand-drawn map — and `is_map_shared` already decides whether players see it.
 * A separate `underlay_url` was a second answer to a question `locations`
 * already answered, and it showed: a site with a perfectly good map_url
 * reported "no map yet" here, because this panel only looked at its own field.
 *
 * Read-only on purpose. The location editor owns map_url; two uploaders for one
 * image is how the two fields happened in the first place.
 */
const baseImageUrl = computed<string | null>(() => site.data.value?.map_url ?? null);

// ── Grid calibration ─────────────────────────────────────────────────────────
// The bug this whole view was rewritten for (#805): cells anchor to the
// *image* via `locations.grid_calibration`, never to whatever the traced
// regions (or, before this ticket, a live Cartographer map) happen to cover.
// `null` is a real state — "not calibrated yet" — not something to default
// away; see `cellAtImageFraction`/`cellRectInImageFractions` in
// `lib/gridCalibration.ts`, which this view is the first to consume.

const calibration = computed<GridCalibration | null>(() => site.data.value?.grid_calibration ?? null);
const calibrationOpen = ref(false);
const updateCalibration = useUpdateLocationGridCalibration();

async function onCalibrationSave(next: GridCalibration): Promise<void> {
  try {
    await updateCalibration.mutateAsync({ id: locationId, calibration: next });
    calibrationOpen.value = false;
  } catch (e) {
    toastError(fromError(e));
  }
}

// ── Image geometry ───────────────────────────────────────────────────────────

const imageEl = ref<HTMLImageElement | null>(null);
const overlayCanvasEl = ref<HTMLCanvasElement | null>(null);

// 0 before the <img> fires `load` — every geometry function here treats that
// the same as "no image", per `gridExtent`'s documented degenerate-input
// contract.
const imageNaturalWidth = ref(0);
const imageNaturalHeight = ref(0);

function onImageLoad(): void {
  const img = imageEl.value;
  if (!img) return;
  imageNaturalWidth.value = img.naturalWidth;
  imageNaturalHeight.value = img.naturalHeight;
  renderOverlay();
}

// A different (or removed) map invalidates the natural size and any in-flight
// stroke from the old one — both are meaningless until the new <img>, if any,
// fires its own `load`.
watch(baseImageUrl, () => {
  imageNaturalWidth.value = 0;
  imageNaturalHeight.value = 0;
  stroke = null;
});

let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  resizeObserver = new ResizeObserver(() => renderOverlay());
});
onUnmounted(() => resizeObserver?.disconnect());
// The canvas is sized in CSS to exactly cover the rendered image box (`inset-0
// h-full w-full` inside a wrapper the image alone sizes), so observing the
// canvas itself is sufficient to catch every resize that would move it out of
// alignment — a window resize, a sidebar collapsing, the map switching.
watch(overlayCanvasEl, (el, oldEl) => {
  if (oldEl) resizeObserver?.unobserve(oldEl);
  if (el) resizeObserver?.observe(el);
});

// ── Rendering ────────────────────────────────────────────────────────────────

/**
 * An in-flight drag stroke (#805 slice 2). Kept outside Vue's reactivity on
 * purpose: it is mutated by a pointer handler and immediately read back by an
 * explicit `renderOverlay()` call in that same handler, every time — a ref
 * would add proxy overhead to a per-pointermove hot path for reactivity
 * nothing here depends on.
 */
interface Stroke {
  regionId: string;
  mode: "paint" | "erase";
  cells: CellKey[];
}
let stroke: Stroke | null = null;

/**
 * The cells a finished stroke committed, drawn in place of the server's copy
 * until the refetch carries them back.
 *
 * Without this the shape snaps to its pre-drag state the instant you let go
 * and only jumps forward a round trip later — which is the very complaint the
 * drag was built to answer, in a new costume. `useUpdateLocationMapRegion`
 * invalidates rather than writing through, so the cache is stale by exactly
 * one fetch; this is the local-optimistic-ref pattern used elsewhere in the
 * app rather than a second mutation strategy.
 *
 * Reactive, unlike `stroke`: it is cleared by a watcher rather than by the
 * handler that set it, so the canvas has to redraw on its own.
 */
const pendingStroke = ref<{ regionId: string; cells: CellKey[] } | null>(null);

function sameCells(a: readonly CellKey[], b: readonly CellKey[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((k) => set.has(k));
}

// Order-insensitive on purpose: the server returns a region's cells in
// whatever order the array was stored, and a stroke builds its own order by
// the path the pointer took. Comparing sequences would leave the optimistic
// copy on screen forever after any drag that revisited a cell.
watch(regions, (next) => {
  const pending = pendingStroke.value;
  if (!pending) return;
  const region = next.find((r) => r.id === pending.regionId);
  if (!region || sameCells(region.cells, pending.cells)) pendingStroke.value = null;
});

/**
 * Browse mode's palette is unchanged: active-for-tracing blue, bound green,
 * unbound amber. Run mode has no tracing, so it repurposes the same three
 * slots for the questions a DM actually asks while playing — where is the
 * party (blue, same as "active" so the two modes never fight for a colour),
 * can they walk to this room (green), can they not (a dim stone grey rather
 * than amber, so "locked" doesn't read as "look here" the way tracing's
 * unbound colour deliberately does) — and an untraced shape fades nearly
 * away, since it names nothing a DM needs mid-session.
 */
function regionFillColor(region: LocationMapRegion): string {
  if (mode === "run") {
    if (region.room_location_id === partyRoomId) return "rgba(96, 165, 250, 0.55)";
    if (!region.room_location_id) return "rgba(255, 255, 255, 0.04)";
    const reachable = !reachableRoomIds || reachableRoomIds.has(region.room_location_id);
    return reachable ? "rgba(74, 222, 128, 0.28)" : "rgba(120, 113, 108, 0.35)";
  }
  const isActive = region.id === activeRegionId.value;
  const bound = !!region.room_location_id;
  return isActive ? "rgba(96, 165, 250, 0.45)" : bound ? "rgba(74, 222, 128, 0.28)" : "rgba(251, 191, 36, 0.28)";
}

function renderOverlay(): void {
  const canvas = overlayCanvasEl.value;
  const cal = calibration.value;
  if (!canvas || !cal) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const w = imageNaturalWidth.value;
  const h = imageNaturalHeight.value;
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

  for (const region of regions.value) {
    const pending = pendingStroke.value;
    const cells =
      stroke && stroke.regionId === region.id
        ? stroke.cells
        : pending && pending.regionId === region.id
          ? pending.cells
          : region.cells;
    const isHighlighted = mode === "run" ? region.room_location_id === partyRoomId : region.id === activeRegionId.value;
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
  [regions, calibration, activeRegionId, imageNaturalWidth, imageNaturalHeight, () => mode, () => partyRoomId, () => reachableRoomIds],
  () => renderOverlay(),
  { flush: "post", immediate: true },
);

// ── Interaction ───────────────────────────────────────────────────────────────

/** The map cell under a pointer/mouse event, in image-fraction space via the
 *  canvas's own on-screen box — the exact inverse of how the overlay draws a
 *  cell's rect back onto that same box. Null before an image has loaded, or
 *  when there is nothing calibrated to resolve against. */
function cellFromEvent(e: MouseEvent): CellKey | null {
  const canvas = overlayCanvasEl.value;
  const cal = calibration.value;
  const w = imageNaturalWidth.value;
  const h = imageNaturalHeight.value;
  if (!canvas || !cal || w <= 0 || h <= 0) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const fx = (e.clientX - rect.left) / rect.width;
  const fy = (e.clientY - rect.top) / rect.height;
  return cellAtImageFraction(fx, fy, cal, w, h);
}

/**
 * Drag-to-paint (#805 slice 2, reported from use — a click-only overlay
 * painted one cell per drag, the one under the pointer at release, which read
 * as "the shape appeared when I let go"). Direction locks on the first cell
 * touched: if it's already in the region the whole stroke erases, otherwise
 * the whole stroke paints, so dragging back over a cell already handled this
 * stroke can't flicker it. A plain click is just a one-cell stroke — pointer
 * down then immediately up — so it needs no separate handling.
 */
function onPointerDown(e: PointerEvent): void {
  if (mode !== "browse" || !activeRegionId.value) return;
  const region = regions.value.find((r) => r.id === activeRegionId.value);
  const cal = calibration.value;
  if (!region || !cal) return;
  const key = cellFromEvent(e);
  if (!key || !isCellOnImageGrid(key, cal, imageNaturalWidth.value, imageNaturalHeight.value)) return;

  stroke = {
    regionId: region.id,
    mode: region.cells.includes(key) ? "erase" : "paint",
    cells: toggleCell(region.cells, key),
  };
  // Keeps the stroke alive (and pointermove/pointerup firing on this canvas)
  // even if the drag leaves the canvas's bounds before the button comes up.
  overlayCanvasEl.value?.setPointerCapture(e.pointerId);
  renderOverlay();
}

function onPointerMove(e: PointerEvent): void {
  if (!stroke) return;
  const cal = calibration.value;
  if (!cal) return;
  const key = cellFromEvent(e);
  if (!key || !isCellOnImageGrid(key, cal, imageNaturalWidth.value, imageNaturalHeight.value)) return;

  const alreadyInStrokeDirection = stroke.mode === "paint" ? stroke.cells.includes(key) : !stroke.cells.includes(key);
  if (alreadyInStrokeDirection) return;
  stroke.cells = toggleCell(stroke.cells, key);
  renderOverlay();
}

/** Commits the whole stroke as one mutation — not one `updateRegion` round
 *  trip per cell, which is what the drag replaced. Also the handler for
 *  `pointercancel`: whatever the stroke touched before the interruption is
 *  what gets saved, same as a normal release. */
function onPointerUp(e: PointerEvent): void {
  if (!stroke) return;
  const { regionId, cells } = stroke;
  stroke = null;
  if (overlayCanvasEl.value?.hasPointerCapture(e.pointerId)) {
    overlayCanvasEl.value.releasePointerCapture(e.pointerId);
  }
  pendingStroke.value = { regionId, cells };
  updateRegion.mutate(
    { id: regionId, update: { cells } },
    {
      // Drop the optimistic copy on failure so the canvas falls back to what
      // the server actually holds rather than showing a shape that was never
      // saved. The toast is the only other signal the DM gets.
      onError: (e) => {
        if (pendingStroke.value?.regionId === regionId) pendingStroke.value = null;
        toastError(fromError(e));
        renderOverlay();
      },
    },
  );
  renderOverlay();
}

/**
 * Everything that isn't painting: selecting an unbound shape to trace,
 * navigating to a bound room's sheet, or — in run mode — moving the party.
 * Tracing itself (browse mode with a region active) is fully handled by the
 * pointer-stroke handlers above; this only has to stay out of their way.
 */
function onOverlayClick(e: MouseEvent): void {
  if (mode === "browse" && activeRegionId.value) return;
  const key = cellFromEvent(e);
  if (!key) return;
  const found = regions.value.find((r) => r.cells.includes(key));
  if (!found) return;

  if (!found.room_location_id) {
    // Nothing to move to or navigate into — only browse mode's tracing UI
    // makes an untitled shape worth selecting.
    if (mode === "browse") activeRegionId.value = found.id;
    return;
  }

  if (mode === "run") {
    // Reachable rooms move the party in one click, per #791's whole point.
    // An unreachable one still lets the DM look — "select-without-moving" —
    // by falling back to the same plain navigation browse mode always did.
    if (!reachableRoomIds || reachableRoomIds.has(found.room_location_id)) {
      emit("move-party", found.room_location_id);
    } else {
      router.push(`/locations/${found.room_location_id}`);
    }
    return;
  }

  router.push(`/locations/${found.room_location_id}`);
}
</script>
