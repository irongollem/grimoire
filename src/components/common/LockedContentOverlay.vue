<template>
  <div class="relative">
    <div :class="locked ? 'pointer-events-none select-none' : ''">
      <slot />
    </div>
    <div
      v-if="locked"
      class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 rounded-lg bg-background/80 backdrop-blur-sm"
    >
      <IconLock class="h-4 w-4 text-muted-foreground" />
      <p class="text-label font-semibold text-muted-foreground text-center px-2">
        Locked
      </p>
      <RouterLink
        to="/billing"
        class="text-label text-primary/80 hover:text-primary transition-colors"
      >
        Upgrade to access
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconLock } from '@/lib/icons'

defineProps<{ locked: boolean }>()
</script>
