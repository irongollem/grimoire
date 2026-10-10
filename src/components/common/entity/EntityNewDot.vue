<template>
  <span
    v-if="isNew"
    class="rounded-full bg-destructive shrink-0"
    :class="sizeClass"
    :title="title"
    aria-label="New"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";

const { isNew, size = "md", title = "New" } = defineProps<{
  isNew: boolean;
  size?: "sm" | "md";
  title?: string;
}>();

const sizeClass = computed(() => (size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5"));
</script>
