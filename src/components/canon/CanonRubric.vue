<template>
  <h2 class="m-0 flex items-center gap-2.5 font-cinzel text-heading-sm font-bold uppercase tracking-wider text-primary">
    {{ numeral }} · {{ title }}
    <span aria-hidden="true" class="h-px flex-1 bg-linear-to-r from-primary/40 to-transparent" />
  </h2>
</template>

<script setup lang="ts">
/** A part's rubric: the numeral and name in small capitals, ruled out to the margin, as the design heads each part. */
defineProps<{ numeral: string; title: string }>();
</script>
