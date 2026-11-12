<template>
  <div class="flex flex-col gap-1.5" role="group" :aria-labelledby="labelId">
    <span :id="labelId" class="text-eyebrow uppercase text-muted-foreground">{{ label }}</span>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useId } from "vue";

/** A control with its name above it. The group is named by that label for assistive tech. */
defineProps<{ label: string }>();
const labelId = useId();
</script>
