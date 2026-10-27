<template>
  <template v-for="(part, i) in highlightParts(text, query)" :key="i">
    <mark v-if="part.hit" class="packs-mark">{{ part.text }}</mark>
    <template v-else>{{ part.text }}</template>
  </template>
</template>

<script setup lang="ts">
/** A name with the Packs search's matches marked: one place for the answer strip and the rows. */
import { highlightParts } from "@/lib/inventory/packSearch";

defineProps<{ text: string; query: string }>();
</script>

<style scoped>
/* Gilt where a theme has it. */
.packs-mark {
  background: color-mix(in oklab, var(--primary-fill, var(--primary)) 32%, transparent);
  color: inherit;
  border-radius: 0.125rem;
  padding: 0 0.0625rem;
}
</style>
