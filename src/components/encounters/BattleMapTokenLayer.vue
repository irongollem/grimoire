<template>
  <div class="token-layer" :style="{ width: hostW + 'px', height: hostH + 'px' }">
    <div
      v-for="tok in renderedTokens"
      :key="tok.combatant.instance_id"
      class="token"
      :class="{ 'token-dead': tok.dead }"
      :style="tokenStyle(tok)"
      :title="tok.combatant.name"
      @pointerdown.stop.prevent="onTokenPointerDown(tok.combatant.instance_id, $event)"
    >
      <canvas
        :ref="(el) => registerCanvas(tok.combatant.instance_id, el as HTMLCanvasElement | null)"
        :width="tokenCanvasSize"
        :height="tokenCanvasSize"
        class="token-canvas"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { drawToken, type TokenEntity } from "@/lib/tokenRenderer";
import { sizeToFootprint } from "@/lib/tokenFootprint";
import { cellToPixel, snapPixelToCell } from "@/lib/tokenSnap";
import { DEFAULT_FACTIONS, type RunCombatant } from "@/types/encounter.types";

const {
  hostW,
  hostH,
  cellPx,
  originX,
  originY,
  onPositionChange,
} = defineProps<{
  hostW: number;
  hostH: number;
  cellPx: number;
  originX: number;
  originY: number;
  /**
   * Called after a drag finishes and the store has been updated locally so
   * the host can push state over the realtime channel.
   */
  onPositionChange?: () => void;
}>();

const store = useEncounterRunStore();

// Render token canvases at a fixed pixel resolution and CSS-scale them to the
// current cell size. 256 px per cell is high-DPI-friendly without thrashing
// the renderer on every zoom step.
const TOKEN_CANVAS_PX_PER_CELL = 256;

const tokenCanvasSize = computed(() => TOKEN_CANVAS_PX_PER_CELL); // square per footprint cell

interface DraggingToken {
  instanceId: string;
  pointerId: number;
  startPxX: number;
  startPxY: number;
  startClientX: number;
  startClientY: number;
}
const dragging = ref<DraggingToken | null>(null);
const dragOverridePx = ref<Map<string, { x: number; y: number }>>(new Map());

// ── Token data ────────────────────────────────────────────────────────────

interface RenderedToken {
  combatant: RunCombatant;
  footprint: number;
  pxX: number;
  pxY: number;
  factionColor: string;
  active: boolean;
  dead: boolean;
}

function getFootprint(combatant: RunCombatant): number {
  if (combatant.monster_id) {
    const monster = store.availableMonsters.find((m) => m.id === combatant.monster_id);
    return sizeToFootprint(monster?.stat_block?.size as string | undefined);
  }
  if (combatant.npc_id) {
    const npc = store.availableNpcs.find((n) => n.id === combatant.npc_id);
    return sizeToFootprint(npc?.stat_block?.size as string | undefined);
  }
  return 1;
}

function getFactionColor(factionId: string): string {
  const factions = store.factions.length ? store.factions : DEFAULT_FACTIONS;
  return factions.find((f) => f.id === factionId)?.color ?? "#3b82f6";
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

const activeInstanceId = computed(() => store.activeCombatant?.instance_id ?? null);

const renderedTokens = computed<RenderedToken[]>(() => {
  if (cellPx <= 0) return [];
  let originIndex = 0;
  return store.combatants.map((c) => {
    const footprint = getFootprint(c);
    let cellX: number;
    let cellY: number;
    if (c.position) {
      cellX = c.position.x;
      cellY = c.position.y;
    } else {
      // Stagger unplaced combatants at the origin row.
      cellX = originIndex;
      cellY = 0;
      originIndex += 1;
    }
    const anchor = cellToPixel({ cellX, cellY, cellPx, originX, originY });
    const override = dragOverridePx.value.get(c.instance_id);
    return {
      combatant: c,
      footprint,
      pxX: override?.x ?? anchor.x,
      pxY: override?.y ?? anchor.y,
      factionColor: getFactionColor(c.faction_id),
      active: c.instance_id === activeInstanceId.value,
      dead: c.hp <= 0 && c.type === "monster",
    };
  });
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
  // Pixel size scales with footprint so the rendered token's resolution
  // stays sharp for Large/Huge/Gargantuan creatures.
  const px = TOKEN_CANVAS_PX_PER_CELL * tok.footprint;
  if (canvas.width !== px) canvas.width = px;
  if (canvas.height !== px) canvas.height = px;

  // Abort an earlier in-flight render for the same token.
  renderControllers.get(tok.combatant.instance_id)?.abort();
  const controller = new AbortController();
  renderControllers.set(tok.combatant.instance_id, controller);

  await drawToken(canvas, combatantToEntity(tok.combatant), {
    ringColor: tok.factionColor,
    activeTurn: tok.active,
    revealState: tok.combatant.reveal_state ?? "revealed",
    signal: controller.signal,
  });
}

watch(
  renderedTokens,
  (tokens) => {
    for (const tok of tokens) void renderTokenCanvas(tok);
  },
  { deep: true, immediate: true },
);

// ── Drag handling ─────────────────────────────────────────────────────────

function onTokenPointerDown(instanceId: string, e: PointerEvent) {
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
  dragOverridePx.value.set(drag.instanceId, {
    x: drag.startPxX + dx,
    y: drag.startPxY + dy,
  });
  // Trigger reactivity (Map mutation isn't reactive in Vue's deep-equality model)
  dragOverridePx.value = new Map(dragOverridePx.value);
}

function onWindowPointerUp(e: PointerEvent) {
  const drag = dragging.value;
  if (!drag || e.pointerId !== drag.pointerId) return;
  const tok = renderedTokens.value.find((t) => t.combatant.instance_id === drag.instanceId);
  if (!tok) {
    cleanupDrag();
    return;
  }
  // Snap drop center (token center, not top-left) to nearest cell.
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
  const target = store.combatants.find((c) => c.instance_id === drag.instanceId);
  if (target) {
    target.position = snapped;
    onPositionChange?.();
  }
  cleanupDrag();
}

function cleanupDrag() {
  dragging.value = null;
  dragOverridePx.value = new Map();
  window.removeEventListener("pointermove", onWindowPointerMove);
  window.removeEventListener("pointerup", onWindowPointerUp);
  window.removeEventListener("pointercancel", onWindowPointerUp);
}

// ── Styling ───────────────────────────────────────────────────────────────

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
  cursor: grab;
  touch-action: none;
  user-select: none;
  transition: opacity 200ms ease;
}

.token:active {
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
