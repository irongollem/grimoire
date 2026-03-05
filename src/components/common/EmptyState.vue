<template>
  <div class="flex flex-col items-center justify-center py-16 text-center px-4">
    <!-- Icon slot or default scroll icon -->
    <div class="mb-4 text-muted-foreground/40">
      <slot name="icon">
        <Scroll class="h-16 w-16" />
      </slot>
    </div>

    <h3 class="font-cinzel text-lg font-semibold text-foreground mb-2">
      {{ title }}
    </h3>
    <p class="font-fell text-muted-foreground italic max-w-sm mb-6">
      {{ description }}
    </p>

    <slot name="action" />
  </div>
</template>

<script setup lang="ts">
import { Scroll } from 'lucide-vue-next'

defineProps<{
  title: string
  description: string
}>()
</script>
