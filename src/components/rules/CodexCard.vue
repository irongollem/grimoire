<template>
  <button
    type="button"
    class="rounded-lg border border-border bg-card overflow-hidden text-left hover:border-primary/50 transition-colors w-full"
    @click="emit('click')"
  >
    <!-- aspect-[3/4] matches the portrait focal-point format so the smart-crop
         centring math aligns with the actual display dimensions (previously h-44
         produced a ~1:1 container on mobile, mismatching the 2:3 crop target). -->
    <div class="aspect-[3/4] w-full shrink-0 overflow-hidden bg-muted">
      <FocalImage
        v-if="imageUrl"
        :src="imageUrl"
        :alt="title"
        format="portrait"
        :focal-point="focalPoint ?? null"
        class="w-full h-full"
      />
      <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/20">
        <component :is="fallbackIcon ?? IconBookMarked" class="h-10 w-10" />
      </div>
    </div>
    <div class="h-14 px-3 flex items-center gap-2 overflow-hidden">
      <div class="flex-1 min-w-0">
        <p class="font-cinzel text-sm font-bold text-foreground truncate leading-tight">{{ title }}</p>
        <p v-if="subtitle" class="font-fell text-xs text-muted-foreground italic truncate mt-0.5">{{ subtitle }}</p>
        <p v-if="meta" class="text-label text-muted-foreground mt-0.5 truncate">{{ meta }}</p>
      </div>
      <div v-if="badge || count" class="shrink-0 flex flex-col items-end gap-0.5">
        <span v-if="badge" class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-2xs text-muted-foreground capitalize">{{ badge }}</span>
        <span v-if="count" class="font-cinzel text-2xs text-muted-foreground/60">{{ count }}</span>
      </div>
    </div>
  </button>
</template>

<script setup lang="ts">
import type { Component } from "vue";
import { IconBookMarked } from '@/lib/icons';
import FocalImage from "@/components/common/FocalImage.vue";

const { imageUrl, focalPoint, fallbackIcon, title, subtitle, meta, badge, count } = defineProps<{
  imageUrl?: string | null;
  focalPoint?: { x: number; y: number } | null;
  fallbackIcon?: Component;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  badge?: string | null;
  count?: string | null;
}>();

const emit = defineEmits<{ click: [] }>();
</script>
