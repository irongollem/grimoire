<template>
  <!--
    The boxed thumbnail beside a sheet's name (species, backgrounds, classes,
    archetypes, traps, dungeon features). Low art (#1179, frame 04): "it goes, and
    the name starts the card", so with low art on this draws nothing at all, not
    an empty box. The Portrait button is not here: it sits beside the badges or
    under the name, which differs per sheet, so each sheet keeps `PortraitOnRequest`.
  -->
  <div
    v-if="!lowArt"
    class="relative shrink-0 w-28 aspect-square rounded-md overflow-hidden bg-muted flex items-center justify-center"
    :class="plate && 'card-plate'"
  >
    <FocalImage
      v-if="src || !$slots.fallback"
      :src="src"
      :alt="alt"
      format="portrait"
      :focal-point="focalPoint"
      :placeholder="placeholder"
      :lightbox="true"
      ai-badge="right"
      record
      class="w-full h-full"
    />
    <slot v-else name="fallback" />
  </div>
</template>

<script setup lang="ts">
import FocalImage from "@/components/common/media/FocalImage.vue";
import { useLowArt } from "@/composables/useLowArt";

const { src, focalPoint = null, plate = false } = defineProps<{
  src: string | null | undefined;
  alt: string;
  focalPoint?: { x: number; y: number } | null;
  placeholder?: string;
  /** The class sheets' framed look (`card-plate`). */
  plate?: boolean;
}>();

defineSlots<{ fallback?: () => unknown }>();

const { lowArt } = useLowArt();
</script>
