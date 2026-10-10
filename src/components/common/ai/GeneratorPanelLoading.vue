<template>
  <div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center" role="status" aria-live="polite">
    <BannerLoader class="h-10" />
  </div>
</template>

<script setup lang="ts">
/**
 * Shown while a generator panel's code downloads on its first open. The panel
 * is a lazy chunk now, so the click that opened it has nothing to show for a
 * moment on a slow connection; `AiGeneratorPanels` only mounts this after a
 * short delay, so a fast load shows nothing at all.
 */
import BannerLoader from "@/components/brand/BannerLoader.vue";
</script>
