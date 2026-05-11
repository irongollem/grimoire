<template>
  <PageHeader :title="map?.name ?? 'New Map'" :description="statusLine">
    <template #actions>
      <button
        v-if="!isNew"
        type="button"
        :disabled="deleting"
        class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider text-destructive border border-destructive/40 rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-50"
        @click="onDelete"
      >{{ deleting ? "Deleting…" : "Delete" }}</button>
      <ListActionButton label="Cancel" @click="onCancel" />
      <ListActionButton
        :icon="IconSave"
        label="Save"
        variant="primary"
        :disabled="saving"
        @click="onSave"
      />
    </template>

    <div class="flex flex-col lg:flex-row gap-3 mt-2">
      <!-- Toolbox -->
      <aside
        class="flex lg:flex-col flex-row gap-1 lg:w-44 shrink-0 bg-card border border-border rounded-lg p-2"
      >
        <h4 class="hidden lg:block font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase px-1 pb-1">
          Tools
        </h4>
        <button
          v-for="t in TOOLS"
          :key="t.id"
          type="button"
          class="flex items-center gap-2 rounded-md px-2 py-1.5 font-fell text-xs transition-colors text-left"
          :class="
            activeTool === t.id
              ? 'bg-primary/15 text-foreground'
              : t.disabled
                ? 'text-muted-foreground/50 cursor-not-allowed'
                : 'hover:bg-muted text-foreground'
          "
          :disabled="t.disabled"
          :title="toolTitle(t)"
          @click="activeTool = t.id"
        >
          <component :is="t.icon" class="h-4 w-4 shrink-0" />
          <span class="hidden lg:inline flex-1">{{ t.label }}</span>
          <kbd
            v-if="toolBadge(t)"
            class="hidden lg:inline font-cinzel text-[9px] tracking-wider text-muted-foreground bg-muted/60 border border-border rounded px-1 py-0.5"
          >{{ toolBadge(t) }}</kbd>
        </button>

        <div class="hidden lg:block mt-3 border-t border-border pt-2 text-[10px] font-fell text-muted-foreground italic">
          <p>Right-mouse-drag or shift-drag pans without switching tool. M2 tools (W/D/S) are pre-wired — shortcuts activate once those tools are enabled.</p>
        </div>
      </aside>

      <!-- Canvas -->
      <div class="flex-1 min-w-0 relative bg-card border border-border rounded-lg overflow-hidden" style="min-height: 60vh">
        <canvas
          ref="canvasEl"
          class="block w-full h-full cursor-crosshair touch-none"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointerleave="onPointerUp"
          @wheel.prevent="onWheel"
          @contextmenu.prevent
        ></canvas>

        <!-- Status bar -->
        <div
          class="absolute bottom-0 left-0 right-0 flex items-center gap-3 px-3 py-1 bg-card/95 border-t border-border font-fell text-[10px] text-muted-foreground"
        >
          <span>
            Cursor: <strong class="text-foreground">{{ hoverCell?.[0] ?? "—" }}, {{ hoverCell?.[1] ?? "—" }}</strong>
          </span>
          <span>
            Zoom: <strong class="text-foreground">{{ Math.round(zoom * 100) }}%</strong>
          </span>
          <button
            type="button"
            title="Center map (C)"
            aria-label="Center map"
            class="inline-flex items-center justify-center rounded-md p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            @click="centerMap"
          >
            <IconCenter class="h-3.5 w-3.5" />
          </button>
          <span>
            Pack: <strong class="text-foreground">{{ packId }}</strong>
            <span v-if="packLoadError" class="text-red-500"> ({{ packLoadError }})</span>
          </span>
          <span v-if="cellsPainted > 0">
            Floor cells: <strong class="text-foreground">{{ cellsPainted }}</strong>
          </span>
        </div>

        <!-- Overlay hint while pack loads -->
        <div
          v-if="!packRuntime"
          class="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm"
        >
          <LoadingSpinner />
        </div>
      </div>

      <!-- Inspector -->
      <aside class="lg:w-56 shrink-0 bg-card border border-border rounded-lg p-3 space-y-3">
        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase mb-1">
            Name
          </label>
          <input
            v-model="name"
            type="text"
            class="w-full bg-background border border-border rounded-md px-2 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase mb-1">
            Pack
          </label>
          <div
            v-if="packRuntime"
            class="rounded-md border border-border bg-background px-2 py-1.5"
          >
            <p class="font-cinzel text-xs font-semibold text-foreground">
              {{ packRuntime.manifest.name }}
            </p>
            <p class="font-fell text-[10px] text-muted-foreground italic">
              v{{ packRuntime.manifest.pack_version }} · {{ floorVariantCount }} floor variants
            </p>
            <p
              v-if="!packRuntime.validation.valid"
              class="font-fell text-[10px] text-amber-500 mt-1"
            >
              {{ packRuntime.validation.missing.length }} required slot(s) missing — using placeholders.
            </p>
          </div>
        </div>

        <p class="font-fell text-[10px] text-muted-foreground italic leading-relaxed">
          M1 paints floor cells deterministically by <code class="text-[10px]">hash(map_id, x, y)</code>.
          Variants persist across reloads.
        </p>
      </aside>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";

