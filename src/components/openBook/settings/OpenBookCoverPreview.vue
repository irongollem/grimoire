<template>
  <div class="flex justify-center rounded-md border border-border bg-muted/40 p-7">
    <div
      class="relative h-[14.5rem] w-44 overflow-hidden rounded-l-sm rounded-r-md shadow-lg"
      :style="{ backgroundColor: LEATHERS[leather].color }"
    >
      <img
        v-if="coverArt !== 'tooled' && coverImageUrl"
        :src="coverImageUrl"
        alt=""
        class="absolute object-cover"
        :class="coverArt === 'plate' ? 'bottom-4 left-6 right-4 top-20' : 'inset-0 h-full w-full'"
      />
      <span class="absolute inset-y-0 left-0 w-3 bg-black/35" aria-hidden="true" />
      <div
        class="absolute left-6 right-3 top-[1.125rem] border border-primary/70 px-1 py-2 text-center shadow-md"
        :style="{ backgroundColor: LEATHERS[leather].color }"
      >
        <span class="block text-label text-primary">{{ title.toUpperCase() }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { OpenBookCoverArt, OpenBookLeather } from "@/types/openBook.types";
import { LEATHERS } from "./leather";

defineProps<{
  title: string;
  coverArt: OpenBookCoverArt;
  coverImageUrl: string | null;
  leather: OpenBookLeather;
}>();
</script>
