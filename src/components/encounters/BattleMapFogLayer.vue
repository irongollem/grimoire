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
import { featherEdges, featherRect, type FogCellKey } from "@/lib/battlemap/fogMask";

const {
  hostW,
  hostH,
  cellPx,
  originX,
  originY,
  mask,
  opaque = false,
  seen = null,
} = defineProps<{
  hostW: number;
  hostH: number;
  cellPx: number;
  originX: number;
  originY: number;
  mask: Set<FogCellKey>;
  /** When true, fog renders fully opaque (player view, or DM "view as player"
   *  preview). When false, fog is translucent so the DM can still see the
   *  map beneath. */
  opaque?: boolean;
  /** The squares in view right now. When given, a revealed square outside it is only remembered and keeps a partial fog. */
  seen?: ReadonlySet<FogCellKey> | null;
}>();

/** The fog left on a square the party remembers but does not see now. */
const REMEMBERED_FOG = 0.5;

const canvasEl = ref<HTMLCanvasElement | null>(null);

function render() {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, hostW, hostH);
  if (cellPx <= 0 || hostW <= 0 || hostH <= 0) return;

  // Fill the entire viewport with fog, then punch holes for revealed cells.
  // A hidden cell stays fully opaque here, edge to edge — no exception is
  // ever made near a border (the maintainer's ruling: "a blocked cell
  // should be fully black").
  const baseColor = opaque ? "0, 0, 0" : "20, 22, 30";
  const baseAlpha = opaque ? 1 : 0.55;
  ctx.fillStyle = `rgba(${baseColor}, ${baseAlpha})`;
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

  // Remembered, not seen: put a flat half fog back over the punched square. Feathering below darkens only the
  // fully-fogged borders, so a remembered square is not feathered against a seen one.
  if (seen) {
    ctx.fillStyle = `rgba(${baseColor}, ${baseAlpha * REMEMBERED_FOG})`;
    for (const key of mask) {
      if (seen.has(key)) continue;
      const [xs, ys] = key.split(",");
      const px = originX + Number(xs) * cellPx;
      const py = originY + Number(ys) * cellPx;
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      if (px + cellPx < 0 || py + cellPx < 0 || px > hostW || py > hostH) continue;
      ctx.fillRect(px, py, cellPx, cellPx);
    }
  }

  // Feather: darken a thin band on the REVEALED side of every edge that
  // borders a hidden cell, fading to nothing half a cell in — see
  // `fogMask.ts`'s `featherEdges`/`featherRect` for the ruling this
  // implements. Drawn after the punch-holes above, so it re-darkens only the
  // sliver nearest the border rather than any hidden cell (those were never
  // punched, so they're untouched by this pass entirely).
  for (const edge of featherEdges(mask)) {
    const rect = featherRect(edge, cellPx, originX, originY);
    if (rect.x + rect.w < 0 || rect.y + rect.h < 0 || rect.x > hostW || rect.y > hostH) continue;
    const gradient = ctx.createLinearGradient(rect.gradient.x0, rect.gradient.y0, rect.gradient.x1, rect.gradient.y1);
    gradient.addColorStop(0, `rgba(${baseColor}, ${baseAlpha})`);
    gradient.addColorStop(1, `rgba(${baseColor}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
}

onMounted(render);

watch(
  () => [hostW, hostH, cellPx, originX, originY, mask, opaque, seen],
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
