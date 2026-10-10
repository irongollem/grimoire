<template>
  <div class="flex items-center justify-center" :class="fullPage ? 'min-h-screen' : 'py-12'">
    <div class="flex flex-col items-center gap-4">
      <BannerLoader class="h-14" />
      <p v-if="message" class="text-body text-muted-foreground italic">
        {{ message }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * A block that is still loading: the bookmark loader, centred, with room around
 * it and an optional line underneath. For a wait that sits inside a row, a
 * button or a line of text, use `BannerLoader` itself.
 */
import BannerLoader from "@/components/brand/BannerLoader.vue";

defineProps<{
  message?: string;
  fullPage?: boolean;
}>();
</script>
