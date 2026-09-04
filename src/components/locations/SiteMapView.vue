<template>
  <div class="flex flex-col gap-4">
    <!-- No image uploader here on purpose. `locations.map_url` already IS the
         image of this place — a Cartographer bake, an uploaded scan, a photo —
         and the location editor owns it. A second uploader here meant a second
         image field, and a site could then have a map while this panel
         insisted it had none. Regions overlay whatever map_url holds. -->
    <!-- Composited viewer: the base image, then the live map, then the region
         overlay — bottom to top, per the epic's layer model. -->
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between">
        <span class="text-label-lg font-semibold text-muted-foreground">Map</span>
        <span v-if="mapLoading" class="text-caption text-muted-foreground italic">Loading map…</span>
      </div>

      <div
        v-if="mode === 'browse' && activeRegion"
        class="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5"
      >
        <span class="text-caption text-foreground">
          Tracing <strong>{{ activeRegionLabel }}</strong> — click cells below to add or remove them.
        </span>
        <AppButton variant="ghost" size="inline-xs" label="Done" @click="activeRegionId = null" />
      </div>

      <div ref="containerEl" class="max-h-128 overflow-auto rounded-lg border border-border bg-muted/20">
        <div class="relative" :style="stageStyle">
          <p
            v-if="!baseImageUrl && !mapCanvasBox"
            class="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-caption text-muted-foreground italic"
          >{{ mode === "run" ? "No map traced yet — use the room list below." : "No map on this place yet — add one in the editor, or trace rooms straight onto the grid." }}</p>
          <img
            v-if="baseImageUrl"
            :src="baseImageUrl"
            alt=""
            class="absolute inset-0 h-full w-full object-cover"
          />
          <canvas
            v-if="mapCanvasBox"
            ref="mapCanvasEl"
            class="absolute"
            :style="mapCanvasStyle"
          />
          <canvas
            ref="overlayCanvasEl"
            class="absolute inset-0 h-full w-full cursor-pointer"
            @click="onOverlayClick"
          />
        </div>
      </div>
    </div>

    <!-- Room shapes — every room of this site, whether or not it has a region
         yet, so the site is usable before it is fully traced.
         Deliberately NOT called "Rooms": `SiteRoomsPanel` sits directly below
         and owns rooms themselves (order, add, rename, delete). Two headings
         reading "Rooms" a few hundred pixels apart is the duplication #783
         removed from the Atlas tree, re-created by accident. This list is
         about each room's *shape on the map*, which is a different thing, and
         naming it so makes the adjacency informative instead of confusing.
         Editing-only, so run mode hides it: `SiteRunSurface` renders its own
         click-to-move room list instead. -->
    <div v-if="mode !== 'run'" class="flex flex-col gap-1.5">
      <span class="text-label-lg font-semibold text-muted-foreground">Room shapes</span>
      <p v-if="!rooms.length" class="text-caption text-muted-foreground italic">No rooms yet — add them below.</p>
      <div v-else class="flex flex-col gap-1.5">
        <div
          v-for="room in rooms"
          :key="room.id"
          class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
        >
          <RouterLink
            :to="`/locations/${room.id}`"
            class="min-w-0 flex-1 truncate font-cinzel text-xs font-semibold text-foreground transition-colors hover:text-primary"
          >{{ room.name }}</RouterLink>

          <template v-if="boundRegionByRoom.get(room.id)">
            <AppButton
              variant="ghost"
              size="inline-xs"
              label="Trace"
              :active="activeRegionId === boundRegionByRoom.get(room.id)!.id"
              @click="setActive(boundRegionByRoom.get(room.id)!.id)"
            />
            <AppButton
              variant="ghost"
              size="inline-xs"
              label="Unbind"
              @click="unbind(boundRegionByRoom.get(room.id)!)"
            />
            <AppButton
              variant="ghost"
              tone="danger"
              size="icon-xs"
              :icon="IconDelete"
              tooltip="Delete this room's shape"
              @click="removeRegion(boundRegionByRoom.get(room.id)!)"
            />
          </template>
          <AppButton v-else variant="ghost" size="inline-xs" label="Add region" @click="addRegionForRoom(room)" />
        </div>
      </div>
    </div>

    <!-- Untitled shapes — traced but not (yet) bound to a room. Tracing tools
         only make sense in browse mode; see the Rooms gate above. -->
    <div v-if="mode !== 'run'" class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between">
        <span class="text-label-lg font-semibold text-muted-foreground">Untitled shapes</span>
        <AppButton variant="ghost" size="inline-xs" :icon="IconAdd" label="New shape" @click="addUnboundRegion" />
      </div>
      <p v-if="!unboundRegions.length" class="text-caption text-muted-foreground italic">Nothing traced yet.</p>
      <div v-else class="flex flex-col gap-1.5">
        <div
          v-for="region in unboundRegions"
          :key="region.id"
          class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
        >
          <AppInput
            :model-value="region.label ?? ''"
            :model-modifiers="{ lazy: true }"
            type="text"
            tone="bare"
            size="xs"
            placeholder="Name this shape…"
            class="min-w-0 flex-1"
            @update:model-value="commitLabel(region, $event as string)"
          />
          <EntityCombobox
            :model-value="''"
            :options="unclaimedRooms"
            placeholder="Bind to room…"
            class="w-40 shrink-0"
            @update:model-value="onBindRoom(region, $event)"
          />
          <AppButton
            variant="ghost"
            size="inline-xs"
            label="Trace"
            :active="activeRegionId === region.id"
            @click="setActive(region.id)"
          />
          <AppButton
            variant="ghost"
            tone="danger"
            size="icon-xs"
            :icon="IconDelete"
            tooltip="Delete this shape"
            @click="removeRegion(region)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { IconAdd, IconDelete } from "@/lib/icons";
