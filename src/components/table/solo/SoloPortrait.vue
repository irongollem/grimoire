<template>
  <span
    class="row-span-2 flex size-10 shrink-0 items-center justify-center overflow-hidden border-2 border-(--voice) bg-muted font-cinzel font-bold text-muted-foreground"
    role="img"
    :aria-label="`Portrait of ${name}`"
  >
    <FocalImage v-if="src" :src="src" :alt="name" format="token" :render-width="200" :focal-point="focalPoint" record class="size-full" />
    <span v-else aria-hidden="true">{{ name.charAt(0).toUpperCase() }}</span>
  </span>
</template>

<script setup lang="ts">
import FocalImage from "@/components/common/media/FocalImage.vue";

const { name, src = null, focalPoint = null } = defineProps<{
  name: string;
  src?: string | null;
  focalPoint?: { x: number; y: number } | null;
}>();
</script>
