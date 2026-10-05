<template>
  <label class="block min-w-0">
    <span class="block text-eyebrow text-muted-foreground mb-1.5">{{ label }}</span>
    <slot />
    <span v-if="hint" class="block text-caption text-muted-foreground mt-1">{{ hint }}</span>
  </label>
</template>

<script setup lang="ts">
/** A captioned field in the mechanics editor; the caption is the label of the control in the slot. */
defineProps<{ label: string; hint?: string }>();
</script>
