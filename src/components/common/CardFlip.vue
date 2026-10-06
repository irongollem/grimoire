<template>
  <Transition name="card-flip" :css="!prefersReducedMotion()" mode="out-in">
    <div v-if="!flipped" key="front"><slot name="front" /></div>
    <div v-else key="back"><slot name="back" /></div>
  </Transition>
</template>

<script setup lang="ts">
import { prefersReducedMotion } from "@/lib/motion";

/** A card that turns over: the front scales to nothing on X, the back scales in. */
defineProps<{ flipped: boolean }>();
</script>

<style scoped>
.card-flip-enter-active,
.card-flip-leave-active {
  transition: transform 0.18s ease-in-out;
}
.card-flip-enter-from,
.card-flip-leave-to {
  transform: scaleX(0);
}
</style>