import {
  IconSave,
  IconBrush,
  IconEraser,
  IconHand,
  IconCenter,
  // M2 placeholders — visually present but disabled until next milestone
  IconWall,
  IconDoor,
  IconCube,
} from "@/lib/icons";

import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";

import {
  useDungeonMap,
  useCreateDungeonMap,
  useUpdateDungeonMap,
  useDeleteDungeonMap,
} from "@/composables/useDungeonMaps";
import { useConfirm } from "@/composables/useConfirm";
import {
  emptyLayers,
  cellKey,
  type DungeonMap,
  type DungeonMapLayers,
  type EdgeSeg,
} from "@/types/dungeonMap.types";
import { BASE_TILE_SIZE } from "@/cartographer/packSchema";
import { loadPack, type TilePackRuntime } from "@/cartographer/packLoader";
import { canonicaliseEdge, type CellEdge } from "@/cartographer/edges";
import { detectHoveredEdge } from "@/cartographer/edgeHover";

const route = useRoute();
const router = useRouter();

const STARTER_PACK_ID = "stone-dungeon";
const STARTER_PACK_VERSION = 1;
const STARTER_MANIFEST_URL = `/cartographer/${STARTER_PACK_ID}/v${STARTER_PACK_VERSION}/manifest.json`;

const mapId = computed(() => {
  const p = route.params.id;
  return typeof p === "string" && p ? p : "";
});
const isNew = computed(() => !mapId.value);

const { data: loadedMap } = useDungeonMap(mapId);
const createMutation = useCreateDungeonMap();
const updateMutation = useUpdateDungeonMap();
const deleteMutation = useDeleteDungeonMap();
const { confirm } = useConfirm();

const name = ref("Untitled Map");
const layers = ref<DungeonMapLayers>(emptyLayers());
const packId = ref(STARTER_PACK_ID);
const packLoadError = ref<string | null>(null);
const packRuntime = ref<TilePackRuntime | null>(null);
const dirty = ref(false);
const saving = ref(false);
const deleting = ref(false);

const canvasEl = ref<HTMLCanvasElement | null>(null);

// Viewport state
const zoom = ref(1);
const viewportOffset = ref({ x: 0, y: 0 }); // world-pixels at top-left of viewport
const hoverCell = ref<[number, number] | null>(null);
const hoveredEdge = ref<CellEdge | null>(null);

// Pointer state
const isPanning = ref(false);
const isPainting = ref(false);
let lastPointer: { x: number; y: number } | null = null;
// Tracks edges already written during the current drag, so dragging over the
// same edge doesn't re-randomise its variant.
let edgesPaintedInStroke = new Set<string>();
// Direction lock: once the first edge of a drag is placed, every subsequent
// edge in the stroke must match the same direction. Prevents accidental
// perpendicular walls when the cursor passes near a cell corner.
let strokeDirection: "H" | "V" | null = null;

// Tools
type Tool = "floor" | "eraser" | "pan" | "wall" | "door" | "solid";
interface ToolDef {
  id: Tool;
  label: string;
  icon: unknown;
  /** Single keyboard key that activates this tool (lowercase, plain key — no modifiers). */
  shortcut?: string;
  /** Override for the visible kbd badge — used for non-keyboard hints like "RMB" on Pan. */
  displayBadge?: string;
  disabled?: boolean;
}
const activeTool = ref<Tool>("floor");
const TOOLS: ToolDef[] = [
  { id: "floor",  label: "Floor brush",      icon: IconBrush,  shortcut: "b" },
  { id: "eraser", label: "Eraser",           icon: IconEraser, shortcut: "e" },
  { id: "wall",   label: "Wall",             icon: IconWall,   shortcut: "w" },
  { id: "pan",    label: "Pan",              icon: IconHand,   displayBadge: "RMB" },
  { id: "door",   label: "Door (M2)",        icon: IconDoor,   shortcut: "d", disabled: true },
  { id: "solid",  label: "Solid block (M2)", icon: IconCube,   shortcut: "s", disabled: true },
];

