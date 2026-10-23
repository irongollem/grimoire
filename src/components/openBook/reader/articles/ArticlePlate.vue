<script setup lang="ts">
/**
 * An image tipped onto the page. No source, no plate: a missing picture leaves nothing behind, never a broken
 * box. A portrait goes through FocalImage so the stored focal point decides the crop; a map or emblem is shown
 * whole. Pins and other overlays come in through the default slot.
 */
import FocalImage from "@/components/common/media/FocalImage.vue";

type PlateShape = "portrait" | "square" | "whole";

const {
  src,
  alt,
  shape = "whole",
  focalPoint = null,
  caption = null,
} = defineProps<{
  src: string | null;
  alt: string;
  shape?: PlateShape;
  focalPoint?: { x: number; y: number } | null;
  caption?: string | null;
}>();
</script>

<template>
  <figure v-if="src" :class="['book-plate', `book-plate-${shape}`, shape === 'portrait' && 'book-plate-narrow']">
    <div class="book-plate-frame">
      <div class="book-plate-inner">
        <FocalImage v-if="shape === 'portrait'" :src="src" :alt="alt" format="portrait" :focal-point="focalPoint" />
        <img v-else :src="src" :alt="alt" loading="lazy" />
        <slot />
      </div>
    </div>
    <figcaption v-if="caption" class="book-caption">{{ caption }}</figcaption>
  </figure>
</template>
