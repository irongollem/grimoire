<template>
  <canvas
    ref="el"
    class="block"
    :style="{ width: `${pixels.width / scale / 16}rem`, height: `${pixels.height / scale / 16}rem` }"
    :aria-label="label"
    :role="label ? 'img' : undefined"
  />
</template>

<script setup lang="ts">
import { onMounted, useTemplateRef, watch } from "vue";
import type { PreviewPixels } from "../render/brushPreview";

/**
 * Paints a preview's pixels (from `renderBrushPreview` / `renderTipPreview`) into a canvas. The pixels are
 * rendered at `scale` times the size they show at, so a stroke stays crisp on a dense screen.
 */
const { pixels, scale = 2, label } = defineProps<{ pixels: PreviewPixels; scale?: number; label?: string }>();

const el = useTemplateRef<HTMLCanvasElement>("el");

function draw() {
  const canvas = el.value;
  if (!canvas) return;
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  // No 2D context where there is no canvas (the test DOM); the element still lays out.
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0);
}

onMounted(draw);
watch(() => pixels, draw);
</script>
