<template>
  <div class="mb-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="font-cinzel text-2xl md:text-3xl font-bold text-foreground tracking-wide">
          {{ title }}
        </h1>
        <p v-if="description" class="font-fell text-muted-foreground mt-1 italic">
          {{ description }}
        </p>
      </div>
      <div v-if="$slots.actions" class="shrink-0">
        <slot name="actions" />
      </div>
    </div>
    <div class="gold-divider mt-4" />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>
