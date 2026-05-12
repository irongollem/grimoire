<template>
  <div class="token-layer" :style="{ width: hostW + 'px', height: hostH + 'px' }">
    <div
      v-for="tok in renderedTokens"
      :key="tok.combatant.instance_id"
      class="token"
      :class="{ 'token-dead': tok.dead, 'token-draggable': tok.draggable }"
      :style="tokenStyle(tok)"
      :title="tok.combatant.name"
      @pointerdown="tok.draggable ? onTokenPointerDown(tok.combatant.instance_id, $event) : undefined"
    >
      <canvas
        :ref="(el) => registerCanvas(tok.combatant.instance_id, el as HTMLCanvasElement | null)"
        :width="canvasPx(tok.footprint)"
        :height="canvasPx(tok.footprint)"
        class="token-canvas"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { drawToken, type TokenEntity } from "@/lib/tokenRenderer";
import { sizeToFootprint } from "@/lib/tokenFootprint";
import { cellToPixel, snapPixelToCell } from "@/lib/tokenSnap";
import {
  DEFAULT_FACTIONS,
  type FactionDef,
  type RunCombatant,
} from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { Npc } from "@/types/npc.types";

const {
  hostW,
  hostH,
  cellPx,
  originX,
  originY,
  combatants,
  factions = [],
  monsters = [],
  activeInstanceId = null,
  draggableInstanceIds = null,
  hideHidden = false,
  silhouetteUnseen = false,
  onPositionChange,
} = defineProps<{
  hostW: number;
  hostH: number;
  cellPx: number;
  originX: number;
  originY: number;
  combatants: RunCombatant[];
  factions?: FactionDef[];
  monsters?: Monster[];
  npcs?: Npc[];
  activeInstanceId?: string | null;
  /** If null, all tokens are draggable. Pass an empty Set to make all
   *  read-only, or a specific set to limit drag to one combatant (player
   *  view: their own PC). */
  draggableInstanceIds?: Set<string> | null;
  /** When true, combatants with reveal_state="hidden" are omitted entirely
   *  (player view). DM view leaves this false. */
  hideHidden?: boolean;
  /** When true, combatants with reveal_state="unseen" render the "???"
   *  silhouette (player view). DM view leaves this false. */
  silhouetteUnseen?: boolean;
  onPositionChange?: (instanceId: string, position: { x: number; y: number }) => void;
}>();

// Token canvases render at a fixed pixel resolution per footprint cell.
// CSS scales them down to the current cellPx. 256 px is high-DPI-friendly
// without thrashing the renderer on every zoom step.
const TOKEN_CANVAS_PX_PER_CELL = 256;
function canvasPx(footprint: number): number {
  return TOKEN_CANVAS_PX_PER_CELL * footprint;
}

interface DraggingToken {
  instanceId: string;
  pointerId: number;
  startPxX: number;
  startPxY: number;
  startClientX: number;
  startClientY: number;
}
const dragging = ref<DraggingToken | null>(null);
// Only one token drags at a time, so a single-slot override beats a Map
// (no re-allocation on every pointermove).
const dragOverridePx = ref<{ instanceId: string; x: number; y: number } | null>(null);

interface RenderedToken {
  combatant: RunCombatant;
  footprint: number;
  pxX: number;
  pxY: number;
  factionColor: string;
  active: boolean;
  dead: boolean;
  draggable: boolean;
  silhouette: boolean;
}

// O(1) lookup maps. Without these, every renderedTokens recompute (60×/s
// during drag) does N × M Array.find calls; with 10 tokens and 50 monsters
// that's 500 finds per frame.
const monstersById = computed(() => {
  const m = new Map<string, Monster>();
  for (const monster of monsters) m.set(monster.id, monster);
  return m;
});
const factionColorById = computed(() => {
  const m = new Map<string, string>();
  const list = factions.length ? factions : DEFAULT_FACTIONS;
  for (const f of list) m.set(f.id, f.color);
  return m;
});

function getFootprint(combatant: RunCombatant): number {
  if (!combatant.monster_id) return 1; // NPCs are treated as Medium.
  return sizeToFootprint(monstersById.value.get(combatant.monster_id)?.size);
}

function getFactionColor(factionId: string): string {
  return factionColorById.value.get(factionId) ?? "#3b82f6";
}

function combatantToEntity(c: RunCombatant): TokenEntity {
  return {
    id: c.instance_id,
    name: c.name,
    subtitle: "",
    imageUrl: c.portrait_url ?? null,
    focalPoint: c.portrait_focal_point ?? null,
    bgGradient:
      c.type === "monster"
        ? ["#3b0a0a", "#0a0202"]
        : ["#1e3a5f", "#060d1a"],
  };
}

function isDraggable(instanceId: string): boolean {
  if (draggableInstanceIds === null) return true;
  return draggableInstanceIds.has(instanceId);
}

const renderedTokens = computed<RenderedToken[]>(() => {
  if (cellPx <= 0) return [];
  let originIndex = 0;
  const override = dragOverridePx.value;
  const result: RenderedToken[] = [];
  for (const c of combatants) {
    if (hideHidden && (c.reveal_state ?? "revealed") === "hidden") continue;
    const footprint = getFootprint(c);
    let cellX: number;
    let cellY: number;
    if (c.position) {
      cellX = c.position.x;
      cellY = c.position.y;
    } else {
      cellX = originIndex;
      cellY = 0;
      originIndex += 1;
    }
    const anchor = cellToPixel({ cellX, cellY, cellPx, originX, originY });
    const dragMatch = override && override.instanceId === c.instance_id ? override : null;
    result.push({
      combatant: c,
      footprint,
      pxX: dragMatch?.x ?? anchor.x,
      pxY: dragMatch?.y ?? anchor.y,
      factionColor: getFactionColor(c.faction_id),
      active: c.instance_id === activeInstanceId,
      dead: c.hp <= 0 && c.type === "monster",
      draggable: isDraggable(c.instance_id),
      silhouette: silhouetteUnseen && (c.reveal_state ?? "revealed") === "unseen",
    });
  }
  return result;
});

