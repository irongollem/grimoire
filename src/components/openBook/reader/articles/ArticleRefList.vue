<script setup lang="ts">
/** A short list of pages: places within, folk met here, the deities of a pantheon, sessions that name someone. */
import type { BookModel } from "@/lib/openBook/bookModel";
import ArticleEntryLink from "./ArticleEntryLink.vue";

export interface RefItem {
  id: string;
  /** Shown instead of the entry's own title when set. */
  label?: string | null;
  note?: string | null;
}

defineProps<{ model: BookModel; title: string; items: RefItem[] }>();
</script>

<template>
  <section v-if="items.length > 0" class="book-refs">
    <span class="book-eyebrow">{{ title }}</span>
    <div v-for="item in items" :key="item.id" class="book-ref">
      <ArticleEntryLink :model="model" :id="item.id" :label="item.label ?? null" />
      <span v-if="item.note" class="book-ref-note">{{ item.note }}</span>
    </div>
  </section>
</template>
