<script setup lang="ts">
/** One labelled row of an entry's facts table. */
defineProps<{ label: string }>();
</script>

<template>
  <div class="book-attr">
    <span class="book-eyebrow">{{ label }}</span>
    <span><slot /></span>
  </div>
</template>
