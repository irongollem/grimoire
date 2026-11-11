<template>
  <!-- Empty (and so hidden) unless a picture of this chapter is AI-made: the badge draws nothing for the rest. -->
  <div class="flex flex-wrap items-center gap-2 px-3 empty:hidden" data-testid="handout-ai-labels">
    <AiImageBadge v-for="src in srcs" :key="src" :src="src" inline />
  </div>
</template>

<script setup lang="ts">
/**
 * The AI-made label for a handout's pictures (#1176 story 10). It sits in the player's chrome beside the reader,
 * never on the paper: the chip does not print (provenance-architecture.md), and the label of record is in the
 * picture's own bytes. Which pictures are AI-made is the provenance registry's answer, per URL.
 */
import AiImageBadge from "@/components/common/ai/AiImageBadge.vue";

defineProps<{ srcs: string[] }>();
</script>