// ── Canvas rendering ──────────────────────────────────────────────────────

const canvasRefs = new Map<string, HTMLCanvasElement>();
const renderControllers = new Map<string, AbortController>();

function registerCanvas(instanceId: string, el: HTMLCanvasElement | null) {
  if (!el) {
    canvasRefs.delete(instanceId);
    return;
  }
  canvasRefs.set(instanceId, el);
}

async function renderTokenCanvas(tok: RenderedToken) {
  await nextTick();
  const canvas = canvasRefs.get(tok.combatant.instance_id);
  if (!canvas) return;
  const px = canvasPx(tok.footprint);
  if (canvas.width !== px) canvas.width = px;
  if (canvas.height !== px) canvas.height = px;

  renderControllers.get(tok.combatant.instance_id)?.abort();
  const controller = new AbortController();
  renderControllers.set(tok.combatant.instance_id, controller);

  await drawToken(canvas, combatantToEntity(tok.combatant), {
    ringColor: tok.factionColor,
    activeTurn: tok.active,
    revealState: tok.silhouette ? "unseen" : "revealed",
    signal: controller.signal,
  });
}

// Position changes via CSS, not the canvas, so dragging a token shouldn't
// redraw any token's canvas. Only redraw when a render-relevant input changes
// (faction colour, active glow, silhouette state, portrait, footprint, name).
const lastRenderKey = new Map<string, string>();
function renderKey(tok: RenderedToken): string {
  return [
    tok.factionColor,
    tok.active ? "1" : "0",
    tok.silhouette ? "1" : "0",
    tok.combatant.portrait_url ?? "",
    tok.footprint,
    tok.combatant.name,
  ].join("|");
}

watch(
  renderedTokens,
  (tokens) => {
    const liveIds = new Set<string>();
    for (const tok of tokens) {
      const id = tok.combatant.instance_id;
      liveIds.add(id);
      const key = renderKey(tok);
      if (lastRenderKey.get(id) === key) continue;
      lastRenderKey.set(id, key);
      void renderTokenCanvas(tok);
    }
    // Drop cache entries for tokens that no longer exist (mid-combat despawn).
    for (const id of lastRenderKey.keys()) {
      if (!liveIds.has(id)) lastRenderKey.delete(id);
    }
  },
  { deep: true, immediate: true },
);

// ── Drag handling ─────────────────────────────────────────────────────────

function onTokenPointerDown(instanceId: string, e: PointerEvent) {
  e.stopPropagation();
  e.preventDefault();
  const tok = renderedTokens.value.find((t) => t.combatant.instance_id === instanceId);
  if (!tok) return;
  dragging.value = {
    instanceId,
    pointerId: e.pointerId,
    startPxX: tok.pxX,
    startPxY: tok.pxY,
    startClientX: e.clientX,
    startClientY: e.clientY,
  };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  window.addEventListener("pointermove", onWindowPointerMove);
  window.addEventListener("pointerup", onWindowPointerUp);
  window.addEventListener("pointercancel", onWindowPointerUp);
}

function onWindowPointerMove(e: PointerEvent) {
  const drag = dragging.value;
  if (!drag || e.pointerId !== drag.pointerId) return;
  const dx = e.clientX - drag.startClientX;
  const dy = e.clientY - drag.startClientY;
  dragOverridePx.value = {
    instanceId: drag.instanceId,
    x: drag.startPxX + dx,
    y: drag.startPxY + dy,
  };
}

function onWindowPointerUp(e: PointerEvent) {
  const drag = dragging.value;
  if (!drag || e.pointerId !== drag.pointerId) return;
  const tok = renderedTokens.value.find((t) => t.combatant.instance_id === drag.instanceId);
  if (!tok) {
    cleanupDrag();
    return;
  }
  const dropCenterX = tok.pxX + (tok.footprint * cellPx) / 2;
  const dropCenterY = tok.pxY + (tok.footprint * cellPx) / 2;
  const snapped = snapPixelToCell({
    pixelX: dropCenterX,
    pixelY: dropCenterY,
    cellPx,
    originX,
    originY,
    footprint: tok.footprint,
  });
  onPositionChange?.(drag.instanceId, snapped);
  cleanupDrag();
}

function cleanupDrag() {
  dragging.value = null;
  dragOverridePx.value = null;
  window.removeEventListener("pointermove", onWindowPointerMove);
  window.removeEventListener("pointerup", onWindowPointerUp);
  window.removeEventListener("pointercancel", onWindowPointerUp);
}

function tokenStyle(tok: RenderedToken): Record<string, string> {
  const sizePx = tok.footprint * cellPx;
  return {
    left: `${tok.pxX}px`,
    top: `${tok.pxY}px`,
    width: `${sizePx}px`,
    height: `${sizePx}px`,
  };
}
</script>

<style scoped>
.token-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.token {
  position: absolute;
  pointer-events: auto;
  cursor: default;
  touch-action: none;
  user-select: none;
  transition: opacity 200ms ease;
}

.token-draggable {
  cursor: grab;
}

.token-draggable:active {
  cursor: grabbing;
}

.token-canvas {
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}

.token-dead {
  opacity: 0.5;
}
</style>
