<template>
  <!-- "The narrator: plain print, no name. The world, the weather, and what nobody in particular did." (Voices, 02b) -->
  <div class="font-fell text-[1.0625rem] leading-[1.7] text-foreground">
    <p v-for="(paragraph, index) in paragraphs" :key="index" class="not-first:mt-3 whitespace-pre-line">{{ paragraph }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const { text } = defineProps<{ text: string }>();

// A blank line in the model's text is a paragraph break; a lone newline is left to whitespace-pre-line.
const paragraphs = computed(() => text.split(/\n{2,}/).filter((p) => p.trim() !== ""));
</script>
