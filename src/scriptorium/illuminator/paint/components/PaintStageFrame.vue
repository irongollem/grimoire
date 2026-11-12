<template>
  <div class="relative min-h-0 flex-1 bg-muted/40" data-testid="paint-stage-frame">
    <slot v-if="ready" />
    <!-- Until the brushes and the picture are ready there is no canvas to take a stroke, so the pen does nothing;
         the flag says why, rather than a drag silently going nowhere. -->
    <div v-else-if="!message" class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-body text-muted-foreground" data-testid="paint-loading">
      <BannerLoader class="h-10" />
      <span role="status">Getting the brushes ready…</span>
    </div>
    <p v-else role="alert" class="p-6 text-body text-muted-foreground">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import BannerLoader from "@/components/brand/BannerLoader.vue";

/** The painting canvas's frame: the stage once the session is ready, a loading flag before, or the reason it cannot start. */
defineProps<{ ready: boolean; message?: string }>();
</script>
