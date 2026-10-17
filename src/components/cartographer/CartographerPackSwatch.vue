<template>
  <canvas ref="canvasEl" class="h-4 w-4 shrink-0 rounded-sm border border-border bg-muted" width="16" height="16" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
// A 1rem sample of a tile set's floor, so the bar names the set by what it looks like
// as well as what it is called. Drawn from the pack runtime the map already loaded;
// a tile whose art has not arrived stays the empty swatch.
import { onMounted, ref, watch } from "vue";
import type { TilePackRuntime } from "@/cartographer/packLoader";

const { runtime } = defineProps<{ runtime: TilePackRuntime | null }>();
const canvasEl = ref<HTMLCanvasElement | null>(null);

function draw(): void {
  const canvas = canvasEl.value;
  if (!canvas || !runtime || typeof canvas.getContext !== "function") return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  try {
    ctx.drawImage(runtime.getTile("floor", 0).source, 0, 0, canvas.width, canvas.height);
  } catch {
    // An image still decoding cannot be drawn yet; the swatch stays empty until the next change.
  }
}

onMounted(draw);
watch(() => runtime, draw);
</script>
