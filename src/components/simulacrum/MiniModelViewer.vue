<template>
  <div class="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
    <model-viewer
      v-if="ready"
      :src="src"
      :poster="poster"
      :alt="alt ?? 'Miniature preview'"
      auto-rotate
      camera-controls
      loading="eager"
      reveal="auto"
      class="aspect-square h-full w-full"
    />
    <div v-else class="flex h-full w-full items-center justify-center">
      <img v-if="poster" :src="poster" :alt="alt ?? ''" class="h-full w-full object-cover opacity-60" />
      <IconLoading v-else class="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { IconLoading } from "@/lib/icons";

const { src, poster, alt } = defineProps<{
  src: string;
  poster?: string;
  alt?: string;
}>();

const ready = ref(false);

// Lazy chunk — @google/model-viewer only loads when a preview is actually shown.
onMounted(async () => {
  await import("@google/model-viewer");
  ready.value = true;
});
</script>
