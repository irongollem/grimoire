<template>
  <canvas ref="el" class="h-full w-full" :width="size" :height="size" aria-hidden="true" />
</template>

<script lang="ts">
export type ThumbnailFn = (layerId: string) => { width: number; height: number; data: Uint8ClampedArray } | null;
</script>

<script setup lang="ts">
import { onMounted, useTemplateRef, watch } from "vue";

/** A layer's thumbnail: a small canvas fed by the caller's pixel function; blank until it has pixels. */
const { thumbnail, layerId, size = 32, revision = 0 } = defineProps<{ thumbnail: ThumbnailFn | null; layerId: string; size?: number; revision?: number }>();
const el = useTemplateRef<HTMLCanvasElement>("el");

function draw() {
  const ctx = el.value?.getContext?.("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  const t = thumbnail?.(layerId);
  if (!t || t.width <= 0 || t.height <= 0) return;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(t.data), t.width, t.height), 0, 0);
}
onMounted(draw);
watch(() => [thumbnail, layerId, revision], draw);
</script>