// Edge-hover threshold: how close the cursor must get to a cell edge for it
// to "snap" to wall placement. 0.25 = within the outer 25% of the cell.
const EDGE_HOVER_THRESHOLD = 0.25;

function toolBadge(t: ToolDef): string | undefined {
  return t.displayBadge ?? t.shortcut?.toUpperCase();
}
function toolTitle(t: ToolDef): string {
  const badge = toolBadge(t);
  return badge ? `${t.label} (${badge})` : t.label;
}

const cellsPainted = computed(() => Object.keys(layers.value.floor).length);
const floorVariantCount = computed(() =>
  packRuntime.value ? packRuntime.value.variantCount("floor") : 0,
);

const statusLine = computed(() => {
  if (isNew.value) return "New map — paint a floor, then save.";
  if (dirty.value) return "Unsaved changes.";
  return "Saved.";
});

// ── Pack load ───────────────────────────────────────────────────────────────

async function ensurePackLoaded(): Promise<void> {
  if (packRuntime.value) return;
  try {
    const runtime = await loadPack(STARTER_MANIFEST_URL);
    packRuntime.value = runtime;
    if (!runtime.validation.valid) {
      // eslint-disable-next-line no-console
      console.warn("Stone Dungeon pack is incomplete; rendering placeholders for missing slots", runtime.validation);
    }
  } catch (e) {
    packLoadError.value = e instanceof Error ? e.message : String(e);
  }
}

// ── Map load ───────────────────────────────────────────────────────────────

function cloneLayers(src: DungeonMapLayers | null | undefined): DungeonMapLayers {
  if (!src) return emptyLayers();
  // JSON round-trip — layers are pure data, and this strips Vue's readonly proxy
  // wrapping that comes off TanStack Query's cached result so the editor owns a
  // writable copy.
  return JSON.parse(JSON.stringify(src)) as DungeonMapLayers;
}

watch(loadedMap, (m) => {
  if (m) {
    name.value = m.name;
    layers.value = cloneLayers(m.layers);
    packId.value = m.default_pack_id ?? STARTER_PACK_ID;
    dirty.value = false;
  }
});

// ── Deterministic variant picking ──────────────────────────────────────────

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickFloorVariant(x: number, y: number): number {
  const count = floorVariantCount.value || 1;
  return hash32(`${mapId.value || "new"}|floor|${x}|${y}`) % count;
}

function pickWallVariant(x: number, y: number, side: "N" | "W"): number {
  if (!packRuntime.value) return 0;
  const category = side === "N" ? "wallSegmentH" : "wallSegmentV";
  const count = packRuntime.value.variantCount(category) || 1;
  return hash32(`${mapId.value || "new"}|${category}|${x}|${y}`) % count;
}

// World pixel coords (canvas-pixel space) given an event on the canvas.
function pointerToWorld(local: { x: number; y: number }): { x: number; y: number } {
  const { dpr } = devicePixelDims();
  return {
    x: viewportOffset.value.x + local.x * dpr,
    y: viewportOffset.value.y + local.y * dpr,
  };
}

function tilePixelSize(): number {
  return BASE_TILE_SIZE * zoom.value * (window.devicePixelRatio || 1);
}

// Centre the viewport on the painted area (or on the origin if the map is empty).
function centerMap(): void {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const tilePx = tilePixelSize();

  // Compute bbox over every cell that contains anything.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;
  for (const key of Object.keys(layers.value.floor)) {
    const [xs, ys] = key.split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    any = true;
  }

  // No painted cells → just center on the origin tile.
  const cx = any ? (minX + maxX + 1) / 2 : 0.5;
  const cy = any ? (minY + maxY + 1) / 2 : 0.5;

  viewportOffset.value = {
    x: cx * tilePx - canvas.width / 2,
    y: cy * tilePx - canvas.height / 2,
  };
}

// ── Wall placement (edge-based, NW ownership) ──────────────────────────────

