<template>
  <MaskIcon :src="src" :label="label" />
</template>

<script setup lang="ts">
import MaskIcon from "./MaskIcon.vue";

/**
 * Vitruvian Man glyph — the Simulacrum module icon (portrait → 3D miniature).
 * Source art lives in public/assets/simulacrum/vitruvian.svg.
 */
const { label = "Mini" } = defineProps<{ label?: string }>();

const src = `${import.meta.env.BASE_URL}assets/simulacrum/vitruvian.svg`;
</script>
