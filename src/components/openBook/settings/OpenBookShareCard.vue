<template>
  <div class="overflow-hidden rounded-lg border border-border bg-card">
    <div class="relative h-[10rem]" :style="{ backgroundColor: LEATHERS[leather].color }">
      <img v-if="coverImageUrl" :src="coverImageUrl" alt="" class="absolute inset-0 h-full w-full object-cover" />
      <div class="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-transparent" aria-hidden="true" />
      <div class="absolute inset-y-0 left-4 flex w-[13.5rem] flex-col justify-center gap-1.5">
        <span class="text-caption font-bold tracking-widest text-primary">AN OPEN BOOK</span>
        <span class="text-heading-sm tracking-wider text-primary">{{ title.toUpperCase() }}</span>
        <span v-if="subtitle" class="text-label-lg italic text-white/80">{{ subtitle }}</span>
        <span v-if="summary" class="text-caption text-white/60">{{ summary }}</span>
      </div>
    </div>
    <div class="flex flex-col gap-0.5 px-3.5 py-2.5">
      <span class="text-caption text-muted-foreground">{{ host }}</span>
      <span class="text-label-lg font-semibold text-foreground">{{ title }} · an Open Book</span>
      <span class="text-caption text-muted-foreground">{{ summary }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { OpenBookLeather, OpenBookStats } from "@/types/openBook.types";
import { LEATHERS } from "./leather";

const { stats } = defineProps<{
  title: string;
  subtitle: string | null;
  coverImageUrl: string | null;
  leather: OpenBookLeather;
  stats: OpenBookStats | null;
}>();

const host = window.location.host;
const summary = computed(() =>
  stats ? `${stats.places} places · ${stats.folk} people · ${stats.sessions} sessions` : "",
);
</script>
