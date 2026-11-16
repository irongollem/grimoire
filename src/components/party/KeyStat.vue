<template>
  <span class="flex items-baseline justify-between gap-1 min-w-0">
    <span class="text-muted-foreground truncate">{{ label }}</span>
    <span class="flex items-baseline gap-1.5 shrink-0">
      <!-- Anything that sits beside the number, such as Perception's awareness roll. -->
      <slot />
      <span class="font-bold text-foreground" :title="title">{{ value }}</span>
    </span>
  </span>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  value: string | number;
  title?: string;
}>();
</script>
