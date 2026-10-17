<template>
  <canvas
    ref="canvasEl"
    class="block size-full object-contain"
    :class="placeholder ? 'opacity-50' : ''"
    width="112"
    height="112"
    aria-hidden="true"
  ></canvas>
</template>

<script setup lang="ts">
// One tile of the active set, drawn small: the object catalogue's thumbnail. It draws the
// pack runtime's own tile source, so what the DM sees is the art the map will stamp. A tile
// whose art is not painted yet is the runtime's stand-in, drawn dimmed so it reads as one.
import { onMounted, ref, watch } from "vue";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { PackCategory } from "@/cartographer/packSchema";

const { runtime, category, variant, side } = defineProps<{
  runtime: TilePackRuntime | null;
  category: PackCategory;
  variant: number;
  /** Stairs have one picture per side; the catalogue shows the north one. */
  side?: string;
}>();

const canvasEl = ref<HTMLCanvasElement | null>(null);
const placeholder = ref(false);

function draw(): void {
  const canvas = canvasEl.value;
  if (!canvas || !runtime || typeof canvas.getContext !== "function") return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const tile = runtime.getTile(category, variant, side);
  placeholder.value = tile.isPlaceholder;
  const source = tile.source;
  // A tile still decoding cannot be drawn: try again when it lands.
  if (source instanceof HTMLImageElement && !source.complete) {
    source.addEventListener("load", draw, { once: true });
    return;
  }
  try {
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  } catch {
    // An image that is not drawable yet leaves the tile empty until the next change.
  }
}

onMounted(draw);
watch(() => [runtime, category, variant, side], draw);
</script>
