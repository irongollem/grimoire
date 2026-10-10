<template>
  <MaskIcon :src="src" :label="label" />
</template>

<script setup lang="ts">
import MaskIcon from "./MaskIcon.vue";
import { artUrl } from "@/lib/assets/artUrl";

/**
 * Vitruvian Man glyph — the Simulacrum module icon (portrait → 3D miniature).
 * Source art lives in public/assets/simulacrum/vitruvian.svg.
 */
const { label = "Mini" } = defineProps<{ label?: string }>();

const src = artUrl("/assets/simulacrum/vitruvian.svg");
</script>
