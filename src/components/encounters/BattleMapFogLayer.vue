<template>
  <canvas
    ref="canvasEl"
    class="fog-layer"
    :width="hostW"
    :height="hostH"
    :style="{ width: hostW + 'px', height: hostH + 'px' }"
  />
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type { CellKey } from "@/lib/fogMask";

const {
  hostW,
  hostH,
  cellPx,
  originX,
  originY,
  mask,
  opaque = false,
} = defineProps<{
  hostW: number;
  hostH: number;
  cellPx: number;
  originX: number;
  originY: number;
  mask: Set<CellKey>;
  /** When true, fog renders fully opaque (player view, or DM "view as player"
   *  preview). When false, fog is translucent so the DM can still see the
   *  map beneath. */
  opaque?: boolean;
}>();

const canvasEl = ref<HTMLCanvasElement | null>(null);

function render() {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, hostW, hostH);
  if (cellPx <= 0 || hostW <= 0 || hostH <= 0) return;

  // Fill the entire viewport with fog, then punch holes for revealed cells.
  ctx.fillStyle = opaque ? "rgba(0, 0, 0, 1)" : "rgba(20, 22, 30, 0.55)";
  ctx.fillRect(0, 0, hostW, hostH);

  if (mask.size === 0) return;
  ctx.globalCompositeOperation = "destination-out";
  for (const key of mask) {
    const [xs, ys] = key.split(",");
    const cx = Number(xs);
    const cy = Number(ys);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    const px = originX + cx * cellPx;
    const py = originY + cy * cellPx;
    // Skip cells fully outside the viewport for efficiency.
    if (px + cellPx < 0 || py + cellPx < 0 || px > hostW || py > hostH) continue;
    ctx.fillRect(px, py, cellPx, cellPx);
  }
  ctx.globalCompositeOperation = "source-over";
}

onMounted(render);

watch(
  () => [hostW, hostH, cellPx, originX, originY, mask, opaque],
  () => render(),
  { deep: true },
);
</script>

<style scoped>
.fog-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* Tokens hidden under fog should disappear visually too — the player view
   * handles that with a separate token filter; this layer is purely visual. */
}
</style>