import { useLocation, useLocations } from "@/composables/locations/useLocations";
import {
  useCreateLocationMapRegion,
  useDeleteLocationMapRegion,
  useLocationMapRegions,
  useUpdateLocationMapRegion,
} from "@/composables/locations/useLocationMapRegions";
import { useSiteMapRuntimes } from "@/composables/locations/useSiteMapRuntimes";
import { useDungeonMap } from "@/composables/cartographer/useDungeonMaps";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { renderMap } from "@/cartographer/renderMap";
import { parseCellKey } from "@/types/dungeonMap.types";
import {
  cellAtPoint,
  fitTilePx,
  layersBoundingBox,
  resolveGridBounds,
  toggleCell,
} from "@/lib/locations/siteMap";
import type { Location } from "@/types/location.types";
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
const { confirm } = useConfirm();
const { error: toastError, fromError } = useToast();

// ── Site, rooms, regions ────────────────────────────────────────────────────

const site = useLocation(computed(() => locationId));
const { data: children } = useLocations(computed(() => locationId));
const rooms = computed<Location[]>(() => (children.value ?? []).filter((l) => l.location_type === "room"));

const regionsQuery = useLocationMapRegions(computed(() => locationId));
const regions = computed<LocationMapRegion[]>(() => regionsQuery.data.value ?? []);
const boundRegionByRoom = computed(() => {
  const map = new Map<string, LocationMapRegion>();
  for (const r of regions.value) if (r.room_location_id) map.set(r.room_location_id, r);
  return map;
});
const unboundRegions = computed(() => regions.value.filter((r) => !r.room_location_id));
// A room already claimed by a bound region can't take a second one — the
// partial unique index would reject it — so it's left out of the picker
// entirely rather than surfacing that as a toast after the fact.
const unclaimedRooms = computed(() => rooms.value.filter((r) => !boundRegionByRoom.value.has(r.id)));

const activeRegionId = ref<string | null>(null);
const activeRegion = computed(() => regions.value.find((r) => r.id === activeRegionId.value) ?? null);
const activeRegionLabel = computed(() => {
  const region = activeRegion.value;
  if (!region) return "";
  if (region.room_location_id) return rooms.value.find((r) => r.id === region.room_location_id)?.name ?? "this room";
  return region.label || "this shape";
});
function setActive(id: string): void {
  activeRegionId.value = activeRegionId.value === id ? null : id;
}

const createRegion = useCreateLocationMapRegion();
const updateRegion = useUpdateLocationMapRegion();
const deleteRegion = useDeleteLocationMapRegion();

