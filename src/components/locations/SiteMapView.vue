<template>
  <div class="flex flex-col gap-4">
    <!-- Underlay: a static reference image the DM can trace rooms onto,
         independent of whether a live Cartographer map exists (#784). -->
    <div class="flex flex-col gap-1.5">
      <span class="text-label-lg font-semibold text-muted-foreground">Reference image</span>
      <ImageUpload
        v-model="underlayUrl"
        bucket="location-images"
        aspect="landscape"
        placeholder="Upload a scanned page or photo to trace over…"
      />
      <p class="text-caption text-muted-foreground italic">
        Stays private to your account — never shown to players.
      </p>
    </div>

    <!-- Composited viewer: underlay, then the live map, then the region
         overlay — bottom to top, per the epic's layer model. -->
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between">
        <span class="text-label-lg font-semibold text-muted-foreground">Map</span>
        <span v-if="mapLoading" class="text-caption text-muted-foreground italic">Loading map…</span>
      </div>

      <div
        v-if="activeRegion"
        class="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5"
      >
        <span class="text-caption text-foreground">
          Tracing <strong>{{ activeRegionLabel }}</strong> — click cells below to add or remove them.
        </span>
        <AppButton variant="ghost" size="inline-xs" label="Done" @click="activeRegionId = null" />
      </div>

      <div ref="containerEl" class="max-h-[32rem] overflow-auto rounded-lg border border-border bg-muted/20">
        <div class="relative" :style="stageStyle">
          <p
            v-if="!underlayUrl && !mapCanvasBox"
            class="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-caption text-muted-foreground italic"
          >No underlay or map yet — trace directly on the grid below.</p>
          <img
            v-if="underlayUrl"
            :src="underlayUrl"
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

    <!-- Rooms — every room of this site, whether or not it has a region yet,
         so the site is usable before it is fully traced. -->
    <div class="flex flex-col gap-1.5">
      <span class="text-label-lg font-semibold text-muted-foreground">Rooms</span>
      <p v-if="!rooms.length" class="text-caption text-muted-foreground italic">No rooms yet.</p>
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

    <!-- Untitled shapes — traced but not (yet) bound to a room. -->
    <div class="flex flex-col gap-1.5">
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
import ImageUpload from "@/components/common/ImageUpload.vue";
import { IconAdd, IconDelete } from "@/lib/icons";
import { useLocation, useLocations, useUpdateLocation } from "@/composables/locations/useLocations";
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

const props = defineProps<{ locationId: string }>();

const router = useRouter();
const { confirm } = useConfirm();
const { error: toastError, fromError } = useToast();

// ── Site, rooms, regions ────────────────────────────────────────────────────

const site = useLocation(computed(() => props.locationId));
const { data: children } = useLocations(computed(() => props.locationId));
const rooms = computed<Location[]>(() => (children.value ?? []).filter((l) => l.location_type === "room"));

const regionsQuery = useLocationMapRegions(computed(() => props.locationId));
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
    const created = await createRegion.mutateAsync({ site_location_id: props.locationId, room_location_id: room.id });
    activeRegionId.value = created.id;
  } catch (e) {
    toastError(fromError(e));
  }
}

async function addUnboundRegion(): Promise<void> {
  try {
    const created = await createRegion.mutateAsync({ site_location_id: props.locationId });
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

// ── Underlay persistence ────────────────────────────────────────────────────
// Self-contained and always-editable, like the sibling site/room panels: each
// change persists immediately rather than waiting on a form Save button.

const underlayUrl = ref<string | null>(null);
watch(
  () => site.data.value?.underlay_url ?? null,
  (v) => { underlayUrl.value = v; },
  { immediate: true },
);
const updateLocation = useUpdateLocation();
watch(underlayUrl, (v) => {
  if (v === (site.data.value?.underlay_url ?? null)) return;
  updateLocation.mutate({ id: props.locationId, update: { underlay_url: v } });
});

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
// what the map painted is what lets the underlay show through everywhere
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
    // The whole point of the underlay: the drawn map sits *over* the reference
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
    const isActive = region.id === activeRegionId.value;
    const bound = !!region.room_location_id;
    ctx.fillStyle = isActive ? "rgba(96, 165, 250, 0.45)" : bound ? "rgba(74, 222, 128, 0.28)" : "rgba(251, 191, 36, 0.28)";
    for (const key of region.cells) {
      const [x, y] = parseCellKey(key);
      const lx = (x - gridBounds.value.minX) * t;
      const ly = (y - gridBounds.value.minY) * t;
      ctx.fillRect(lx, ly, t, t);
    }
    if (isActive) {
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

watch(
  [() => dungeonMapQuery.data.value, runtimes, tilePx, mapCanvasBox],
  () => renderMapCanvas(),
  { flush: "post", immediate: true },
);
watch(
  [regions, tilePx, gridBounds, activeRegionId, cols, rows],
  () => renderOverlay(),
  { flush: "post", immediate: true },
);

// ── Interaction ─────────────────────────────────────────────────────────────

function onOverlayClick(e: MouseEvent): void {
  const key = cellAtPoint(e.offsetX, e.offsetY, tilePx.value, gridBounds.value);
  if (activeRegionId.value) {
    const region = regions.value.find((r) => r.id === activeRegionId.value);
    if (!region) return;
    updateRegion.mutate({ id: region.id, update: { cells: toggleCell(region.cells, key) } });
    return;
  }
  const found = regions.value.find((r) => r.cells.includes(key));
  if (!found) return;
  if (found.room_location_id) {
    router.push(`/locations/${found.room_location_id}`);
  } else {
    activeRegionId.value = found.id;
  }
}
</script>