function edgeDirection(side: "N" | "E" | "S" | "W"): "H" | "V" {
  return side === "N" || side === "S" ? "H" : "V";
}

function paintWallAtCellEdge(edge: CellEdge): void {
  const dir = edgeDirection(edge.side);
  // Direction lock: first paint of a stroke commits H or V; later perpendicular
  // edges are ignored. Single clicks (no later moves) are unaffected.
  if (isPainting.value) {
    if (strokeDirection === null) strokeDirection = dir;
    else if (strokeDirection !== dir) return;
  }

  const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
  const strokeKey = `${canon.x},${canon.y},${canon.side}`;
  if (edgesPaintedInStroke.has(strokeKey)) return;

  const ownerKey = cellKey(canon.x, canon.y);
  const ownerCell = layers.value.floor[ownerKey] ?? {};
  // Already a wall on this edge? Skip; preserves doors etc. once they exist.
  const existing = canon.side === "N" ? ownerCell.wallN : ownerCell.wallW;
  if (existing && existing.type === "wall") {
    edgesPaintedInStroke.add(strokeKey);
    return;
  }

  const seg: EdgeSeg = {
    pack_id: packId.value,
    pack_version: STARTER_PACK_VERSION,
    type: "wall",
    variant: pickWallVariant(canon.x, canon.y, canon.side),
  };

  layers.value.floor[ownerKey] = canon.side === "N"
    ? { ...ownerCell, wallN: seg }
    : { ...ownerCell, wallW: seg };

  edgesPaintedInStroke.add(strokeKey);
  dirty.value = true;
}

function eraseWallAtCellEdge(edge: CellEdge): void {
  const dir = edgeDirection(edge.side);
  if (isPainting.value) {
    if (strokeDirection === null) strokeDirection = dir;
    else if (strokeDirection !== dir) return;
  }

  const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
  const ownerKey = cellKey(canon.x, canon.y);
  const ownerCell = layers.value.floor[ownerKey];
  if (!ownerCell) return;
  if (canon.side === "N" && !ownerCell.wallN) return;
  if (canon.side === "W" && !ownerCell.wallW) return;
  const next = { ...ownerCell };
  if (canon.side === "N") delete next.wallN;
  else delete next.wallW;
  // If the cell is now empty (no floor, no walls), drop it from the map.
  if (!next.floor && !next.wallN && !next.wallW) {
    const newFloor = { ...layers.value.floor };
    delete newFloor[ownerKey];
    layers.value.floor = newFloor;
  } else {
    layers.value.floor[ownerKey] = next;
  }
  dirty.value = true;
}


// ── Canvas rendering ───────────────────────────────────────────────────────

function devicePixelDims(): { w: number; h: number; dpr: number } {
  const canvas = canvasEl.value!;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  return { w: rect.width, h: rect.height, dpr };
}

function resizeCanvasIfNeeded(): void {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const { w, h, dpr } = devicePixelDims();
  const targetW = Math.round(w * dpr);
  const targetH = Math.round(h * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }
}

function viewportToCell(px: number, py: number): [number, number] {
  const { dpr } = devicePixelDims();
  const tileCSS = BASE_TILE_SIZE * zoom.value;
  const worldX = viewportOffset.value.x + px * dpr;
  const worldY = viewportOffset.value.y + py * dpr;
  const x = Math.floor(worldX / (tileCSS * dpr));
  const y = Math.floor(worldY / (tileCSS * dpr));
  return [x, y];
}

function visibleCellBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  const { w, h, dpr } = devicePixelDims();
  const tileCSS = BASE_TILE_SIZE * zoom.value;
  const minX = Math.floor(viewportOffset.value.x / (tileCSS * dpr));
  const minY = Math.floor(viewportOffset.value.y / (tileCSS * dpr));
  const maxX = Math.ceil((viewportOffset.value.x + w * dpr) / (tileCSS * dpr));
  const maxY = Math.ceil((viewportOffset.value.y + h * dpr) / (tileCSS * dpr));
  return { minX, minY, maxX, maxY };
}

