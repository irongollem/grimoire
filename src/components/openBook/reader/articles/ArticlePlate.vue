<script setup lang="ts">
/**
 * An image tipped onto the page. No source, no plate: a missing picture leaves nothing behind, never a broken
 * box. Every picture is shown whole: a plate never crops, and one that opens an entry is sized to its page by
 * the stylesheet. Pins and other overlays come in through the default slot.
 */
type PlateShape = "portrait" | "square" | "whole";

const {
  src,
  alt,
  shape = "whole",
  caption = null,
} = defineProps<{
  src: string | null;
  alt: string;
  shape?: PlateShape;
  caption?: string | null;
}>();
</script>

<template>
  <figure v-if="src" :class="['book-plate', `book-plate-${shape}`, shape === 'portrait' && 'book-plate-narrow']">
    <div class="book-plate-frame">
      <div class="book-plate-inner">
        <img :src="src" :alt="alt" loading="lazy" />
        <slot />
      </div>
    </div>
    <figcaption v-if="caption" class="book-caption">{{ caption }}</figcaption>
  </figure>
</template>
