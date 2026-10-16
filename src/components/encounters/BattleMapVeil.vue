<template>
  <canvas
    ref="canvasEl"
    class="veil"
    :width="hostW"
    :height="hostH"
    :style="{ width: hostW + 'px', height: hostH + 'px' }"
  />
</template>

<script setup lang="ts">
// The darkness veil of a battle map (epic #1073): the map's ambient light level laid over the image once, and again
// when its inputs change. It runs no loop, and does not depend on motion: reduced-motion users get the veil too, it is
// still. The stack mounts it last, so room focus, tokens and fog stay above it.
//
// For now the DM and the players see the same translucent veil. Per-token vision (story 5) replaces it for players,
// and lights (story 4) carve it, both through `paintVeil` in `lib/battlemap/darkness.ts`.
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { paintVeil } from "@/lib/battlemap/darkness";
import type { DarknessLevel } from "@/types/dungeonMap.types";

const { hostW, hostH, panX, panY, imageW, imageH, darkness } = defineProps<{
  hostW: number;
  hostH: number;
  panX: number;
  panY: number;
  /** The image's drawn size on screen, in px: the veil covers exactly the map. */
  imageW: number;
  imageH: number;
  darkness: DarknessLevel;
}>();

const canvasEl = ref<HTMLCanvasElement | null>(null);

function draw(): void {
  const ctx = canvasEl.value?.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, hostW, hostH);
  paintVeil(ctx, { x: panX, y: panY, w: imageW, h: imageH }, darkness);
}

// Resizing a canvas clears it, and the host size is a prop, so redraw whenever any input changes.
watch(() => [hostW, hostH, panX, panY, imageW, imageH, darkness], draw, { flush: "post" });
onMounted(draw);
onBeforeUnmount(() => canvasEl.value?.getContext("2d")?.clearRect(0, 0, hostW, hostH));
</script>

<style scoped>
.veil {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