function render(): void {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  resizeCanvasIfNeeded();
  const { dpr } = devicePixelDims();
  const tileCSS = BASE_TILE_SIZE * zoom.value;
  const tilePx = tileCSS * dpr;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "rgb(20, 18, 16)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const { minX, minY, maxX, maxY } = visibleCellBounds();

  // Floor layer (and edge walls below; they need the cell loop too)
  if (packRuntime.value) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const k = cellKey(x, y);
        const cell = layers.value.floor[k];
        if (!cell?.floor) continue;
        const drawX = x * tilePx - viewportOffset.value.x;
        const drawY = y * tilePx - viewportOffset.value.y;
        const tile = packRuntime.value.getTile("floor", cell.floor.variant);
        ctx.drawImage(tile.source, drawX, drawY, tilePx, tilePx);
      }
    }
  }

  // Grid overlay
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = minX; x <= maxX + 1; x++) {
    const px = x * tilePx - viewportOffset.value.x;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, canvas.height);
  }
  for (let y = minY; y <= maxY + 1; y++) {
    const py = y * tilePx - viewportOffset.value.y;
    ctx.moveTo(0, py);
    ctx.lineTo(canvas.width, py);
  }
  ctx.stroke();

  // Edge walls — drawn AFTER the grid so walls visually mask the gridline
  // they sit on. The wall tile is 128×128 with the painted strip in the
  // CENTER (vertically for H, horizontally for V). We shift the tile by
  // half a tile so the strip lands ON the gridline, straddling both
  // adjacent cells equally. NW ownership: cell stores wallN/wallW.
  if (packRuntime.value) {
    const halfTile = tilePx / 2;
    for (let y = minY; y <= maxY + 1; y++) {
      for (let x = minX; x <= maxX + 1; x++) {
        const cell = layers.value.floor[cellKey(x, y)];
        if (!cell) continue;
        const drawX = x * tilePx - viewportOffset.value.x;
        const drawY = y * tilePx - viewportOffset.value.y;
        if (cell.wallN) {
          const tile = packRuntime.value.getTile("wallSegmentH", cell.wallN.variant);
          ctx.drawImage(tile.source, drawX, drawY - halfTile, tilePx, tilePx);
        }
        if (cell.wallW) {
          const tile = packRuntime.value.getTile("wallSegmentV", cell.wallW.variant);
          ctx.drawImage(tile.source, drawX - halfTile, drawY, tilePx, tilePx);
        }
      }
    }

    // Corner joints — fill the gap where H and V wall strips meet at a grid
    // intersection. Each wall tile covers exactly one cell-width along its axis,
    // so two abutting tiles leave a square hole at the corner; plugging it here.
    const thickness = tilePx * 0.18;
    const halfThick = thickness / 2;
    ctx.fillStyle = "rgb(40, 36, 32)";
    for (let cy = minY; cy <= maxY + 1; cy++) {
      for (let cx = minX; cx <= maxX + 1; cx++) {
        const hasH =
          !!layers.value.floor[cellKey(cx - 1, cy)]?.wallN ||
          !!layers.value.floor[cellKey(cx, cy)]?.wallN;
        const hasV =
          !!layers.value.floor[cellKey(cx, cy - 1)]?.wallW ||
          !!layers.value.floor[cellKey(cx, cy)]?.wallW;
        if (hasH && hasV) {
          const cornerX = cx * tilePx - viewportOffset.value.x;
          const cornerY = cy * tilePx - viewportOffset.value.y;
          ctx.fillRect(cornerX - halfThick, cornerY - halfThick, thickness, thickness);
        }
      }
    }
  }

  // Origin marker
  const ox = 0 - viewportOffset.value.x;
  const oy = 0 - viewportOffset.value.y;
  ctx.strokeStyle = "rgba(200, 160, 60, 0.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, tilePx, tilePx);

  // Cell-hover highlight (only when the active tool targets cells)
  if (hoverCell.value && (activeTool.value === "floor" || (activeTool.value === "eraser" && !hoveredEdge.value))) {
    const [hx, hy] = hoverCell.value;
    const drawX = hx * tilePx - viewportOffset.value.x;
    const drawY = hy * tilePx - viewportOffset.value.y;
    ctx.strokeStyle = activeTool.value === "eraser" ? "rgba(220, 80, 80, 0.6)" : "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(drawX, drawY, tilePx, tilePx);
  }

  // Edge-hover highlight (wall / door / edge-aware eraser tools)
  if (hoveredEdge.value) {
    const { x, y, side } = hoveredEdge.value;
    const baseX = x * tilePx - viewportOffset.value.x;
    const baseY = y * tilePx - viewportOffset.value.y;
    const isErase = activeTool.value === "eraser";
    ctx.strokeStyle = isErase ? "rgba(220, 80, 80, 0.85)" : "rgba(255, 220, 100, 0.85)";
    ctx.lineWidth = Math.max(3, tilePx * 0.08);
    ctx.lineCap = "round";
    ctx.beginPath();
    switch (side) {
      case "N": ctx.moveTo(baseX, baseY);             ctx.lineTo(baseX + tilePx, baseY); break;
      case "S": ctx.moveTo(baseX, baseY + tilePx);    ctx.lineTo(baseX + tilePx, baseY + tilePx); break;
      case "W": ctx.moveTo(baseX, baseY);             ctx.lineTo(baseX, baseY + tilePx); break;
      case "E": ctx.moveTo(baseX + tilePx, baseY);    ctx.lineTo(baseX + tilePx, baseY + tilePx); break;
    }
    ctx.stroke();
  }
}

