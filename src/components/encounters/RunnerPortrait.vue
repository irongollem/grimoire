<template>
  <FocalImage
    v-if="src"
    :src="src"
    :alt="alt"
    :focal-point="focalPoint"
    format="portrait"
    class="runner-portrait"
    ai-badge="right"
  />
</template>

<script setup lang="ts">
/*
  The portrait at the top of each runner detail panel (NPC, PC, monster,
  companion). One component so the frame, its height cap and the AI label are
  decided once instead of in four byte-identical copies. Renders nothing when
  the combatant has no picture.
*/
import FocalImage from "@/components/common/FocalImage.vue";

const { src, alt, focalPoint = null } = defineProps<{
  src: string | null | undefined;
  alt: string;
  focalPoint?: { x: number; y: number } | null;
}>();
</script>

<style scoped>
@reference "@/assets/main.css";

.runner-portrait {
  @apply w-full rounded-md object-cover mb-1 overflow-hidden;
  max-height: 12.5rem;
}
</style>
