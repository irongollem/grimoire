<template>
  <!-- A quiet line in the margin: what was looked up or rolled for, where the party is, what went on record. It names the
       thing and never the answer, which can hold what the character has not found yet (Turn, 04). -->
  <span class="text-eyebrow flex items-center gap-2 tracking-wider text-muted-foreground before:h-px before:w-5 before:bg-input">
    {{ text }}<span v-if="count > 1" class="font-normal"> x{{ count }}</span>
  </span>
</template>

<script setup lang="ts">
const { count = 1 } = defineProps<{ text: string; count?: number }>();
</script>