let rafId = 0;
function scheduleRender(): void {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    render();
  });
}

watch([zoom, viewportOffset, layers, packRuntime, hoverCell, hoveredEdge, activeTool], () => scheduleRender(), { deep: true });

// ── Pointer interaction ────────────────────────────────────────────────────

function getLocalPointer(ev: PointerEvent): { x: number; y: number } {
  const rect = canvasEl.value!.getBoundingClientRect();
  return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
}

function paintCell(x: number, y: number): void {
  if (!packRuntime.value) return;
  const k = cellKey(x, y);
  const existing = layers.value.floor[k];
  const variant = pickFloorVariant(x, y);
  if (existing?.floor?.variant === variant) return;
  layers.value.floor[k] = {
    ...existing,
    floor: {
      pack_id: packId.value,
      pack_version: STARTER_PACK_VERSION,
      variant,
    },
  };
  dirty.value = true;
}

function eraseCell(x: number, y: number): void {
  const k = cellKey(x, y);
  if (layers.value.floor[k]) {
    const next = { ...layers.value.floor };
    delete next[k];
    layers.value.floor = next;
    dirty.value = true;
  }
}

function onPointerDown(ev: PointerEvent): void {
  const local = getLocalPointer(ev);
  lastPointer = local;

  // Right-click (button 2), middle-click (button 1), or Shift+drag always pans —
  // no need to switch to the Pan tool. Context menu is suppressed on the canvas.
  const isPanTrigger = ev.button === 1 || ev.button === 2 || ev.shiftKey;
  const isPanTool = activeTool.value === "pan";

  if (isPanTool || isPanTrigger) {
    isPanning.value = true;
    canvasEl.value?.setPointerCapture(ev.pointerId);
    return;
  }

  isPainting.value = true;
  canvasEl.value?.setPointerCapture(ev.pointerId);
  edgesPaintedInStroke = new Set<string>();
  strokeDirection = null;

  const [cx, cy] = viewportToCell(local.x, local.y);
  if (activeTool.value === "floor") paintCell(cx, cy);
  else if (activeTool.value === "eraser") {
    // Eraser: if cursor is near an edge use the edge, otherwise erase the cell.
    if (hoveredEdge.value) eraseWallAtCellEdge(hoveredEdge.value);
    else eraseCell(cx, cy);
  } else if (activeTool.value === "wall" && hoveredEdge.value) {
    paintWallAtCellEdge(hoveredEdge.value);
  }
}

function onPointerMove(ev: PointerEvent): void {
  const local = getLocalPointer(ev);
  const [cx, cy] = viewportToCell(local.x, local.y);
  hoverCell.value = [cx, cy];

  // Update edge-hover state for tools that target edges (wall, door, edge-eraser).
  const tool = activeTool.value;
  if (tool === "wall" || tool === "door" || tool === "eraser") {
    const world = pointerToWorld(local);
    let edge = detectHoveredEdge(world.x, world.y, tilePixelSize(), EDGE_HOVER_THRESHOLD);
    // If a stroke has locked its direction, suppress highlights for the
    // perpendicular axis — visual feedback matches what will actually paint.
    if (edge && isPainting.value && strokeDirection !== null && edgeDirection(edge.side) !== strokeDirection) {
      edge = null;
    }
    hoveredEdge.value = edge;
  } else {
    hoveredEdge.value = null;
  }

  if (isPanning.value && lastPointer) {
    const dx = local.x - lastPointer.x;
    const dy = local.y - lastPointer.y;
    const { dpr } = devicePixelDims();
    viewportOffset.value = {
      x: viewportOffset.value.x - dx * dpr,
      y: viewportOffset.value.y - dy * dpr,
    };
  } else if (isPainting.value) {
    if (tool === "floor") paintCell(cx, cy);
    else if (tool === "eraser") {
      if (hoveredEdge.value) eraseWallAtCellEdge(hoveredEdge.value);
      else eraseCell(cx, cy);
    } else if (tool === "wall" && hoveredEdge.value) {
      paintWallAtCellEdge(hoveredEdge.value);
    }
  }

  lastPointer = local;
}