async function addRegionForRoom(room: Location): Promise<void> {
  try {
    const created = await createRegion.mutateAsync({ site_location_id: locationId, room_location_id: room.id });
    activeRegionId.value = created.id;
  } catch (e) {
    toastError(fromError(e));
  }
}

async function addUnboundRegion(): Promise<void> {
  try {
    const created = await createRegion.mutateAsync({ site_location_id: locationId });
    activeRegionId.value = created.id;
  } catch (e) {
    toastError(fromError(e));
  }
}

async function onBindRoom(region: LocationMapRegion, roomId: string): Promise<void> {
  if (!roomId) return;
  try {
    await updateRegion.mutateAsync({ id: region.id, update: { room_location_id: roomId } });
  } catch (e) {
    toastError(fromError(e));
  }
}

async function unbind(region: LocationMapRegion): Promise<void> {
  try {
    await updateRegion.mutateAsync({ id: region.id, update: { room_location_id: null } });
  } catch (e) {
    toastError(fromError(e));
  }
}

async function removeRegion(region: LocationMapRegion): Promise<void> {
  const label = region.room_location_id
    ? (rooms.value.find((r) => r.id === region.room_location_id)?.name ?? "this room's shape")
    : (region.label || "this shape");
  const ok = await confirm(`Delete "${label}"? This cannot be undone.`, { danger: true });
  if (!ok) return;
  if (activeRegionId.value === region.id) activeRegionId.value = null;
  try {
    await deleteRegion.mutateAsync(region.id);
  } catch (e) {
    toastError(fromError(e));
  }
}

function commitLabel(region: LocationMapRegion, value: string): void {
  const next = value.trim();
  if (next === (region.label ?? "")) return;
  updateRegion.mutate({ id: region.id, update: { label: next === "" ? null : next } });
}

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

// ── Live map + tile packs ───────────────────────────────────────────────────

const sourceMapIdParam = computed(() => site.data.value?.source_map_id ?? "");
const dungeonMapQuery = useDungeonMap(sourceMapIdParam);
const { runtimes, loading: packsLoading } = useSiteMapRuntimes(dungeonMapQuery.data);
const mapLoading = computed(() => dungeonMapQuery.isLoading.value || packsLoading.value);

// ── Grid geometry ───────────────────────────────────────────────────────────

const containerEl = ref<HTMLDivElement | null>(null);
const containerWidth = ref(0);
let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  if (!containerEl.value) return;
  resizeObserver = new ResizeObserver((entries) => {
    containerWidth.value = entries[0]?.contentRect.width ?? 0;
  });
  resizeObserver.observe(containerEl.value);
  containerWidth.value = containerEl.value.clientWidth;
});
onUnmounted(() => resizeObserver?.disconnect());

const gridBounds = computed(() => resolveGridBounds(dungeonMapQuery.data.value?.layers ?? null, regions.value));
const cols = computed(() => gridBounds.value.maxX - gridBounds.value.minX + 1);
const rows = computed(() => gridBounds.value.maxY - gridBounds.value.minY + 1);
const tilePx = computed(() => fitTilePx(containerWidth.value, cols.value));
const stageStyle = computed(() => ({
  width: `${cols.value * tilePx.value}px`,
  height: `${rows.value * tilePx.value}px`,
}));