function onPointerUp(ev: PointerEvent): void {
  if (isPanning.value) {
    isPanning.value = false;
    canvasEl.value?.releasePointerCapture(ev.pointerId);
  }
  if (isPainting.value) {
    isPainting.value = false;
    canvasEl.value?.releasePointerCapture(ev.pointerId);
  }
  lastPointer = null;
}

function onWheel(ev: WheelEvent): void {
  const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
  // 5%–400% zoom range: small enough to scan an 80×80 dungeon at a glance,
  // large enough to paint tile-by-tile.
  const next = Math.max(0.05, Math.min(4, zoom.value * factor));
  // Zoom around the cursor
  const rect = canvasEl.value!.getBoundingClientRect();
  const cx = ev.clientX - rect.left;
  const cy = ev.clientY - rect.top;
  const { dpr } = devicePixelDims();
  const worldX = viewportOffset.value.x + cx * dpr;
  const worldY = viewportOffset.value.y + cy * dpr;
  const scale = next / zoom.value;
  viewportOffset.value = {
    x: worldX - (worldX - viewportOffset.value.x) * scale - cx * dpr + cx * dpr,
    y: worldY - (worldY - viewportOffset.value.y) * scale - cy * dpr + cy * dpr,
  };
  // Simpler: keep cursor over same world point
  viewportOffset.value = {
    x: worldX * scale - cx * dpr,
    y: worldY * scale - cy * dpr,
  };
  zoom.value = next;
}

// ── Save / cancel ──────────────────────────────────────────────────────────

async function onSave(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  try {
    const payload = {
      name: name.value.trim() || "Untitled Map",
      description: null,
      layers: layers.value,
      metadata: (loadedMap.value as DungeonMap | null)?.metadata ?? {},
      default_pack_id: packId.value,
      tags: (loadedMap.value as DungeonMap | null)?.tags ?? [],
      notes: null as unknown,
    };
    if (isNew.value) {
      await createMutation.mutateAsync(payload);
    } else {
      await updateMutation.mutateAsync({ id: mapId.value, update: payload });
    }
    dirty.value = false;
    router.push("/cartographer");
  } finally {
    saving.value = false;
  }
}

function onCancel(): void {
  router.push("/cartographer");
}

async function onDelete(): Promise<void> {
  if (deleting.value || isNew.value || !mapId.value) return;
  const ok = await confirm(`Delete "${name.value || "this map"}"? This cannot be undone.`);
  if (!ok) return;
  deleting.value = true;
  try {
    await deleteMutation.mutateAsync(mapId.value);
    dirty.value = false;
    router.push("/cartographer");
  } finally {
    deleting.value = false;
  }
}

onBeforeRouteLeave((_to, _from, next) => {
  if (!dirty.value || saving.value || deleting.value) return next();
  const ok = window.confirm("Unsaved changes will be lost. Leave anyway?");
  next(ok);
});

// ── Lifecycle ──────────────────────────────────────────────────────────────

const map = computed(() => loadedMap.value);

function onResize(): void {
  scheduleRender();
}

function onKeyDown(ev: KeyboardEvent): void {
  // Don't hijack keys while the user is typing in the name input, a textarea, or
  // any other contenteditable target.
  const target = ev.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
    return;
  }
  // Leave OS shortcuts (Cmd/Ctrl/Alt combos) alone.
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

  const key = ev.key.toLowerCase();
  if (key === "c") {
    centerMap();
    ev.preventDefault();
    return;
  }
  const tool = TOOLS.find((t) => t.shortcut === key);
  if (tool && !tool.disabled) {
    activeTool.value = tool.id;
    ev.preventDefault();
  }
}

onMounted(async () => {
  await ensurePackLoaded();
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKeyDown);
  scheduleRender();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  window.removeEventListener("keydown", onKeyDown);
  if (rafId) cancelAnimationFrame(rafId);
});
</script>