// The map's own painted extent, not the full grid — renderMap always fills
// its whole canvas with an opaque background, so sizing this canvas to just
// what the map painted is what lets the base image show through everywhere
// else. See the SiteMapView reuse note in the #784 report: renderMap has no
// "transparent" mode, so exact-bbox sizing plus DOM layering is how this
// stays a read-only consumer instead of a change to renderMap itself.
const mapBBox = computed(() => {
  const map = dungeonMapQuery.data.value;
  return map ? layersBoundingBox(map.layers) : null;
});
const mapCanvasBox = computed(() => {
  const box = mapBBox.value;
  if (!box) return null;
  const t = tilePx.value;
  return {
    left: (box.minX - gridBounds.value.minX) * t,
    top: (box.minY - gridBounds.value.minY) * t,
    width: (box.maxX - box.minX + 1) * t,
    height: (box.maxY - box.minY + 1) * t,
    minX: box.minX,
    minY: box.minY,
    maxX: box.maxX,
    maxY: box.maxY,
  };
});
const mapCanvasStyle = computed(() => {
  const box = mapCanvasBox.value;
  if (!box) return {};
  return { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` };
});

// ── Rendering ────────────────────────────────────────────────────────────
// Everything below draws in device pixels directly (tilePx * dpr) rather than
// via ctx.scale, matching how renderMap itself already expects to be called.

const mapCanvasEl = ref<HTMLCanvasElement | null>(null);
const overlayCanvasEl = ref<HTMLCanvasElement | null>(null);

function renderMapCanvas(): void {
  const canvas = mapCanvasEl.value;
  const map = dungeonMapQuery.data.value;
  const box = mapCanvasBox.value;
  if (!canvas || !map || !box) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(box.width * dpr));
  canvas.height = Math.max(1, Math.round(box.height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const devicePx = tilePx.value * dpr;
  renderMap({
    ctx,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    tilePx: devicePx,
    viewportOffset: { x: box.minX * devicePx, y: box.minY * devicePx },
    bounds: { minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY },
    layers: map.layers,
    metadata: map.metadata,
    runtimes: runtimes.value,
    fallbackRuntime: null,
    // Only reached when a wall-joint corner has no adjacent wall to claim
    // ownership from — which the joint code only visits when at least one
    // does, so this default is unreachable in practice. See renderMap.ts.
    currentPackId: map.default_pack_id ?? "",
    activeTool: "pan",
    viewMode: true,
    hoveredEdge: null,
    hoverCell: null,
    selectedCell: null,
    previewCells: new Set(),
    // The whole point: the drawn map sits *over* the base
    // image, so unpainted space has to let it through. Without this the map's
    // own dark ground covers the scanned page everywhere inside its bounding
    // box, which is most of the page while a DM is still tracing.
    transparentBackground: true,
  });
}

function renderOverlay(): void {
  const canvas = overlayCanvasEl.value;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const t = tilePx.value * dpr;
  canvas.width = Math.max(1, Math.round(cols.value * t));
  canvas.height = Math.max(1, Math.round(rows.value * t));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= cols.value; x++) {
    ctx.moveTo(x * t, 0);
    ctx.lineTo(x * t, rows.value * t);
  }
  for (let y = 0; y <= rows.value; y++) {
    ctx.moveTo(0, y * t);
    ctx.lineTo(cols.value * t, y * t);
  }
  ctx.stroke();

  for (const region of regions.value) {
    const isHighlighted = mode === "run" ? region.room_location_id === partyRoomId : region.id === activeRegionId.value;
    ctx.fillStyle = regionFillColor(region);
    for (const key of region.cells) {
      const [x, y] = parseCellKey(key);
      const lx = (x - gridBounds.value.minX) * t;
      const ly = (y - gridBounds.value.minY) * t;
      ctx.fillRect(lx, ly, t, t);
    }
    if (isHighlighted) {
      ctx.strokeStyle = "rgba(96, 165, 250, 0.9)";
      ctx.lineWidth = 2;
      for (const key of region.cells) {
        const [x, y] = parseCellKey(key);
        const lx = (x - gridBounds.value.minX) * t;
        const ly = (y - gridBounds.value.minY) * t;
        ctx.strokeRect(lx + 1, ly + 1, t - 2, t - 2);
      }
    }
  }
}

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

watch(
  [() => dungeonMapQuery.data.value, runtimes, tilePx, mapCanvasBox],
  () => renderMapCanvas(),
  { flush: "post", immediate: true },
);
watch(
  [regions, tilePx, gridBounds, activeRegionId, cols, rows, () => mode, () => partyRoomId, () => reachableRoomIds],
  () => renderOverlay(),
  { flush: "post", immediate: true },
);

// ── Interaction ─────────────────────────────────────────────────────────────

function onOverlayClick(e: MouseEvent): void {
  const key = cellAtPoint(e.offsetX, e.offsetY, tilePx.value, gridBounds.value);
  if (mode === "browse" && activeRegionId.value) {
    const region = regions.value.find((r) => r.id === activeRegionId.value);
    if (!region) return;
    updateRegion.mutate({ id: region.id, update: { cells: toggleCell(region.cells, key) } });
    return;
  }
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
